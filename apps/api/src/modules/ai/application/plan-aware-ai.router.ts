import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../../../database/prisma/prisma.service";
import {
  AIProvider,
  AIResponse,
  PromptTemplate,
} from "../domain/ai-provider.interface";
import { AIProviderFactory } from "../infrastructure/providers/provider.factory";
import { GlmProvider } from "../infrastructure/providers/glm.provider";

export type AiExecutionBoundary = "free" | "paid";

export interface ResolvedAiExecution {
  plan: SubscriptionPlan;
  boundary: AiExecutionBoundary;
  maxInputBytes: number;
  maxOutputTokens: number;
  maxRequestCostUsd?: number;
}

export interface RoutedAiCompletion {
  response: AIResponse;
  providerName: string;
  boundary: AiExecutionBoundary;
}

const PAID_ENTITLEMENT_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.active,
  SubscriptionStatus.trialing,
  SubscriptionStatus.past_due,
]);

/**
 * This is the sole provider-routing authority for product AI work. The route
 * is derived from the database subscription, never from a client request.
 */
@Injectable()
export class PlanAwareAiRouter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly glmProvider: GlmProvider,
    private readonly paidProviderFactory: AIProviderFactory,
    private readonly config: ConfigService,
  ) {}

  async resolve(userId: string): Promise<ResolvedAiExecution> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true },
    });
    if (!subscription || !this.isTrustedEntitlement(subscription)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: "AI_ENTITLEMENT_UNAVAILABLE",
        message: "AI execution is unavailable for this account.",
      });
    }

    if (subscription.plan === SubscriptionPlan.free) {
      this.assertExecutionRole("free");
      return {
        plan: SubscriptionPlan.free,
        boundary: "free",
        maxInputBytes: this.config.get<number>(
          "GLM_FREE_PLAN_MAX_INPUT_BYTES",
          100_000,
        ),
        maxOutputTokens: this.config.get<number>(
          "GLM_FREE_PLAN_MAX_OUTPUT_TOKENS",
          2_048,
        ),
      };
    }

    this.assertExecutionRole("paid");
    return {
      plan: subscription.plan,
      boundary: "paid",
      maxInputBytes: this.paidProviderFactory.getMaxInputBytes(),
      maxOutputTokens: this.paidProviderFactory.getMaxOutputTokens(),
      maxRequestCostUsd: this.paidProviderFactory.getMaxRequestCost(),
    };
  }

  async complete(
    route: ResolvedAiExecution,
    prompt: PromptTemplate,
    context: Record<string, unknown>,
  ): Promise<RoutedAiCompletion> {
    if (route.boundary === "free") {
      const provider = this.freeProvider();
      const response = await provider.complete(prompt, context, {
        timeoutMs: this.config.get<number>("GLM_FREE_PLAN_TIMEOUT_MS", 30_000),
        maxOutputTokens: route.maxOutputTokens,
      });
      return { response, providerName: "glm", boundary: "free" };
    }

    const result = await this.paidProviderFactory.completeWithFallback(
      prompt,
      context,
    );
    return { ...result, boundary: "paid" };
  }

  private freeProvider(): AIProvider {
    if (this.config.get<string>("FREE_AI_PROVIDER", "glm") !== "glm") {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "FREE_AI_PROVIDER_UNAVAILABLE",
        retryable: true,
        message:
          "The Free AI service is temporarily unavailable. Please retry.",
      });
    }
    return this.glmProvider;
  }

  private isTrustedEntitlement(subscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
  }): boolean {
    if (subscription.plan === SubscriptionPlan.free) {
      // A canceled paid subscription is represented as free/canceled by the
      // current billing flow. Treat it as incomplete until billing creates a
      // new active free entitlement; guessing would violate fail-closed routing.
      return subscription.status === SubscriptionStatus.active;
    }
    return PAID_ENTITLEMENT_STATUSES.has(subscription.status);
  }

  private assertExecutionRole(required: AiExecutionBoundary): void {
    const role = this.config.get<string>("AI_EXECUTION_ROLE", "all");
    if (role === "all" || role === required) return;
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: "AI_EXECUTION_BOUNDARY_UNAVAILABLE",
      retryable: true,
      message: "AI execution is temporarily unavailable. Please retry.",
    });
  }
}
