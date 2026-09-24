import { Module } from '@nestjs/common';
import { NotificationService } from './application/notification.service';
import { NotificationController } from './interface/notification.controller';
import { InAppChannel } from './infrastructure/channels/in-app.channel';
import { EmailChannel } from './infrastructure/channels/email.channel';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { NotificationOperationsReadService } from './application/notification-operations-read.service';

@Module({
  imports: [PrismaModule],
  providers: [NotificationService, NotificationOperationsReadService, InAppChannel, EmailChannel],
  controllers: [NotificationController],
  exports: [NotificationService, NotificationOperationsReadService],
})
export class NotificationModule {}
