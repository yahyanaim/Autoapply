'use client';

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { NoriMascot } from './NoriMascot';
import {
  ArrowUp,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  careerChatClient,
  careerChatErrorMessage,
  validateCareerChatResponse,
  type PublicCareerChatResponse,
} from '@/lib/api/career-chat-client';
import { CareerChatAnswer, safeCareerChatUrl } from './CareerChatAnswer';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: number;
  role: ChatRole;
  content: string;
  sources?: string[];
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
  const [isEarlyBetaVisible, setIsEarlyBetaVisible] = useState(false);
  const [hideLauncherForEarlyBeta, setHideLauncherForEarlyBeta] =
    useState(false);
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

      const maximumScroll = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
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
    const earlyBeta = document.getElementById('early-beta');
    const mobile = window.matchMedia('(max-width: 639px)');
    let observer: IntersectionObserver | undefined;

    const updateObservation = () => {
      observer?.disconnect();
      setIsEarlyBetaVisible(false);
      setHideLauncherForEarlyBeta(false);

      if (!earlyBeta || !window.IntersectionObserver) return;

      observer = new window.IntersectionObserver(
        ([entry]) => {
          const isVisible = entry?.isIntersecting ?? false;
          setIsEarlyBetaVisible(isVisible);
          setHideLauncherForEarlyBeta(isVisible && mobile.matches);
        },
        { threshold: 0.1 },
      );
      observer.observe(earlyBeta);
    };

    updateObservation();
    mobile.addEventListener('change', updateObservation);

    return () => {
      observer?.disconnect();
      mobile.removeEventListener('change', updateObservation);
    };
  }, []);

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

  const revealAnswer = (response: PublicCareerChatResponse) => {
    response = validateCareerChatResponse(response);
    const id = nextMessageId.current++;
    const chunkSize = Math.max(1, Math.ceil(response.answer.length / 120));
    const safeSources = response.sources
      .map(safeCareerChatUrl)
      .filter((source): source is string => source !== null)
      .slice(0, 6);
    let visibleCharacters = 0;
    setMessages((current) => [
      ...current,
      { id, role: 'assistant', content: '', sources: safeSources },
    ]);

    typingTimer.current = window.setInterval(() => {
      visibleCharacters = Math.min(
        response.answer.length,
        visibleCharacters + chunkSize,
      );
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
      const response = await careerChatClient.ask(
        nextMessages.slice(-10).map(({ role, content }) => ({ role, content })),
      );
      revealAnswer(response);
    } catch (caught) {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId.current++,
          role: 'assistant',
          content: careerChatErrorMessage(
            caught instanceof Error ? caught.message : null,
          ),
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
        <section
          className="career-chat-panel"
          aria-label="Nori, Morocco career assistant"
        >
          <header className="career-chat-header">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-11 w-11 shrink-0">
                <NoriMascot thinking={answering} compact />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-bold text-gray-950">
                    Ask Nori
                  </h2>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                    Morocco jobs
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">Career Assistant</p>
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
                {message.role === 'user' ? (
                  <p
                    dir="auto"
                    className="whitespace-pre-wrap [overflow-wrap:anywhere]"
                  >
                    {message.content}
                  </p>
                ) : (
                  <CareerChatAnswer
                    content={message.content}
                    sources={message.sources}
                  />
                )}
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
                dir="auto"
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
              Nori cannot access your ApplyAI profile, CV, or dashboard. Chat
              messages are not stored.
            </p>
          </form>
        </section>
      )}

      {(!hideLauncherForEarlyBeta || open) && (
        <div
          className={`career-assistant-anchor ${
            isEarlyBetaVisible ? 'career-assistant-anchor--early-beta' : ''
          }`}
          style={{
            transform: `translate3d(${flight.x}px, ${flight.y}px, 0) rotate(${flight.rotate}deg)`,
          }}
        >
          {!open && !flight.active && (
            <span className="career-assistant-callout">
              Ask Nori about jobs in Morocco
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="career-assistant-trigger"
            aria-label={
              open
                ? 'Close Nori career assistant'
                : 'Ask Nori about jobs in Morocco'
            }
            aria-expanded={open}
          >
            <NoriMascot thinking={answering} />
          </button>
        </div>
      )}
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
