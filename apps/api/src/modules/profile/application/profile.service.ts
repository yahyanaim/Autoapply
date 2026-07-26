import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UpsertProfileDto } from '../interface/dto/upsert-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, email: true, role: true } } },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async upsertProfile(userId: string, data: UpsertProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.profile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }
}
