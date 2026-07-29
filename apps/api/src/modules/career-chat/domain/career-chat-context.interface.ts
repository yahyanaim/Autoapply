export const CAREER_CHAT_CONTEXT = Symbol('CAREER_CHAT_CONTEXT');

export interface CareerChatContext {
  text: string;
  allowedSources: string[];
}

export interface CareerChatContextProvider {
  build(): Promise<CareerChatContext>;
}
