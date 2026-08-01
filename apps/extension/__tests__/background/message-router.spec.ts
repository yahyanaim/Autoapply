import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthManager } from '../../src/background/auth/auth-manager';
import { MessageRouter } from '../../src/background/messaging/message-router';
import { DASHBOARD_BASE_URL } from '../../src/shared/config';

describe('MessageRouter', () => {
  const storageGet = vi.fn();
  const storageSet = vi.fn();
  const storageRemove = vi.fn();
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
        local: {
          get: storageGet,
          set: storageSet,
          remove: storageRemove,
        },
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

    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Untrusted message sender',
    });
    expect(authManager.isAuthenticated).not.toHaveBeenCalled();
  });

  it('requires a selected resume before scoring a job', async () => {
    const sendResponse = vi.fn();
    const router = new MessageRouter(authManager as unknown as AuthManager);

    await router.handleMessage(
      {
        type: 'GET_MATCH_SCORE',
        payload: { jobDescription: 'Build reliable services' },
      },
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
          confidence: 91,
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
      {
        type: 'GET_MATCH_SCORE',
        payload: { jobDescription: 'Platform engineer' },
      },
      { id: 'applyai-extension' } as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(authManager.apiFetch).toHaveBeenCalledWith('/ai/match-score-text', {
      method: 'POST',
      body: JSON.stringify({
        resumeId: 'resume-1',
        jobDescription: 'Platform engineer',
      }),
    });
    expect(sendResponse).toHaveBeenCalledWith({
      result: {
        matchScore: 82,
        confidence: 91,
        explanation: ['Strong experience.', 'Add Kubernetes.'],
        missingKeywords: ['Kubernetes'],
        weakSections: ['Summary'],
      },
    });
  });

  it('captures the current job and prepares one application package', async () => {
    storageGet.mockResolvedValue({ selectedResume: 'resume-1' });
    authManager.apiFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'job-1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'application-1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const sendResponse = vi.fn();
    const router = new MessageRouter(authManager as unknown as AuthManager);

    await router.handleMessage(
      {
        type: 'PREPARE_APPLICATION',
        payload: {
          title: 'Platform Engineer',
          company: 'Acme',
          description: 'Build reliable distributed services.',
          url: 'https://www.rekrute.com/job/123',
          source: 'rekrute.com',
        },
      },
      { id: 'applyai-extension' } as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(authManager.apiFetch).toHaveBeenNthCalledWith(1, '/jobs/capture', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Platform Engineer',
        companyName: 'Acme',
        description: 'Build reliable distributed services.',
        sourceUrl: 'https://www.rekrute.com/job/123',
        source: 'rekrute.com',
      }),
    });
    expect(authManager.apiFetch).toHaveBeenNthCalledWith(
      2,
      '/applications/prepare',
      {
        method: 'POST',
        headers: {
          'Idempotency-Key': expect.stringMatching(
            /^extension-prepare:[0-9a-f-]{36}$/,
          ),
        },
        body: JSON.stringify({ jobId: 'job-1', resumeId: 'resume-1' }),
      },
    );
    expect(storageSet).toHaveBeenCalledWith({
      'prepareIdempotency:resume-1:job-1':
        expect.stringMatching(/^extension-prepare:/),
    });
    expect(storageRemove).toHaveBeenCalledWith(
      'prepareIdempotency:resume-1:job-1',
    );
    expect(sendResponse).toHaveBeenCalledWith({
      applicationId: 'application-1',
      reviewUrl: `${DASHBOARD_BASE_URL}/applications/application-1`,
    });
  });

  it('reuses a retained preparation key after a lost response', async () => {
    const retainedKey = 'extension-prepare:retained-retry-key';
    storageGet
      .mockResolvedValueOnce({ selectedResume: 'resume-1' })
      .mockResolvedValueOnce({
        'prepareIdempotency:resume-1:job-1': retainedKey,
      });
    authManager.apiFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'job-1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'application-1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const router = new MessageRouter(authManager as unknown as AuthManager);

    await router.handleMessage(
      {
        type: 'PREPARE_APPLICATION',
        payload: {
          title: 'Platform Engineer',
          description: 'Build reliable distributed services.',
          url: 'https://www.rekrute.com/job/123',
        },
      },
      { id: 'applyai-extension' } as chrome.runtime.MessageSender,
      vi.fn(),
    );

    expect(authManager.apiFetch).toHaveBeenNthCalledWith(
      2,
      '/applications/prepare',
      expect.objectContaining({
        headers: { 'Idempotency-Key': retainedKey },
      }),
    );
    expect(storageSet).not.toHaveBeenCalled();
    expect(storageRemove).toHaveBeenCalledWith(
      'prepareIdempotency:resume-1:job-1',
    );
  });
});
