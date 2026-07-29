export type CareerChatRole = 'system' | 'user' | 'assistant';

export interface CareerChatMessage {
  role: CareerChatRole;
  content: string;
}

export interface CareerChatCompletion {
  answer: string;
  model: string;
}

export interface CareerChatProvider {
  complete(messages: CareerChatMessage[]): Promise<CareerChatCompletion>;
}

export const CAREER_CHAT_PROVIDER = Symbol('CAREER_CHAT_PROVIDER');
