import { AuthManager } from '../auth/auth-manager';

type MessageType =
  | 'GET_MATCH_SCORE'
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
        case 'GET_AUTOFILL_PROFILE':
          await this.handleGetAutofillProfile(sendResponse);
          return;
        case 'GET_AUTH_STATE':
          sendResponse({ authenticated: await this.authManager.isAuthenticated() });
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
      sendResponse({ error: error instanceof Error ? error.message : 'Internal error' });
    }
  }

  private async handleGetMatchScore(
    message: Message,
    sendResponse: (response: unknown) => void,
  ): Promise<void> {
    const { jobDescription } = (message.payload ?? {}) as { jobDescription?: string };
    if (!jobDescription?.trim()) {
      throw new Error('Missing job description');
    }

    const settings = await chrome.storage.local.get('selectedResume');
    const resumeId = typeof settings.selectedResume === 'string' ? settings.selectedResume : '';
    if (!resumeId) {
      sendResponse({ error: 'Choose a resume in extension settings', requiresResume: true });
      return;
    }

    const response = await this.authManager.apiFetch('/ai/match-score-text', {
      method: 'POST',
      body: JSON.stringify({ resumeId, jobDescription }),
    });
    if (!response.ok) {
      throw new Error(await this.readError(response, 'Failed to calculate match score'));
    }

    const data = (await response.json()) as {
      score: number;
      explanation?: string[] | string;
      missingKeywords?: string[];
      weakSections?: string[];
    };
    sendResponse({
      result: {
        matchScore: data.score,
        explanation: Array.isArray(data.explanation)
          ? data.explanation.join(' ')
          : data.explanation ?? '',
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
    const payload = (await response.json()) as ResumeSummary[] | { resumes: ResumeSummary[] };
    const resumes = Array.isArray(payload) ? payload : payload.resumes;
    return resumes.filter((resume) => resume.parseStatus === 'ready');
  }

  private async readError(response: Response, fallback: string): Promise<string> {
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) return data.message.join(', ');
      return data.message || fallback;
    } catch {
      return fallback;
    }
  }
}
