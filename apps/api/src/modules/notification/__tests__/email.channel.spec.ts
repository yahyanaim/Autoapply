import { ConfigService } from '@nestjs/config';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { NotificationStatus } from '@prisma/client';
import { EmailChannel } from '../infrastructure/channels/email.channel';

describe('EmailChannel', () => {
  const sendMail = jest.fn();
  const prisma = {
    user: { findUnique: jest.fn() },
    notification: { update: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);
    prisma.user.findUnique.mockResolvedValue({ email: 'person@example.com' });
    prisma.notification.update.mockResolvedValue({});
    sendMail.mockResolvedValue({ messageId: 'message_1' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends through SMTP before marking a notification sent', async () => {
    const values: Record<string, unknown> = {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'secret',
      SMTP_FROM: 'mail@example.com',
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    } as unknown as ConfigService;
    const channel = new EmailChannel(prisma as never, config);

    await channel.send({
      id: 'notification_1',
      userId: 'user_1',
      title: 'Application update',
      body: 'Your application moved to interview.',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'mail@example.com',
      to: 'person@example.com',
      subject: 'Application update',
      text: 'Your application moved to interview.',
    });
    expect(prisma.notification.update).toHaveBeenLastCalledWith({
      where: { id: 'notification_1' },
      data: { status: NotificationStatus.sent, sentAt: expect.any(Date) },
    });
  });

  it('marks a notification failed when SMTP is not configured', async () => {
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;
    const channel = new EmailChannel(prisma as never, config);

    await expect(
      channel.send({
        id: 'notification_2',
        userId: 'user_1',
        title: 'Application update',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(sendMail).not.toHaveBeenCalled();
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification_2' },
      data: { status: NotificationStatus.failed },
    });
  });
});
