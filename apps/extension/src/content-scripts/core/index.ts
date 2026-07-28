import type { JobDescription, JobPageAdapter } from '../adapters/types';
import { GreenhouseAdapter } from '../adapters/greenhouse/adapter';
import { LeverAdapter } from '../adapters/lever/adapter';
import { AshbyAdapter } from '../adapters/ashby/adapter';
import { MoroccoJobBoardAdapter } from '../adapters/morocco/adapter';
import { injectOverlay } from '../overlay/inject-overlay';
import {
  AutofillProfile,
  valueForField,
} from './autofill-profile';

interface MatchResult {
  matchScore: number;
  confidence: number;
  explanation: string[];
  missingKeywords: string[];
  weakSections: string[];
}

interface ApprovedPackage {
  applicationId: string;
  contact: {
    email?: string;
    fullName?: string;
    location?: string;
    phone?: string;
    linkedInUrl?: string;
    portfolioUrl?: string;
  };
  coverLetter: string;
  resumeBase64: string;
  resumeFilename: string;
}

const adapters: JobPageAdapter[] = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new AshbyAdapter(),
  new MoroccoJobBoardAdapter(),
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

async function prepareApplication(job: JobDescription): Promise<{
  applicationId: string;
  reviewUrl: string;
}> {
  const response = await sendRuntimeMessage<{
    applicationId?: string;
    reviewUrl?: string;
    error?: string;
  }>({
    type: 'PREPARE_APPLICATION',
    payload: {
      ...job,
      source: new URL(job.url).hostname,
    },
  });
  if (!response.applicationId || !response.reviewUrl) {
    throw new Error(response.error || 'Application preparation failed');
  }
  return {
    applicationId: response.applicationId,
    reviewUrl: response.reviewUrl,
  };
}

async function fillApprovedPackage(
  adapter: JobPageAdapter,
  sourceUrl: string,
): Promise<number> {
  const response = await sendRuntimeMessage<{
    package?: ApprovedPackage;
    error?: string;
  }>({
    type: 'GET_APPROVED_PACKAGE',
    payload: { sourceUrl },
  });
  if (!response.package) {
    throw new Error(response.error || 'Approve the package in ApplyAI first');
  }

  const applicationPackage = response.package;
  const profile: AutofillProfile = {
    email: applicationPackage.contact.email ?? '',
    fullName: applicationPackage.contact.fullName ?? '',
    location: applicationPackage.contact.location ?? '',
    phone: applicationPackage.contact.phone ?? '',
    linkedInUrl: applicationPackage.contact.linkedInUrl ?? '',
    portfolioUrl: applicationPackage.contact.portfolioUrl ?? '',
  };
  let filled = 0;
  for (const field of adapter.findFormFields()) {
    const value = valueForField(field, profile);
    if (value && adapter.fillField(field.id, value)) filled += 1;
  }
  if (fillCoverLetter(applicationPackage.coverLetter)) filled += 1;
  if (
    attachResume(
      applicationPackage.resumeBase64,
      applicationPackage.resumeFilename,
    )
  ) {
    filled += 1;
  }
  if (!filled) {
    throw new Error(
      'The approved package is ready, but no supported application fields were found',
    );
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
    payload: {
      jobDescription: `${jobData.title}\n${jobData.description}`.slice(
        0,
        50_000,
      ),
    },
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
      response.result.confidence,
      response.result.explanation,
      response.result.missingKeywords,
      () => prepareApplication(jobData),
      () => fillApprovedPackage(adapter, jobData.url),
    );
  }

  return response.result;
}

function fillCoverLetter(content: string): boolean {
  const fields = Array.from(
    document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(
      'form textarea, form input[type="text"]',
    ),
  );
  const field = fields.find((candidate) => {
    const label =
      candidate.labels?.[0]?.innerText ||
      candidate.getAttribute('aria-label') ||
      candidate.placeholder ||
      candidate.name ||
      candidate.id;
    return /cover\s*letter|motivation|lettre\s+de\s+motivation/i.test(label);
  });
  if (!field || field.value.trim() || field.disabled || field.readOnly) return false;
  setNativeValue(field, content);
  return true;
}

function attachResume(base64: string, filename: string): boolean {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('form input[type="file"]'),
  );
  const input = inputs.find((candidate) => {
    const label =
      candidate.labels?.[0]?.innerText ||
      candidate.getAttribute('aria-label') ||
      candidate.name ||
      candidate.id;
    return /resume|curriculum|\bcv\b/i.test(label);
  });
  if (!input || input.disabled) return false;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const file = new File([bytes], filename, { type: 'application/pdf' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return input.files?.length === 1;
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
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
