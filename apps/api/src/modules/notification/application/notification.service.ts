import {
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { InAppChannel } from '../infrastructure/channels/in-app.channel';
import { EmailChannel } from '../infrastructure/channels/email.channel';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inAppChannel: InAppChannel,
    private readonly emailChannel: EmailChannel,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async create(
    userId: string,
    title: string,
    body: string,
    channel: NotificationChannel,
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        body,
        channel,
        status: NotificationStatus.pending,
      },
    });

    switch (channel) {
      case NotificationChannel.in_app:
        await this.inAppChannel.send(notification);
        break;
      case NotificationChannel.email:
        await this.emailChannel.send(notification);
        break;
      case NotificationChannel.push:
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.failed },
        });
        throw new ServiceUnavailableException(
          'Push notification delivery is not configured',
        );
    }

    return notification;
  }

  async list(userId: string, unreadOnly = false) {
    const where: Prisma.NotificationWhereInput = { userId };
    if (unreadOnly) where.status = { not: NotificationStatus.read };

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.read, readAt: this.clock.now() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, status: { not: NotificationStatus.read } },
      data: { status: NotificationStatus.read, readAt: this.clock.now() },
    });
    return { success: true };
  }
}
