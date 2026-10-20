const configuredCareerChatURL =
  process.env.NEXT_PUBLIC_CAREER_CHAT_API_URL?.trim() ?? '';

const careerChatBaseURL = (
  configuredCareerChatURL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3002')
).replace(/\/$/, '');

const reasoningMarker =
  /(?:<|‹|&lt;|&#0*60;|&#x0*3c;)\s*\/?\s*(?:think|analysis|reasoning)\b|(?:^|\n)\s*(?:<|‹|&lt;|&#0*60;|&#x0*3c;)\/?(?:t|th|thi|thin)$/i;

export function careerChatErrorMessage(value: unknown): string {
  return typeof value === 'string' &&
    value.length <= 2_000 &&
    !reasoningMarker.test(value)
    ? value
    : 'Career Assistant is temporarily unavailable. Please try again.';
}

export type PublicCareerChatRole = 'user' | 'assistant';

export interface PublicCareerChatMessage {
  role: PublicCareerChatRole;
  content: string;
}

export interface PublicCareerChatResponse {
  answer: string;
  model: string;
  sources: string[];
  privacy: 'not-stored';
}

class CareerChatClient {
  async ask(
    messages: PublicCareerChatMessage[],
  ): Promise<PublicCareerChatResponse> {
    if (!careerChatBaseURL) {
      throw new Error('Career Assistant is not configured.');
    }

    const response = await fetch(
      new URL('/career-chat/messages', `${careerChatBaseURL}/`),
      {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
      },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const message = Array.isArray(payload?.message)
        ? payload.message.join(', ')
        : payload?.message;
      throw new Error(careerChatErrorMessage(message));
    }

    const payload = await response.json().catch(() => {
      // JSON parse errors may quote the response body; do not surface them.
      throw new Error(
        'Career Assistant returned an invalid answer. Please try again.',
      );
    });
    return validateCareerChatResponse(payload);
  }
}

/** Validate the entire response before animation or conversation-history insertion.
 * A stale/mixed backend must not flash recognized reasoning wrappers to a user.
 */
export function validateCareerChatResponse(
  value: unknown,
): PublicCareerChatResponse {
  const payload = value as Partial<PublicCareerChatResponse> | null;
  if (
    !payload ||
    typeof payload.answer !== 'string' ||
    !payload.answer.trim() ||
    payload.answer.length > 2_000 ||
    reasoningMarker.test(payload.answer) ||
    typeof payload.model !== 'string' ||
    !Array.isArray(payload.sources) ||
    !payload.sources.every((source) => typeof source === 'string') ||
    payload.privacy !== 'not-stored'
  ) {
    throw new Error(
      'Career Assistant returned an invalid answer. Please try again.',
    );
  }
  return {
    answer: payload.answer,
    model: payload.model,
    sources: payload.sources,
    privacy: 'not-stored',
  };
}

export const publicCareerChatBaseURL = careerChatBaseURL;
export const careerChatClient = new CareerChatClient();
