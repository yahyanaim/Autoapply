import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from '../application/notification.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { InAppChannel } from '../infrastructure/channels/in-app.channel';
import { EmailChannel } from '../infrastructure/channels/email.channel';
import { NotFoundException } from '@nestjs/common';

describe('NotificationService', () => {
  let service: NotificationService;
  let prismaMock: any;
  let inAppMock: any;
  let emailMock: any;

  beforeEach(async () => {
    prismaMock = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    inAppMock = { send: jest.fn() };
    emailMock = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: InAppChannel, useValue: inAppMock },
        { provide: EmailChannel, useValue: emailMock },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe('create', () => {
    it('should create and deliver in-app notification', async () => {
      prismaMock.notification.create.mockResolvedValue({
        id: 'n1',
        channel: 'in_app',
      });
      inAppMock.send.mockResolvedValue(undefined);
      const result = await service.create('u1', 'Title', 'Body', 'in_app');
      expect(result).toHaveProperty('id', 'n1');
      expect(inAppMock.send).toHaveBeenCalled();
    });

    it('should create and deliver email notification', async () => {
      prismaMock.notification.create.mockResolvedValue({
        id: 'n2',
        channel: 'email',
      });
      emailMock.send.mockResolvedValue(undefined);
      const result = await service.create('u1', 'Title', 'Body', 'email');
      expect(result).toHaveProperty('id', 'n2');
      expect(emailMock.send).toHaveBeenCalled();
    });

    it('marks unsupported push delivery as failed', async () => {
      prismaMock.notification.create.mockResolvedValue({
        id: 'n3',
        channel: 'push',
      });
      prismaMock.notification.update.mockResolvedValue({});

      await expect(
        service.create('u1', 'Title', 'Body', 'push'),
      ).rejects.toThrow('Push notification delivery is not configured');
      expect(prismaMock.notification.update).toHaveBeenCalledWith({
        where: { id: 'n3' },
        data: { status: 'failed' },
      });
    });
  });

  describe('list', () => {
    it('should return notifications', async () => {
      prismaMock.notification.findMany.mockResolvedValue([{ id: 'n1' }]);
      const result = await service.list('u1');
      expect(result).toHaveLength(1);
    });

    it('should filter unread only', async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        { id: 'n1', status: 'read' },
      ]);
      await service.list('u1', true);
      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { not: 'read' } }),
        }),
      );
    });
  });

  describe('markRead', () => {
    it('should mark notification as read', async () => {
      prismaMock.notification.findFirst.mockResolvedValue({ id: 'n1', userId: 'u1' });
      prismaMock.notification.update.mockResolvedValue({
        id: 'n1',
        status: 'read',
      });
      const result = await service.markRead('u1', 'n1');
      expect(result.status).toBe('read');
    });

    it('should throw NotFoundException if not found', async () => {
      prismaMock.notification.findFirst.mockResolvedValue(null);
      await expect(service.markRead('u1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllRead', () => {
    it('should mark all as read', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 5 });
      const result = await service.markAllRead('u1');
      expect(result).toHaveProperty('success', true);
    });
  });
});
