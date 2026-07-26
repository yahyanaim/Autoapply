import type { FormField, JobPageAdapter } from '../adapters/types';
import { GreenhouseAdapter } from '../adapters/greenhouse/adapter';
import { LeverAdapter } from '../adapters/lever/adapter';
import { AshbyAdapter } from '../adapters/ashby/adapter';
import { injectOverlay } from '../overlay/inject-overlay';

interface MatchResult {
  matchScore: number;
  explanation: string;
  missingKeywords: string[];
  weakSections: string[];
}

interface AutofillProfile {
  email: string;
  fullName: string;
  location: string;
}

const adapters: JobPageAdapter[] = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new AshbyAdapter(),
];

function getAdapterForUrl(url: string): JobPageAdapter | null {
  return adapters.find((adapter) => adapter.canHandle(url)) ?? null;
}

function sendRuntimeMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function valueForField(field: FormField, profile: AutofillProfile): string {
  const identifier = `${field.id} ${field.label}`.toLowerCase().replace(/[_-]+/g, ' ');
  const names = profile.fullName.trim().split(/\s+/).filter(Boolean);
  if (field.type === 'email' || identifier.includes('email')) return profile.email;
  if (identifier.includes('first name') || identifier.includes('given name')) {
    return names[0] ?? '';
  }
  if (identifier.includes('last name') || identifier.includes('family name') || identifier.includes('surname')) {
    return names.slice(1).join(' ') || names[0] || '';
  }
  if (
    identifier.includes('full name') ||
    identifier.includes('your name') ||
    ['name', 'applicant name'].includes(field.id.toLowerCase())
  ) {
    return profile.fullName;
  }
  if (identifier.includes('location') || identifier.includes('city')) return profile.location;
  return '';
}

async function autofill(adapter: JobPageAdapter): Promise<number> {
  const response = await sendRuntimeMessage<{
    profile?: AutofillProfile;
    error?: string;
  }>({ type: 'GET_AUTOFILL_PROFILE' });

  if (!response.profile) {
    throw new Error(response.error || 'Profile data is unavailable');
  }

  let filled = 0;
  for (const field of adapter.findFormFields()) {
    const value = valueForField(field, response.profile);
    if (value && adapter.fillField(field.id, value)) filled += 1;
  }

  if (filled === 0) {
    throw new Error('No supported fields were found on this form');
  }
  return filled;
}

async function analyzeCurrentPage(showOverlay: boolean): Promise<MatchResult> {
  const adapter = getAdapterForUrl(window.location.href);
  if (!adapter || !adapter.detectJobPosting()) {
    throw new Error('This page is not a supported job posting');
  }

  const jobData = adapter.extractJobDescription();
  if (!jobData) throw new Error('Could not read the job description');

  const response = await sendRuntimeMessage<{ result?: MatchResult; error?: string }>({
    type: 'GET_MATCH_SCORE',
    payload: { jobDescription: jobData.description },
  });
  if (!response.result) throw new Error(response.error || 'Match scoring failed');

  if (showOverlay) {
    document.getElementById('applyai-extension-host')?.remove();
    const container = document.createElement('div');
    container.id = 'applyai-extension-host';
    document.body.appendChild(container);
    injectOverlay(
      container,
      response.result.matchScore,
      `${adapter.name}:${jobData.url}`,
      () => autofill(adapter),
    );
  }

  return response.result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'TRIGGER_ANALYSIS' && message?.type !== 'GET_MATCH_SCORE') {
    return false;
  }

  void analyzeCurrentPage(message.type === 'TRIGGER_ANALYSIS')
    .then((result) => sendResponse({ result }))
    .catch((error: unknown) =>
      sendResponse({ error: error instanceof Error ? error.message : 'Analysis failed' }),
    );
  return true;
});

function init(): void {
  void analyzeCurrentPage(true).catch(() => {
    // The popup remains available for sign-in, resume selection, and manual retry.
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
