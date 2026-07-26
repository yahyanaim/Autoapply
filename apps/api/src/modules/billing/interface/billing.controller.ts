import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  RawBodyRequest,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { BillingService } from '../application/billing.service';
import { StripeAdapter } from '../infrastructure/stripe/stripe.adapter';
import { CheckoutDto } from './dto/checkout.dto';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly stripeAdapter: StripeAdapter,
  ) {}

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current subscription and recent payments' })
  async getSubscription(@CurrentUser('id') userId: string) {
    return this.billingService.getSubscription(userId);
  }

  @Post('checkout-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  @ApiResponse({ status: 201, description: 'Checkout session created' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async createCheckoutSession(
    @CurrentUser('id') userId: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.billingService.createCheckoutSession(userId, dto.plan);
  }

  @Post('portal-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create Stripe billing portal session' })
  @ApiResponse({ status: 201, description: 'Portal session created' })
  @ApiResponse({ status: 404, description: 'No active subscription' })
  async createPortalSession(@CurrentUser('id') userId: string) {
    return this.billingService.createPortalSession(userId);
  }

  @Post('webhook')
  @Throttle({ default: { limit: 100, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Stripe webhook' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !req.rawBody) {
      throw new BadRequestException('Stripe signature or raw body is missing');
    }
    let event;
    try {
      event = this.stripeAdapter.constructWebhookEvent(req.rawBody, signature);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new BadRequestException('Invalid Stripe webhook');
    }
    return this.billingService.handleWebhook(event);
  }
}
