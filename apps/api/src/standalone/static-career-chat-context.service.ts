import { Injectable } from '@nestjs/common';
import type {
  CareerChatContext,
  CareerChatContextProvider,
} from '../modules/career-chat/domain/career-chat-context.interface';
import {
  OFFICIAL_MOROCCO_CAREER_SOURCES,
  officialMoroccoCareerContext,
} from '../modules/career-chat/application/career-chat-context.sources';

@Injectable()
export class StaticCareerChatContextService implements CareerChatContextProvider {
  async build(): Promise<CareerChatContext> {
    return {
      text: [
        officialMoroccoCareerContext(),
        '',
        'Current job listings are not connected in standalone mode.',
        'Do not describe a vacancy as current unless the user supplies its details and source.',
      ].join('\n'),
      allowedSources: [...OFFICIAL_MOROCCO_CAREER_SOURCES],
    };
  }
}
