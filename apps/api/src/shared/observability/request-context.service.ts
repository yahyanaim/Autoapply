import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestTraceContext {
  requestId: string;
  userId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestTraceContext>();

  run<T>(context: RequestTraceContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  getRequestId(): string {
    return this.storage.getStore()?.requestId ?? 'background';
  }

  getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }
}
