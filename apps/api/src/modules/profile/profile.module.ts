import { Module } from '@nestjs/common';
import { ProfileService } from './application/profile.service';
import { ProfileController } from './interface/profile.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ProfileService],
  controllers: [ProfileController],
  exports: [ProfileService],
})
export class ProfileModule {}
