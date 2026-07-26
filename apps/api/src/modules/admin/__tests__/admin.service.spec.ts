import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../application/admin.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      application: { count: jest.fn() },
      job: { count: jest.fn() },
      subscription: { count: jest.fn() },
      aIRequest: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('getUsers', () => {
    it('should return paginated users', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'test@example.com' },
      ]);
      prismaMock.user.count.mockResolvedValue(1);
      const result = await service.getUsers(1, 10);
      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should search users by email', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);
      await service.getUsers(1, 10, 'test');
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.any(Object) }),
      );
    });
  });

  describe('getMetrics', () => {
    it('should return platform metrics', async () => {
      prismaMock.user.count.mockResolvedValue(100);
      prismaMock.application.count.mockResolvedValue(500);
      prismaMock.job.count.mockResolvedValue(200);
      prismaMock.subscription.count.mockResolvedValue(50);
      const result = await service.getMetrics();
      expect(result.totalUsers).toBe(100);
      expect(result.totalApplications).toBe(500);
      expect(result.totalJobs).toBe(200);
      expect(result.activeSubscriptions).toBe(50);
    });
  });

  describe('getAIUsage', () => {
    it('should return AI usage analytics', async () => {
      prismaMock.aIRequest.findMany.mockResolvedValue([
        { feature: 'match_score', cost: 0.001, tokensUsed: 100 },
        { feature: 'match_score', cost: 0.002, tokensUsed: 200 },
      ]);
      const start = new Date('2025-01-01');
      const end = new Date('2025-12-31');
      const result = await service.getAIUsage(start, end);
      expect(result.totalRequests).toBe(2);
      expect(result.totalCost).toBe(0.003);
      expect(result.byFeature.match_score.count).toBe(2);
    });
  });

  describe('getUserDetail', () => {
    it('should return user detail', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        profile: {},
        subscriptions: [],
        aiRequests: [],
        applications: [],
      });
      const result = await service.getUserDetail('u1');
      expect(result).toHaveProperty('id', 'u1');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserDetail('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
