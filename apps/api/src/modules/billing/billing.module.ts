import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingService } from './application/billing.service';
import { BillingController } from './interface/billing.controller';
import { StripeAdapter } from './infrastructure/stripe/stripe.adapter';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [BillingService, StripeAdapter],
  controllers: [BillingController],
  exports: [BillingService, StripeAdapter],
})
export class BillingModule {}
