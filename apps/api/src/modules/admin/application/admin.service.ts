import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsers(page: number, limit: number, search?: string) {
    page = Math.max(1, Number.isFinite(page) ? page : 1);
    limit = Math.min(100, Math.max(1, Number.isFinite(limit) ? limit : 20));
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { profile: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          role: true,
          isEmailVerified: true,
          createdAt: true,
          updatedAt: true,
          profile: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  }

  async getMetrics() {
    const [totalUsers, totalApplications, totalJobs, activeSubscriptions] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.application.count(),
        this.prisma.job.count(),
        this.prisma.subscription.count({ where: { status: 'active' } }),
      ]);

    return { totalUsers, totalApplications, totalJobs, activeSubscriptions };
  }

  async getAIUsage(startDate: Date, endDate: Date) {
    const requests = await this.prisma.aIRequest.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
    });

    const totalCost = requests.reduce((sum, r) => sum + (r.cost ?? 0), 0);
    const totalTokens = requests.reduce(
      (sum, r) => sum + (r.tokensUsed ?? 0),
      0,
    );

    const byFeature: Record<
      string,
      { count: number; cost: number; tokens: number }
    > = {};
    for (const req of requests) {
      if (!byFeature[req.feature])
        byFeature[req.feature] = { count: 0, cost: 0, tokens: 0 };
      byFeature[req.feature].count++;
      byFeature[req.feature].cost += req.cost ?? 0;
      byFeature[req.feature].tokens += req.tokensUsed ?? 0;
    }

    return {
      totalRequests: requests.length,
      totalCost,
      totalTokens,
      byFeature,
      startDate,
      endDate,
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
        subscription: { include: { payments: { orderBy: { createdAt: 'desc' }, take: 5 } } },
        aiRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
        applications: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { job: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
