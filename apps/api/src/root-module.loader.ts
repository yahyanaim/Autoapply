import type { Type } from '@nestjs/common';

export async function loadRootModule(): Promise<Type<unknown>> {
  if (process.env.CAREER_CHAT_STANDALONE === 'true') {
    const { CareerChatStandaloneModule } = await import(
      './standalone/career-chat-standalone.module'
    );
    return CareerChatStandaloneModule;
  }

  const { AppModule } = await import('./app.module');
  return AppModule;
}
