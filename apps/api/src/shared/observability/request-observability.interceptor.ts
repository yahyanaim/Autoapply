import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { ActivityType, Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable, catchError, from, mergeMap, tap, throwError } from 'rxjs';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RequestContextService } from './request-context.service';
import { SystemClock } from '../adapters/system-clock.adapter';

interface AuthenticatedRequest extends Request {
  user?: { id?: string; sub?: string };
}

@Injectable()
export class RequestObservabilityInterceptor implements NestInterceptor {
  private readonly traceLogger = new Logger('RequestTrace');
  private readonly auditLogger = new Logger('SecurityAudit');

  constructor(
    private readonly requestContext: RequestContextService,
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = this.getRequestId(request);
    const userId = request.user?.id ?? request.user?.sub;
    response.setHeader('X-Request-ID', requestId);
    const startedAt = this.clock.nowMs();

    return new Observable((subscriber) =>
      this.requestContext.run({ requestId, userId }, () => {
        this.traceLogger.log(
          JSON.stringify({
            event: 'request_started',
            requestId,
            userId,
            method: request.method,
            path: request.path,
          }),
        );
        return next
          .handle()
          .pipe(
            tap(() => {
              this.traceLogger.log(
                JSON.stringify({
                  event: 'request_completed',
                  requestId,
                  userId,
                  method: request.method,
                  path: request.path,
                  statusCode: response.statusCode,
                  durationMs: this.clock.nowMs() - startedAt,
                }),
              );
            }),
            catchError((error: unknown) =>
              from(
                this.recordFailure(
                  error,
                  request,
                  requestId,
                  userId,
                  this.clock.nowMs() - startedAt,
                ),
              ).pipe(mergeMap(() => throwError(() => error))),
            ),
          )
          .subscribe(subscriber);
      }),
    );
  }

  private async recordFailure(
    error: unknown,
    request: AuthenticatedRequest,
    requestId: string,
    userId: string | undefined,
    durationMs: number,
  ): Promise<void> {
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;
    this.traceLogger.error(
      JSON.stringify({
        event: 'request_failed',
        requestId,
        userId,
        method: request.method,
        path: request.path,
        statusCode,
        durationMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
    if (statusCode !== 401 && statusCode !== 403) return;

    const metadata = {
      event: 'access_denied',
      requestId,
      method: request.method,
      path: request.path,
      statusCode,
    };
    try {
      await this.prisma.activityLog.create({
        data: {
          userId,
          type: ActivityType.access_denied,
          ipAddress: request.ip,
          userAgent: request.get('user-agent'),
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
      this.auditLogger.warn(JSON.stringify({ ...metadata, userId }));
    } catch (auditError) {
      this.auditLogger.error(
        `Could not persist access-control audit event ${requestId}: ${
          auditError instanceof Error ? auditError.message : String(auditError)
        }`,
      );
    }
  }

  private getRequestId(request: Request): string {
    const supplied = request.get('x-request-id');
    return supplied && /^[a-zA-Z0-9_-]{8,128}$/.test(supplied)
      ? supplied
      : randomUUID();
  }
}
