import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { careerChatClient } from '@/lib/api/career-chat-client';
import { FloatingCareerAssistant } from './FloatingCareerAssistant';

vi.mock('@/lib/api/career-chat-client', () => ({
  careerChatClient: {
    ask: vi.fn(),
  },
}));

const ask = vi.mocked(careerChatClient.ask);
let container: HTMLDivElement;
let root: Root;
let restoreEarlyBetaEnvironment: (() => void) | undefined;

type TestViewport = 'mobile' | 'tablet' | 'desktop';

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
  const textarea = requiredElement<HTMLTextAreaElement>(
    'textarea[aria-label="Question for Nori"]',
  );
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
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

function renderWithEarlyBetaVisibility(
  viewport: TestViewport,
  isEarlyBetaVisible: boolean,
) {
  const earlyBeta = document.createElement('section');
  earlyBeta.id = 'early-beta';
  document.body.append(earlyBeta);

  let visibilityCallback: IntersectionObserverCallback | undefined;
  const originalMatchMedia = window.matchMedia;
  const originalIntersectionObserver = window.IntersectionObserver;
  window.matchMedia = (query) => ({
    matches: viewport === 'mobile' && query === '(max-width: 639px)',
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
  window.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      visibilityCallback = callback;
    }

    disconnect() {}
    observe() {}
    root = null;
    rootMargin = '';
    thresholds = [];
    takeRecords() {
      return [];
    }
    unobserve() {}
  } as unknown as typeof IntersectionObserver;
  restoreEarlyBetaEnvironment = () => {
    window.matchMedia = originalMatchMedia;
    window.IntersectionObserver = originalIntersectionObserver;
    earlyBeta.remove();
  };

  act(() => {
    root.render(<FloatingCareerAssistant />);
  });
  act(() => {
    visibilityCallback?.(
      [{ isIntersecting: isEarlyBetaVisible } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
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
  restoreEarlyBetaEnvironment?.();
  restoreEarlyBetaEnvironment = undefined;
  container.remove();
  vi.useRealTimers();
});

describe('FloatingCareerAssistant', () => {
  it('opens the independent public Career Assistant with its privacy notice', () => {
    openAssistant();

    expect(container.textContent).toContain('Ask Nori');
    expect(container.textContent).toContain('Career Assistant');
    expect(container.textContent).toContain(
      'Nori cannot access your ApplyAI profile, CV, or dashboard',
    );
    expect(container.textContent).toContain('Chat messages are not stored');
  });

  it('closes the assistant without clearing the conversation state', () => {
    openAssistant();

    click('button[aria-label="Close career assistant"]');

    expect(
      container.querySelector('[aria-label="Nori, Morocco career assistant"]'),
    ).toBeNull();
    expect(
      requiredElement<HTMLButtonElement>(
        'button[aria-label="Ask Nori about jobs in Morocco"]',
      ),
    ).toBeTruthy();
  });

  it('hides the launcher while the Early Beta form is visible on mobile', () => {
    renderWithEarlyBetaVisibility('mobile', true);

    expect(
      container.querySelector('button[aria-label="Ask Nori about jobs in Morocco"]'),
    ).toBeNull();
  });

  it.each(['tablet', 'desktop'] as const)(
    'keeps the launcher visible and in its Early Beta safe position on %s',
    (viewport) => {
      renderWithEarlyBetaVisibility(viewport, true);

      expect(
        requiredElement<HTMLButtonElement>(
          'button[aria-label="Ask Nori about jobs in Morocco"]',
        ),
      ).toBeTruthy();
      expect(
        requiredElement<HTMLDivElement>('.career-assistant-anchor').className,
      ).toContain('career-assistant-anchor--early-beta');
    },
  );

  it.each(['mobile', 'tablet', 'desktop'] as const)(
    'keeps the launcher available outside the Early Beta form on %s',
    (viewport) => {
      renderWithEarlyBetaVisibility(viewport, false);

      expect(
        requiredElement<HTMLButtonElement>(
          'button[aria-label="Ask Nori about jobs in Morocco"]',
        ),
      ).toBeTruthy();
      expect(
        requiredElement<HTMLDivElement>('.career-assistant-anchor').className,
      ).not.toContain('career-assistant-anchor--early-beta');
    },
  );

  it('sends the user question to the career-chat API and renders the answer and source', async () => {
    vi.useFakeTimers();
    ask.mockResolvedValue({
      answer: 'Use the official ANAPEC portal.',
      model: 'career-model',
      sources: ['https://www.anapec.org/'],
      privacy: 'not-stored',
    });
    openAssistant();

    enterQuestion('Where should I search?');
    click('button[aria-label="Send question"]');

    await flushAsyncUpdates();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: 'Where should I search?',
        }),
      ]),
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(container.textContent).toContain('Use the official ANAPEC portal.');
    expect(
      requiredElement<HTMLAnchorElement>('a[href="https://www.anapec.org/"]')
        .href,
    ).toBe('https://www.anapec.org/');
  });

  it('shows a provider failure without losing the user question', async () => {
    ask.mockRejectedValue(
      new Error('Career Assistant is temporarily unavailable'),
    );
    openAssistant();

    enterQuestion('Help me prepare for an interview');
    click('button[aria-label="Send question"]');

    await flushAsyncUpdates();
    expect(container.textContent).toContain('Help me prepare for an interview');
    expect(container.textContent).toContain(
      'Career Assistant is temporarily unavailable',
    );
  });
});
