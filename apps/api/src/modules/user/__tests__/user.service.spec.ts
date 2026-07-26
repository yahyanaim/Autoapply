import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from '../application/user.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { StorageToken } from '../../resume/application/resume.service';
import { StripeAdapter } from '../../billing/infrastructure/stripe/stripe.adapter';

describe('UserService', () => {
  let service: UserService;
  let prismaMock: any;
  let storageMock: any;
  let stripeMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      profile: {
        upsert: jest.fn(),
      },
    };
    storageMock = {
      deleteFile: jest.fn(),
    };
    stripeMock = {
      cancelSubscription: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StorageToken, useValue: storageMock },
        { provide: StripeAdapter, useValue: stripeMock },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('privacy controls', () => {
    it('records explicit consent without updating another user', async () => {
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.recordDataProcessingConsent('u1')).resolves.toEqual(
        expect.objectContaining({
          accepted: true,
          privacyPolicyVersion: '2026-07-25',
        }),
      );
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          dataProcessingConsentAt: expect.any(Date),
          privacyPolicyVersion: '2026-07-25',
        },
      });
    });

    it('exports personal data without selecting credential secrets', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        sessions: [{ id: 'session-1' }],
        oauthAccounts: [{ provider: 'google', providerId: 'provider-1' }],
      });

      const exported = await service.exportData('u1');

      expect(exported.account).not.toHaveProperty('passwordHash');
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          select: expect.objectContaining({
            oauthAccounts: {
              select: expect.not.objectContaining({
                accessToken: true,
                refreshToken: true,
              }),
            },
            sessions: {
              select: expect.not.objectContaining({ token: true }),
            },
          }),
        }),
      );
    });

    it('cancels billing, deletes stored files, then deletes the user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        subscription: { stripeSubscriptionId: 'sub_123' },
        resumes: [
          { originalFileUrl: 's3://applyai-resumes/resumes/a.pdf' },
          { originalFileUrl: 's3://applyai-resumes/resumes/b.pdf' },
        ],
      });
      prismaMock.user.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.deleteAccount('u1')).resolves.toBeUndefined();

      expect(stripeMock.cancelSubscription).toHaveBeenCalledWith('sub_123');
      expect(storageMock.deleteFile).toHaveBeenCalledTimes(2);
      expect(prismaMock.user.deleteMany).toHaveBeenCalledWith({
        where: { id: 'u1' },
      });
    });

    it('does not delete an account if external cleanup fails', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        subscription: { stripeSubscriptionId: 'sub_123' },
        resumes: [],
      });
      stripeMock.cancelSubscription.mockRejectedValue(new Error('Stripe unavailable'));

      await expect(service.deleteAccount('u1')).rejects.toThrow('Stripe unavailable');
      expect(prismaMock.user.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const user = { id: 'u1', email: 'test@example.com', profile: { fullName: 'John' } };
      prismaMock.user.findUnique.mockResolvedValue(user);
      const result = await service.getProfile('u1');
      expect(result).toHaveProperty('id', 'u1');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should upsert profile', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' });
      prismaMock.profile.upsert.mockResolvedValue({ id: 'p1', fullName: 'Jane' });
      const result = await service.updateProfile('u1', { fullName: 'Jane' });
      expect(result).toHaveProperty('fullName', 'Jane');
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.updateProfile('u1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('listUsers', () => {
    it('should return paginated users', async () => {
      prismaMock.user.findMany.mockResolvedValue([{ id: 'u1' }]);
      prismaMock.user.count.mockResolvedValue(1);
      const result = await service.listUsers(1, 10);
      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
