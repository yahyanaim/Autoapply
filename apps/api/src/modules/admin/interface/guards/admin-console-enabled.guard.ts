import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Applies only to newly introduced /admin/console routes; legacy /admin routes remain unchanged. */
@Injectable()
export class AdminConsoleEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (this.config.get<boolean>('ADMIN_CONSOLE_ENABLED', false) === true) return true;
    throw new ForbiddenException('Admin console is disabled');
  }
}
