'use client';

import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, ExternalLink, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { apiClient } from '@/lib/api/api-client';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: number;
  role: ChatRole;
  content: string;
  sources?: string[];
}

interface CareerChatResponse {
  answer: string;
  model: string;
  sources: string[];
  privacy: 'not-stored';
}

interface FlightPosition {
  x: number;
  y: number;
  rotate: number;
  active: boolean;
}

const GREETING: ChatMessage = {
  id: 1,
  role: 'assistant',
  content:
    'Salam! I’m Nori, your Morocco career guide. Ask me about jobs, interviews, CVs, skills, or where to search.',
};

const QUICK_PROMPTS = [
  'Where can I find jobs in Casablanca?',
  'How do I prepare for an ANAPEC interview?',
  'What skills do Moroccan employers value?',
] as const;

export function FloatingCareerAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [answering, setAnswering] = useState(false);
  const [flight, setFlight] = useState<FlightPosition>({
    x: 0,
    y: 0,
    rotate: 0,
    active: false,
  });
  const nextMessageId = useRef(2);
  const scrollFrame = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const typingTimer = useRef<number | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateFlight = () => {
      scrollFrame.current = null;
      if (open || reducedMotion.matches || window.innerWidth < 640) {
        setFlight({ x: 0, y: 0, rotate: 0, active: false });
        return;
      }

      const maximumScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / maximumScroll));
      const verticalTravel = Math.max(0, window.innerHeight - 230);
      const curve = Math.sin(progress * Math.PI * 5);
      setFlight({
        x: -54 - (curve + 1) * 34,
        y: -(1 - progress) * verticalTravel,
        rotate: curve * 7,
        active: true,
      });

      if (idleTimer.current !== null) {
        window.clearTimeout(idleTimer.current);
      }
      idleTimer.current = window.setTimeout(() => {
        setFlight({ x: 0, y: 0, rotate: 0, active: false });
      }, 850);
    };

    const onScroll = () => {
      if (scrollFrame.current === null) {
        scrollFrame.current = window.requestAnimationFrame(updateFlight);
      }
    };
    const onPreferenceChange = () => updateFlight();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    reducedMotion.addEventListener('change', onPreferenceChange);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      reducedMotion.removeEventListener('change', onPreferenceChange);
      if (scrollFrame.current !== null) {
        window.cancelAnimationFrame(scrollFrame.current);
      }
      if (idleTimer.current !== null) {
        window.clearTimeout(idleTimer.current);
      }
    };
  }, [open]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open]);

  useEffect(
    () => () => {
      if (typingTimer.current !== null) {
        window.clearInterval(typingTimer.current);
      }
    },
    [],
  );

  const revealAnswer = (response: CareerChatResponse) => {
    const id = nextMessageId.current++;
    const chunkSize = Math.max(1, Math.ceil(response.answer.length / 120));
    let visibleCharacters = 0;
    setMessages((current) => [
      ...current,
      { id, role: 'assistant', content: '', sources: response.sources },
    ]);

    typingTimer.current = window.setInterval(() => {
      visibleCharacters = Math.min(response.answer.length, visibleCharacters + chunkSize);
      setMessages((current) =>
        current.map((message) =>
          message.id === id
            ? {
                ...message,
                content: response.answer.slice(0, visibleCharacters),
              }
            : message,
        ),
      );
      if (visibleCharacters >= response.answer.length) {
        if (typingTimer.current !== null) {
          window.clearInterval(typingTimer.current);
          typingTimer.current = null;
        }
        setAnswering(false);
      }
    }, 18);
  };

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || answering) return;

    const userMessage: ChatMessage = {
      id: nextMessageId.current++,
      role: 'user',
      content: trimmed,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setAnswering(true);

    try {
      const response = await apiClient.post<CareerChatResponse>('/career-chat/messages', {
        messages: nextMessages.slice(-10).map(({ role, content }) => ({ role, content })),
      });
      revealAnswer(response);
    } catch (caught) {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId.current++,
          role: 'assistant',
          content:
            caught instanceof Error
              ? caught.message
              : 'I could not answer just now. Please try again shortly.',
        },
      ]);
      setAnswering(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(input);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void ask(input);
    }
  };

  const reset = () => {
    if (typingTimer.current !== null) {
      window.clearInterval(typingTimer.current);
      typingTimer.current = null;
    }
    setMessages([GREETING]);
    setInput('');
    setAnswering(false);
  };

  return (
    <>
      {open && (
        <section className="career-chat-panel" aria-label="Nori, Morocco career assistant">
          <header className="career-chat-header">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-11 w-11 shrink-0">
                <NoriMascot thinking={answering} compact />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-bold text-gray-950">Ask Nori</h2>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                    Morocco jobs
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">Independent Dahl career assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={reset}
                className="career-chat-icon-button"
                aria-label="Clear conversation"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="career-chat-icon-button"
                aria-label="Close career assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="career-chat-messages" aria-live="polite">
            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'career-chat-message career-chat-message-user'
                    : 'career-chat-message career-chat-message-assistant'
                }
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-3 border-t border-gray-200/70 pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Sources
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {message.sources.map((source) => (
                        <a
                          key={source}
                          href={source}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-[10px] font-semibold text-orange-700 hover:bg-orange-100"
                        >
                          {sourceLabel(source)}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
            {answering && messages.at(-1)?.role !== 'assistant' && (
              <div className="career-chat-thinking" role="status">
                <span />
                <span />
                <span />
                <span className="sr-only">Nori is thinking</span>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          {messages.length === 1 && (
            <div className="career-chat-prompts">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => void ask(prompt)}
                  className="career-chat-prompt"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="career-chat-composer">
            <div className="relative">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                maxLength={2_000}
                rows={2}
                placeholder="Ask about jobs in Morocco…"
                className="career-chat-input"
                aria-label="Question for Nori"
              />
              <button
                type="submit"
                disabled={!input.trim() || answering}
                className="career-chat-send"
                aria-label="Send question"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-gray-400">
              <ShieldCheck className="h-3 w-3" />
              Chat messages are not stored. Verify important information.
            </p>
          </form>
        </section>
      )}

      <div
        className="career-assistant-anchor"
        style={{
          transform: `translate3d(${flight.x}px, ${flight.y}px, 0) rotate(${flight.rotate}deg)`,
        }}
      >
        {!open && !flight.active && (
          <span className="career-assistant-callout">Ask Nori about jobs in Morocco</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="career-assistant-trigger"
          aria-label={open ? 'Close Nori career assistant' : 'Ask Nori about jobs in Morocco'}
          aria-expanded={open}
        >
          <NoriMascot thinking={answering} />
        </button>
      </div>
    </>
  );
}

function sourceLabel(source: string): string {
  try {
    return new URL(source).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

function NoriMascot({ thinking, compact = false }: { thinking: boolean; compact?: boolean }) {
  const instanceId = useId().replaceAll(':', '');
  const bodyGradientId = `nori-body-${instanceId}`;
  const glassGradientId = `nori-glass-${instanceId}`;
  const shadowId = `nori-shadow-${instanceId}`;

  return (
    <svg
      viewBox="0 0 104 112"
      role="img"
      aria-label="Nori, ApplyAI career robot"
      className={`h-full w-full ${compact ? '' : 'career-assistant-mascot'}`}
    >
      <defs>
        <linearGradient id={bodyGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb26f" />
          <stop offset="0.48" stopColor="#f97316" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
        <linearGradient id={glassGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#fff7ed" />
        </linearGradient>
        <filter id={shadowId} x="-40%" y="-40%" width="180%" height="200%">
          <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#7c2d12" floodOpacity="0.2" />
        </filter>
      </defs>

      <g className="career-assistant-jet">
        <path d="M36 89L43 108L50 90Z" fill="#fed7aa" />
        <path d="M54 90L62 110L69 88Z" fill="#fb923c" />
      </g>

      <g filter={`url(#${shadowId})`}>
        <path
          d="M31 66C31 55 40 46 52 46C64 46 73 55 73 66V89C73 96 67 101 60 101H44C37 101 31 96 31 89V66Z"
          fill={`url(#${bodyGradientId})`}
        />
        <path
          d="M36 74C42 79 62 79 68 74"
          fill="none"
          stroke="#fff7ed"
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".72"
        />
        <circle cx="52" cy="87" r="7" fill="#fff7ed" />
        <path
          d="M48.5 90L52 82L55.5 90M50 87.5H54"
          fill="none"
          stroke="#ea580c"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <path d="M52 18V10" stroke="#9a3412" strokeWidth="3" strokeLinecap="round" />
      <circle cx="52" cy="7" r="4" fill="#fb923c" />
      <path d="M18 45H12M92 45H86" stroke="#ea580c" strokeWidth="7" strokeLinecap="round" />

      <rect
        x="18"
        y="17"
        width="68"
        height="58"
        rx="25"
        fill={`url(#${glassGradientId})`}
        stroke="#fdba74"
        strokeWidth="3"
        filter={`url(#${shadowId})`}
      />
      <path
        d="M27 35C34 23 49 19 62 23"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        opacity=".9"
      />

      {thinking ? (
        <g className="career-assistant-thinking-eyes">
          <rect x="33" y="41" width="13" height="5" rx="2.5" fill="#431407" />
          <rect x="58" y="41" width="13" height="5" rx="2.5" fill="#431407" />
        </g>
      ) : (
        <g className="career-assistant-eyes">
          <ellipse cx="39.5" cy="43.5" rx="5.5" ry="7.5" fill="#431407" />
          <ellipse cx="64.5" cy="43.5" rx="5.5" ry="7.5" fill="#431407" />
          <circle cx="38" cy="41" r="1.8" fill="white" />
          <circle cx="63" cy="41" r="1.8" fill="white" />
        </g>
      )}

      <path
        d="M42 58C47 63 57 63 62 58"
        fill="none"
        stroke="#c2410c"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="25" cy="53" r="3" fill="#fdba74" opacity=".7" />
      <circle cx="79" cy="53" r="3" fill="#fdba74" opacity=".7" />

      <path
        d="M31 70C20 70 16 78 20 86"
        fill="none"
        stroke="#ea580c"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M73 70C84 70 88 78 84 86"
        fill="none"
        stroke="#ea580c"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
