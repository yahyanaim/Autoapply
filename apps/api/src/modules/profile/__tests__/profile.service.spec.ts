import { Test, TestingModule } from '@nestjs/testing';
import { ProfileService } from '../application/profile.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('ProfileService', () => {
  let service: ProfileService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      profile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  describe('getProfile', () => {
    it('should return profile with user info', async () => {
      prismaMock.profile.findUnique.mockResolvedValue({
        id: 'p1', userId: 'u1', fullName: 'John',
        user: { id: 'u1', email: 'test@example.com', role: 'user' },
      });
      const result = await service.getProfile('u1');
      expect(result).toHaveProperty('fullName', 'John');
      expect(result.user).toHaveProperty('email');
    });

    it('should throw NotFoundException if profile not found', async () => {
      prismaMock.profile.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertProfile', () => {
    it('should upsert profile', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' });
      prismaMock.profile.upsert.mockResolvedValue({ id: 'p1', fullName: 'Jane' });
      const result = await service.upsertProfile('u1', { fullName: 'Jane' });
      expect(result).toHaveProperty('fullName', 'Jane');
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.upsertProfile('u1', {})).rejects.toThrow(NotFoundException);
    });
  });
});
