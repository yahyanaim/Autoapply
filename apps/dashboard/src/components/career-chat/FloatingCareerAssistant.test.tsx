import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api/api-client';
import { FloatingCareerAssistant } from './FloatingCareerAssistant';

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

const post = vi.mocked(apiClient.post);
let container: HTMLDivElement;
let root: Root;

function requiredElement<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Expected test element: ${selector}`);
  return element;
}

function click(selector: string) {
  act(() => {
    requiredElement<HTMLElement>(selector).click();
  });
}

async function flushAsyncUpdates() {
  await act(async () => {
    await Promise.resolve();
  });
}

function enterQuestion(value: string) {
  const textarea = requiredElement<HTMLTextAreaElement>('textarea[aria-label="Question for Nori"]');
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function openAssistant() {
  act(() => {
    root.render(<FloatingCareerAssistant />);
  });
  click('button[aria-label="Ask Nori about jobs in Morocco"]');
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

describe('FloatingCareerAssistant', () => {
  it('opens the public Career Assistant with its privacy notice', () => {
    openAssistant();

    expect(container.textContent).toContain('Ask Nori');
    expect(container.textContent).toContain('Career Assistant');
    expect(container.textContent).toContain('Chat messages are not stored');
  });

  it('sends the user question to the career-chat API and renders the answer and source', async () => {
    vi.useFakeTimers();
    post.mockResolvedValue({
      answer: 'Use the official ANAPEC portal.',
      model: 'career-model',
      sources: ['https://www.anapec.org/'],
      privacy: 'not-stored',
    });
    openAssistant();

    enterQuestion('Where should I search?');
    click('button[aria-label="Send question"]');

    await flushAsyncUpdates();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/career-chat/messages', {
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: 'Where should I search?',
        }),
      ]),
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(container.textContent).toContain('Use the official ANAPEC portal.');
    expect(requiredElement<HTMLAnchorElement>('a[href="https://www.anapec.org/"]').href).toBe(
      'https://www.anapec.org/',
    );
  });

  it('shows a provider failure without losing the user question', async () => {
    post.mockRejectedValue(new Error('Career Assistant is temporarily unavailable'));
    openAssistant();

    enterQuestion('Help me prepare for an interview');
    click('button[aria-label="Send question"]');

    await flushAsyncUpdates();
    expect(container.textContent).toContain('Help me prepare for an interview');
    expect(container.textContent).toContain('Career Assistant is temporarily unavailable');
  });
});
