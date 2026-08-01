import { AuthManager } from '../auth/auth-manager';
import { DASHBOARD_BASE_URL } from '../../shared/config';

type MessageType =
  | 'GET_MATCH_SCORE'
  | 'PREPARE_APPLICATION'
  | 'GET_APPROVED_PACKAGE'
  | 'GET_AUTOFILL_PROFILE'
  | 'GET_AUTH_STATE'
  | 'LOGOUT'
  | 'LIST_RESUMES';

interface Message {
  type: MessageType;
  payload?: Record<string, unknown>;
}

interface ResumeSummary {
  id: string;
  fileName: string | null;
  isPrimary: boolean;
  parseStatus: 'pending' | 'processing' | 'ready' | 'failed';
}

export class MessageRouter {
  constructor(private readonly authManager: AuthManager) {}

  async handleMessage(
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): Promise<void> {
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ error: 'Untrusted message sender' });
      return;
    }

    try {
      switch (message.type) {
        case 'GET_MATCH_SCORE':
          await this.handleGetMatchScore(message, sendResponse);
          return;
        case 'PREPARE_APPLICATION':
          await this.handlePrepareApplication(message, sendResponse);
          return;
        case 'GET_APPROVED_PACKAGE':
          await this.handleGetApprovedPackage(message, sendResponse);
          return;
        case 'GET_AUTOFILL_PROFILE':
          await this.handleGetAutofillProfile(sendResponse);
          return;
        case 'GET_AUTH_STATE':
          sendResponse({
            authenticated: await this.authManager.isAuthenticated(),
          });
          return;
        case 'LOGOUT':
          await this.authManager.logout();
          sendResponse({ success: true });
          return;
        case 'LIST_RESUMES':
          sendResponse({ resumes: await this.listResumes() });
          return;
        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      sendResponse({
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  }

  private async handlePrepareApplication(
    message: Message,
    sendResponse: (response: unknown) => void,
  ): Promise<void> {
    const job = (message.payload ?? {}) as {
      title?: string;
      company?: string;
      description?: string;
      url?: string;
      location?: string;
      source?: string;
    };
    if (!job.title?.trim() || !job.description?.trim() || !job.url?.trim()) {
      throw new Error('The job page could not be captured');
    }
    const settings = await chrome.storage.local.get('selectedResume');
    const resumeId =
      typeof settings.selectedResume === 'string'
        ? settings.selectedResume
        : '';
    if (!resumeId) {
      sendResponse({
        error: 'Choose a resume in extension settings',
        requiresResume: true,
      });
      return;
    }

    const captureResponse = await this.authManager.apiFetch('/jobs/capture', {
      method: 'POST',
      body: JSON.stringify({
        title: job.title,
        companyName: job.company,
        description: job.description,
        sourceUrl: job.url,
        location: job.location,
        source: job.source,
      }),
    });
    if (!captureResponse.ok) {
      throw new Error(
        await this.readError(captureResponse, 'Failed to capture job'),
      );
    }
    const captured = (await captureResponse.json()) as { id: string };
    const idempotencyStorageKey = `prepareIdempotency:${resumeId}:${captured.id}`;
    const storedIdempotency = await chrome.storage.local.get(
      idempotencyStorageKey,
    );
    const idempotencyKey =
      typeof storedIdempotency[idempotencyStorageKey] === 'string'
        ? storedIdempotency[idempotencyStorageKey]
        : `extension-prepare:${crypto.randomUUID()}`;
    if (storedIdempotency[idempotencyStorageKey] !== idempotencyKey) {
      await chrome.storage.local.set({
        [idempotencyStorageKey]: idempotencyKey,
      });
    }
    const preparationResponse = await this.authManager.apiFetch(
      '/applications/prepare',
      {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ jobId: captured.id, resumeId }),
      },
    );
    if (!preparationResponse.ok) {
      throw new Error(
        await this.readError(
          preparationResponse,
          'Failed to prepare application package',
        ),
      );
    }
    const application = (await preparationResponse.json()) as { id: string };
    await chrome.storage.local.remove(idempotencyStorageKey);
    sendResponse({
      applicationId: application.id,
      reviewUrl: `${DASHBOARD_BASE_URL}/applications/${application.id}`,
    });
  }

  private async handleGetApprovedPackage(
    message: Message,
    sendResponse: (response: unknown) => void,
  ): Promise<void> {
    const sourceUrl = (message.payload ?? {}).sourceUrl;
    if (typeof sourceUrl !== 'string' || !sourceUrl.trim()) {
      throw new Error('Missing job URL');
    }
    const packageResponse = await this.authManager.apiFetch(
      `/applications/approved-package?sourceUrl=${encodeURIComponent(sourceUrl)}`,
    );
    if (!packageResponse.ok) {
      throw new Error(
        await this.readError(
          packageResponse,
          'Approve the application package in ApplyAI first',
        ),
      );
    }
    const applicationPackage = (await packageResponse.json()) as {
      applicationId: string;
      contact: Record<string, string>;
      coverLetter: string;
      resumeDownloadPath: string;
    };
    const resumeResponse = await this.authManager.apiFetch(
      applicationPackage.resumeDownloadPath,
    );
    if (!resumeResponse.ok) {
      throw new Error(
        await this.readError(resumeResponse, 'Failed to load approved CV'),
      );
    }
    const resumeBase64 = bytesToBase64(
      new Uint8Array(await resumeResponse.arrayBuffer()),
    );
    sendResponse({
      package: {
        ...applicationPackage,
        resumeBase64,
        resumeFilename: 'ApplyAI-approved-CV.pdf',
      },
    });
  }

  private async handleGetMatchScore(
    message: Message,
    sendResponse: (response: unknown) => void,
  ): Promise<void> {
    const { jobDescription } = (message.payload ?? {}) as {
      jobDescription?: string;
    };
    if (!jobDescription?.trim()) {
      throw new Error('Missing job description');
    }

    const settings = await chrome.storage.local.get('selectedResume');
    const resumeId =
      typeof settings.selectedResume === 'string'
        ? settings.selectedResume
        : '';
    if (!resumeId) {
      sendResponse({
        error: 'Choose a resume in extension settings',
        requiresResume: true,
      });
      return;
    }

    const response = await this.authManager.apiFetch('/ai/match-score-text', {
      method: 'POST',
      body: JSON.stringify({ resumeId, jobDescription }),
    });
    if (!response.ok) {
      throw new Error(
        await this.readError(response, 'Failed to calculate match score'),
      );
    }

    const data = (await response.json()) as {
      score: number;
      confidence?: number;
      explanation?: string[] | string;
      missingKeywords?: string[];
      weakSections?: string[];
    };
    sendResponse({
      result: {
        matchScore: data.score,
        confidence: data.confidence ?? 0,
        explanation: Array.isArray(data.explanation)
          ? data.explanation
          : data.explanation
            ? [data.explanation]
            : [],
        missingKeywords: data.missingKeywords ?? [],
        weakSections: data.weakSections ?? [],
      },
    });
  }

  private async handleGetAutofillProfile(
    sendResponse: (response: unknown) => void,
  ): Promise<void> {
    const settings = await chrome.storage.local.get('autofillPreference');
    if (settings.autofillPreference === 'auto-off') {
      throw new Error('Autofill is disabled in extension settings');
    }

    const response = await this.authManager.apiFetch('/auth/profile');
    if (!response.ok) {
      throw new Error(await this.readError(response, 'Failed to load profile'));
    }
    const user = (await response.json()) as {
      email: string;
      profile?: {
        fullName?: string | null;
        location?: string | null;
        phone?: string | null;
        linkedInUrl?: string | null;
        portfolioUrl?: string | null;
      } | null;
    };
    sendResponse({
      profile: {
        email: user.email,
        fullName: user.profile?.fullName ?? '',
        location: user.profile?.location ?? '',
        phone: user.profile?.phone ?? '',
        linkedInUrl: user.profile?.linkedInUrl ?? '',
        portfolioUrl: user.profile?.portfolioUrl ?? '',
      },
    });
  }

  private async listResumes(): Promise<ResumeSummary[]> {
    const response = await this.authManager.apiFetch('/resumes');
    if (!response.ok) {
      throw new Error(await this.readError(response, 'Failed to load resumes'));
    }
    const payload = (await response.json()) as
      ResumeSummary[] | { resumes: ResumeSummary[] };
    const resumes = Array.isArray(payload) ? payload : payload.resumes;
    return resumes.filter((resume) => resume.parseStatus === 'ready');
  }

  private async readError(
    response: Response,
    fallback: string,
  ): Promise<string> {
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) return data.message.join(', ');
      return data.message || fallback;
    } catch {
      return fallback;
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 32_768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
