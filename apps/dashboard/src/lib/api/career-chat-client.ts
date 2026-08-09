const configuredCareerChatURL = process.env.NEXT_PUBLIC_CAREER_CHAT_API_URL?.trim() ?? '';

const careerChatBaseURL = (
  configuredCareerChatURL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3002')
).replace(/\/$/, '');

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
  async ask(messages: PublicCareerChatMessage[]): Promise<PublicCareerChatResponse> {
    if (!careerChatBaseURL) {
      throw new Error('Career Assistant is not configured.');
    }

    const response = await fetch(new URL('/career-chat/messages', `${careerChatBaseURL}/`), {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const message = Array.isArray(payload?.message)
        ? payload.message.join(', ')
        : payload?.message;
      throw new Error(message || 'Career Assistant is temporarily unavailable.');
    }

    return (await response.json()) as PublicCareerChatResponse;
  }
}

export const publicCareerChatBaseURL = careerChatBaseURL;
export const careerChatClient = new CareerChatClient();
