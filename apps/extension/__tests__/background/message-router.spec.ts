import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthManager } from '../../src/background/auth/auth-manager';
import { MessageRouter } from '../../src/background/messaging/message-router';

describe('MessageRouter', () => {
  const storageGet = vi.fn();
  const authManager = {
    apiFetch: vi.fn(),
    isAuthenticated: vi.fn(),
    logout: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storageGet.mockResolvedValue({});
    vi.stubGlobal('chrome', {
      runtime: { id: 'applyai-extension' },
      storage: {
        local: { get: storageGet },
      },
    });
  });

  it('rejects messages from another extension', async () => {
    const sendResponse = vi.fn();
    const router = new MessageRouter(authManager as unknown as AuthManager);

    await router.handleMessage(
      { type: 'GET_AUTH_STATE' },
      { id: 'untrusted-extension' } as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(sendResponse).toHaveBeenCalledWith({ error: 'Untrusted message sender' });
    expect(authManager.isAuthenticated).not.toHaveBeenCalled();
  });

  it('requires a selected resume before scoring a job', async () => {
    const sendResponse = vi.fn();
    const router = new MessageRouter(authManager as unknown as AuthManager);

    await router.handleMessage(
      { type: 'GET_MATCH_SCORE', payload: { jobDescription: 'Build reliable services' } },
      { id: 'applyai-extension' } as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Choose a resume in extension settings',
      requiresResume: true,
    });
    expect(authManager.apiFetch).not.toHaveBeenCalled();
  });

  it('maps the API score response to the content-script contract', async () => {
    storageGet.mockResolvedValue({ selectedResume: 'resume-1' });
    authManager.apiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          score: 82,
          explanation: ['Strong experience.', 'Add Kubernetes.'],
          missingKeywords: ['Kubernetes'],
          weakSections: ['Summary'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const sendResponse = vi.fn();
    const router = new MessageRouter(authManager as unknown as AuthManager);

    await router.handleMessage(
      { type: 'GET_MATCH_SCORE', payload: { jobDescription: 'Platform engineer' } },
      { id: 'applyai-extension' } as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(authManager.apiFetch).toHaveBeenCalledWith('/ai/match-score-text', {
      method: 'POST',
      body: JSON.stringify({ resumeId: 'resume-1', jobDescription: 'Platform engineer' }),
    });
    expect(sendResponse).toHaveBeenCalledWith({
      result: {
        matchScore: 82,
        explanation: 'Strong experience. Add Kubernetes.',
        missingKeywords: ['Kubernetes'],
        weakSections: ['Summary'],
      },
    });
  });
});
