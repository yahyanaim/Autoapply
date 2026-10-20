import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { careerChatClient } from '@/lib/api/career-chat-client';
import { FloatingCareerAssistant } from './FloatingCareerAssistant';
import { CareerChatAnswer } from './CareerChatAnswer';

vi.mock('@/lib/api/career-chat-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/career-chat-client')>()),
  careerChatClient: {
    ask: vi.fn(),
  },
}));

const ask = vi.mocked(careerChatClient.ask);
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
  it('disables provider HTML and links only safe HTTPS sources', async () => {
    vi.useFakeTimers();
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    ask.mockResolvedValue({
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
    // Raw HTML is never interpreted; any retained text is inert, not a script.
    expect(alert).not.toHaveBeenCalled();
    expect(container.querySelector('[onerror], [onclick]')).toBeNull();
    expect(container.textContent).toContain('Use ANAPEC.');
    alert.mockRestore();
    const sourceLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(
        '.career-chat-message-assistant a',
      ),
    );
    expect(sourceLinks).toHaveLength(1);
    expect(sourceLinks[0]?.href).toBe('https://www.anapec.org/');
  });

  it('keeps user Markdown and HTML as plain text', async () => {
    ask.mockResolvedValue({
      answer: 'A safe answer.',
      model: 'test',
      sources: [],
      privacy: 'not-stored',
    });
    act(() => root.render(<FloatingCareerAssistant />));
    click('button[aria-label="Ask Nori about jobs in Morocco"]');
    const input = requiredElement<HTMLTextAreaElement>('textarea');
    const question = '**My question** <img src=x onerror="alert(1)">';
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set?.call(input, question);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('button[aria-label="Send question"]');
    await act(async () => Promise.resolve());
    const message = requiredElement('.career-chat-message-user');
    expect(message.textContent).toBe(question);
    expect(message.querySelector('strong, img')).toBeNull();
  });

  it('renders semantic Markdown without raw HTML, remote images or unapproved navigation', () => {
    act(() =>
      root.render(
        <CareerChatAnswer
          sources={['https://www.anapec.org/']}
          content={
            '## Useful steps\n\nA **clear answer** with *emphasis*.\n\n- First\n- Second\n\n1. Apply\n2. Review\n\nUse `Array<T>` where x < y.\n\n```html\n<div>safe example</div>\n```\n\n[Official](https://www.anapec.org/) [Phishing](https://unapproved.example/) [Unsafe](javascript:alert%281%29) [Credentials](https://user:password@www.anapec.org/) ![Tracker](https://tracker.example/image.png)\n\n<script>window.compromised = true</script>'
          }
        />,
      ),
    );
    expect(container.querySelector('h3')?.textContent).toBe('Useful steps');
    expect(container.querySelector('strong')?.textContent).toBe('clear answer');
    expect(container.querySelector('em')?.textContent).toBe('emphasis');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('pre')?.textContent).toContain(
      '<div>safe example</div>',
    );
    expect(container.textContent).toContain('Array<T>');
    expect(
      container.querySelectorAll('script, img, iframe, style, svg'),
    ).toHaveLength(0);
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]?.href).toBe('https://www.anapec.org/');
    expect(links[0]?.rel).toContain('noopener');
    expect(links[0]?.className).toContain('focus-visible:outline');
  });

  it.each([
    ['Use List<T> in C#.', 'Use List<T> in C#.'],
    [
      'TypeScript: Record<string, Array<T>> and Promise<Result<T>>.',
      'TypeScript: Record<string, Array<T>> and Promise<Result<T>>.',
    ],
    [
      'C#: Dictionary<string, List<T>> implements IEnumerable<T>.',
      'C#: Dictionary<string, List<T>> implements IEnumerable<T>.',
    ],
    [
      'Compare x < y and y > 0; 0 < x < 10.',
      'Compare x < y and y > 0; 0 < x < 10.',
    ],
    [
      'Literal <component>example</component>.',
      'Literal <component>example</component>.',
    ],
    [
      'List&lt;T&gt; and x &lt; y &amp;&amp; y &gt; 0.',
      'List<T> and x < y && y > 0.',
    ],
    ['&amp;lt;script&amp;gt;', '&lt;script&gt;'],
    ['Malformed <span title="unfinished', 'Malformed <span title="unfinished'],
    [
      'Partial List<T and stray > brackets.',
      'Partial List<T and stray > brackets.',
    ],
  ])(
    'preserves literal technical content as inert text (%#)',
    (content, text) => {
      act(() => root.render(<CareerChatAnswer content={content} />));
      expect(container.textContent).toBe(text);
      expect(container.querySelector('component, span[title]')).toBeNull();
    },
  );

  it('preserves generic syntax and HTML examples in inline and fenced code', () => {
    act(() =>
      root.render(
        <CareerChatAnswer
          content={
            'Use `List<T>` and `x < y`.\n\n```typescript\nconst items: Array<T> = [];\n```\n\n```html\n<img src=x onerror="alert(1)">\n```'
          }
        />,
      ),
    );
    expect(
      Array.from(
        container.querySelectorAll('code'),
        (code) => code.textContent,
      ),
    ).toEqual([
      'List<T>',
      'x < y',
      'const items: Array<T> = [];\n',
      '<img src=x onerror="alert(1)">\n',
    ]);
    expect(container.querySelectorAll('pre')).toHaveLength(2);
    expect(container.querySelector('img, [onerror]')).toBeNull();
  });

  it.each([
    '<script>window.compromised = true</script>',
    '<img src="https://tracker.example/pixel" onerror="alert(1)">',
    '<iframe src="https://unapproved.example/"></iframe>',
    '<svg onload="alert(1)"><script>alert(2)</script></svg>',
    '<style>body{background:url(https://tracker.example/pixel)}</style>',
    '<form action="https://unapproved.example/"><input autofocus onfocus="alert(1)"></form>',
    '<a href="https://www.anapec.org/" onclick="alert(1)">Not active</a>',
    '<object data="data:text/html,unsafe"><embed src="https://unapproved.example/"></object>',
    '<img src=x onerror="alert(1)"',
    '<div><strong>Unclosed literal markup',
  ])(
    'never activates HTML-like content, including malformed markup (%#)',
    (content) => {
      const alert = vi
        .spyOn(window, 'alert')
        .mockImplementation(() => undefined);
      act(() =>
        root.render(
          <CareerChatAnswer
            content={content}
            sources={['https://www.anapec.org/']}
          />,
        ),
      );
      expect(container.textContent).toBe(content);
      expect(
        container.querySelectorAll(
          'script, img, iframe, svg, style, form, input, object, embed, a, strong',
        ),
      ).toHaveLength(0);
      expect(
        container.querySelector(
          '[onerror], [onload], [onclick], [onfocus], [style]',
        ),
      ).toBeNull();
      expect(alert).not.toHaveBeenCalled();
      alert.mockRestore();
    },
  );

  it.each([
    [
      'https://www.anapec.org/',
      'https://www.anapec.org/',
      'https://www.anapec.org/',
    ],
    [
      'https://www.anapec.org/#jobs',
      'https://www.anapec.org/',
      'https://www.anapec.org/#jobs',
    ],
    [
      'https://www.anapec.org#jobs',
      'https://www.anapec.org/',
      'https://www.anapec.org/#jobs',
    ],
    [
      'https://www.anapec.org/jobs/',
      'https://www.anapec.org/jobs',
      'https://www.anapec.org/jobs/',
    ],
    [
      'https://www.anapec.org/jobs#apply',
      'https://www.anapec.org/jobs/',
      'https://www.anapec.org/jobs#apply',
    ],
    [
      'https://www.anapec.org/jobs?category=tech#apply',
      'https://www.anapec.org/jobs?category=tech',
      'https://www.anapec.org/jobs?category=tech#apply',
    ],
    [
      'https://%77ww.anapec.org/#jobs',
      'https://www.anapec.org/',
      'https://www.anapec.org/#jobs',
    ],
    [
      'https://www.anapec.org:443/#jobs',
      'https://www.anapec.org/',
      'https://www.anapec.org/#jobs',
    ],
    [
      'https://www.anapec.org/jobs/../#jobs',
      'https://www.anapec.org/',
      'https://www.anapec.org/#jobs',
    ],
  ])(
    'keeps owner-equivalent HTTPS links clickable without losing fragments (%#)',
    (href, source, expected) => {
      act(() =>
        root.render(
          <CareerChatAnswer
            content={`[Official source](${href})`}
            sources={[source]}
          />,
        ),
      );
      const link = container.querySelector('a');
      expect(link?.getAttribute('href')).toBe(expected);
      expect(link?.textContent).toBe('Official source');
      expect(link?.rel).toBe('noopener noreferrer');
      expect(link?.target).toBe('_blank');
    },
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'file:///etc/passwd',
    'ftp://www.anapec.org/',
    'http://www.anapec.org/',
    '//www.anapec.org/',
    'https://user:password@www.anapec.org/',
    'https://%75ser:%70ass@www.anapec.org/',
    'https://www.anapec.org@evil.example/',
    'https://www.anapec.org.evil.example/',
    'https://www-anapec.org/',
    'https://www.anаpec.org/',
    'https://www.anapec.org:444/',
    'https://www.anapec.org./',
    'https://evil.example/?next=https://www.anapec.org/',
    'https://www.anapec.org/?redirect=https://evil.example/',
    'https://www.anapec.org/%23jobs',
    'https://www.anapec.org/%2F',
    'https://www.anapec.org/%252F',
    'https://www.anapec.org//',
    'https://www.anapec.org%40evil.example/',
  ])(
    'does not turn unsafe or unapproved URL identities into links (%#)',
    (href) => {
      act(() =>
        root.render(
          <CareerChatAnswer
            content={`[Source](${href})`}
            sources={['https://www.anapec.org/']}
          />,
        ),
      );
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('Source');
    },
  );

  it('does not decode an encoded path separator into an approved path', () => {
    act(() =>
      root.render(
        <CareerChatAnswer
          content="[Source](https://www.anapec.org/jobs%2F)"
          sources={['https://www.anapec.org/jobs/']}
        />,
      ),
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('retains the source chip while an approved inline link keeps its fragment', async () => {
    vi.useFakeTimers();
    ask.mockResolvedValue({
      answer: 'See [ANAPEC](https://www.anapec.org/#jobs).',
      model: 'test',
      sources: ['https://www.anapec.org/'],
      privacy: 'not-stored',
    });
    act(() => root.render(<FloatingCareerAssistant />));
    click('button[aria-label="Ask Nori about jobs in Morocco"]');
    click('button.career-chat-prompt');
    await act(async () => Promise.resolve());
    act(() => vi.runAllTimers());
    const links = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(
        '.career-chat-message-assistant a',
      ),
    );
    expect(links.map((link) => link.href)).toEqual([
      'https://www.anapec.org/#jobs',
      'https://www.anapec.org/',
    ]);
  });

  it.each([
    '<think>PRIVATE_REASONING</think>Final',
    '<think>PRIVATE_REASONING',
    '‹think›PRIVATE_REASONING‹/think›Final',
    '&lt;think&gt;PRIVATE_REASONING',
  ])(
    'rejects reasoning-bearing responses before every animation frame (%#)',
    async (answer) => {
      vi.useFakeTimers();
      ask.mockResolvedValue({
        answer,
        model: 'test',
        sources: [],
        privacy: 'not-stored',
      });
      act(() => root.render(<FloatingCareerAssistant />));
      click('button[aria-label="Ask Nori about jobs in Morocco"]');
      click('button.career-chat-prompt');
      await act(async () => Promise.resolve());
      expect(container.textContent).not.toContain('PRIVATE_REASONING');
      expect(container.textContent).toContain('invalid answer');
      for (let frame = 0; frame < 130; frame += 1) {
        act(() => vi.advanceTimersByTime(18));
        expect(container.textContent).not.toContain('PRIVATE_REASONING');
      }
      expect(ask).toHaveBeenCalledTimes(1);
    },
  );

  it('does not display reasoning-bearing errors or echo them on the next turn', async () => {
    ask.mockRejectedValueOnce(new Error('<think>PRIVATE_REASONING</think>'));
    ask.mockResolvedValue({
      answer: 'A safe answer.',
      model: 'test',
      sources: [],
      privacy: 'not-stored',
    });
    act(() => root.render(<FloatingCareerAssistant />));
    click('button[aria-label="Ask Nori about jobs in Morocco"]');
    click('button.career-chat-prompt');
    await act(async () => Promise.resolve());
    expect(container.textContent).not.toContain('PRIVATE_REASONING');
    expect(container.textContent).toContain('temporarily unavailable');
    // The next question cannot send hidden provider content back as history.
    const input = requiredElement<HTMLTextAreaElement>('textarea');
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set?.call(input, 'Please continue');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('button[aria-label="Send question"]');
    await act(async () => Promise.resolve());
    expect(JSON.stringify(ask.mock.calls)).not.toContain('PRIVATE_REASONING');
  });

  it.each([
    'خطوات عملية للبحث عن العمل',
    'قلب على خدمة فالمغرب',
    'Practical next steps',
    'Étapes utiles pour votre recherche',
  ])(
    'isolates multilingual message direction without changing its text: %s',
    (text) => {
      act(() =>
        root.render(
          <CareerChatAnswer
            content={text + '\n\nUse `Array<T>` and USD 12.'}
          />,
        ),
      );
      expect(container.querySelector('div[dir="auto"]')).not.toBeNull();
      expect(container.querySelector('p')?.getAttribute('dir')).toBe('auto');
      expect(container.textContent).toContain(text);
      expect(container.querySelector('code')?.getAttribute('dir')).toBe('ltr');
    },
  );
});

function requiredElement<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Expected test element: ${selector}`);
  return element;
}
function click(selector: string) {
  act(() => requiredElement<HTMLElement>(selector).click());
}
