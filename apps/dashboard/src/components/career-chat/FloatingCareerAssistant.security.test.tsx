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

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('FloatingCareerAssistant output safety', () => {
  it('renders provider markup only as text and links only safe HTTPS sources', async () => {
    vi.useFakeTimers();
    post.mockResolvedValue({
      answer:
        '<img src=x onerror="alert(1)"><script>alert(2)</script>Use ANAPEC.',
      model: 'test-model',
      sources: [
        'javascript:alert(3)',
        'http://www.anapec.org/',
        'https://user:password@www.anapec.org/',
        'https://www.anapec.org/',
      ],
      privacy: 'not-stored',
    });

    act(() => root.render(<FloatingCareerAssistant />));
    click('button[aria-label="Ask Nori about jobs in Morocco"]');
    const input = requiredElement<HTMLTextAreaElement>(
      'textarea[aria-label="Question for Nori"]',
    );
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    act(() => {
      setValue?.call(input, 'Show me a safe source');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('button[aria-label="Send question"]');
    await act(async () => Promise.resolve());
    act(() => vi.runAllTimers());

    expect(container.querySelector('script')).toBeNull();
    expect(
      container.querySelector('.career-chat-message-assistant img'),
    ).toBeNull();
    expect(container.textContent).toContain('<script>alert(2)</script>');
    const sourceLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(
        '.career-chat-message-assistant a',
      ),
    );
    expect(sourceLinks).toHaveLength(1);
    expect(sourceLinks[0]?.href).toBe('https://www.anapec.org/');
  });
});

function requiredElement<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Expected test element: ${selector}`);
  return element;
}

function click(selector: string) {
  act(() => requiredElement<HTMLElement>(selector).click());
}
