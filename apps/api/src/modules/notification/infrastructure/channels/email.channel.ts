import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import { NotificationStatus } from '@prisma/client';
import { SystemClock } from '../../../../shared/adapters/system-clock.adapter';

@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);
  private transporter?: Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async send(notification: {
    id: string;
    userId: string;
    title: string;
    body?: string | null;
  }): Promise<void> {
    try {
      const recipient = await this.prisma.user.findUnique({
        where: { id: notification.userId },
        select: { email: true },
      });
      if (!recipient) throw new Error('Notification recipient does not exist');

      const from = this.config.get<string>('SMTP_FROM');
      if (!from) throw new Error('SMTP_FROM is not configured');

      await this.getTransporter().sendMail({
        from,
        to: recipient.email,
        subject: notification.title,
        text: notification.body ?? '',
      });

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.sent, sentAt: this.clock.now() },
      });
      this.logger.log(`Email notification ${notification.id} delivered`);
    } catch (error) {
      await this.markFailed(notification.id);
      this.logger.error(
        `Email notification ${notification.id} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException('Email delivery failed');
    }
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('SMTP_HOST');
    if (!host) throw new Error('SMTP_HOST is not configured');

    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    if ((user && !pass) || (!user && pass)) {
      throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
    return this.transporter;
  }

  private async markFailed(id: string): Promise<void> {
    try {
      await this.prisma.notification.update({
        where: { id },
        data: { status: NotificationStatus.failed },
      });
    } catch (error) {
      this.logger.error(
        `Could not persist failed state for notification ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
