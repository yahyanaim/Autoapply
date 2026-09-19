import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { PlanAwareAiRouter } from "../application/plan-aware-ai.router";

const prompt = {
  id: "resume-parse.v1",
  version: "v1",
  systemPrompt: "system",
  userPrompt: "resume {{resumeText}}",
};
const response = {
  content: "{}",
  model: "glm-test",
  tokensUsed: { input: 1, output: 1 },
};

describe("PlanAwareAiRouter", () => {
  const subscription = { findUnique: jest.fn() };
  const glm = { complete: jest.fn() };
  const paidFactory = {
    completeWithFallback: jest.fn(),
    getMaxInputBytes: jest.fn().mockReturnValue(100_000),
    getMaxOutputTokens: jest.fn().mockReturnValue(2_048),
    getMaxRequestCost: jest.fn().mockReturnValue(0.5),
  };
  const values: Record<string, unknown> = {
    FREE_AI_PROVIDER: "glm",
    AI_EXECUTION_ROLE: "all",
    GLM_FREE_PLAN_TIMEOUT_MS: 30_000,
    GLM_FREE_PLAN_MAX_OUTPUT_TOKENS: 2_048,
    GLM_FREE_PLAN_MAX_INPUT_BYTES: 100_000,
  };
  const config = {
    get: jest.fn((key: string, fallback: unknown) => values[key] ?? fallback),
  };
  const router = new PlanAwareAiRouter(
    { subscription } as never,
    glm as never,
    paidFactory as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    values.AI_EXECUTION_ROLE = "all";
    values.FREE_AI_PROVIDER = "glm";
    glm.complete.mockResolvedValue(response);
    paidFactory.completeWithFallback.mockResolvedValue({
      response: { ...response, model: "paid-model" },
      providerName: "openai",
    });
  });

  it("routes a trusted Free entitlement directly to GLM and never to the paid factory", async () => {
    subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.free,
      status: SubscriptionStatus.active,
    });

    const route = await router.resolve("user-free");
    await expect(
      router.complete(route, prompt, { resumeText: "synthetic" }),
    ).resolves.toEqual(
      expect.objectContaining({ providerName: "glm", boundary: "free" }),
    );

    expect(glm.complete).toHaveBeenCalledWith(
      prompt,
      { resumeText: "synthetic" },
      expect.objectContaining({ maxOutputTokens: 2_048 }),
    );
    expect(paidFactory.completeWithFallback).not.toHaveBeenCalled();
  });

  it.each([
    "timeout",
    "network failure",
    "4xx/5xx response",
    "malformed response",
  ])("never reaches paid providers when GLM has a %s", async () => {
    subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.free,
      status: SubscriptionStatus.active,
    });
    glm.complete.mockRejectedValue(
      new ServiceUnavailableException("synthetic GLM failure"),
    );

    const route = await router.resolve("user-free");
    await expect(router.complete(route, prompt, {})).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(paidFactory.completeWithFallback).not.toHaveBeenCalled();
  });

  it.each([SubscriptionPlan.pro, SubscriptionPlan.premium])(
    "keeps %s on the existing paid fallback factory and away from GLM",
    async (plan) => {
      subscription.findUnique.mockResolvedValue({
        plan,
        status: SubscriptionStatus.active,
      });

      const route = await router.resolve(`user-${plan}`);
      await router.complete(route, prompt, {});

      expect(route.boundary).toBe("paid");
      expect(paidFactory.completeWithFallback).toHaveBeenCalledWith(prompt, {});
      expect(glm.complete).not.toHaveBeenCalled();
    },
  );

  it("fails closed for missing, canceled, and inconsistent entitlements without calling a provider", async () => {
    for (const entitlement of [
      null,
      { plan: SubscriptionPlan.free, status: SubscriptionStatus.canceled },
      { plan: SubscriptionPlan.pro, status: SubscriptionStatus.canceled },
    ]) {
      subscription.findUnique.mockResolvedValue(entitlement);
      await expect(router.resolve("user-invalid")).rejects.toThrow(
        ForbiddenException,
      );
    }
    expect(glm.complete).not.toHaveBeenCalled();
    expect(paidFactory.completeWithFallback).not.toHaveBeenCalled();
  });

  it("prevents a Free execution role from consuming paid work and vice versa", async () => {
    values.AI_EXECUTION_ROLE = "free";
    subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.pro,
      status: SubscriptionStatus.active,
    });
    await expect(router.resolve("paid-on-free-worker")).rejects.toThrow(
      ServiceUnavailableException,
    );

    values.AI_EXECUTION_ROLE = "paid";
    subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.free,
      status: SubscriptionStatus.active,
    });
    await expect(router.resolve("free-on-paid-worker")).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(glm.complete).not.toHaveBeenCalled();
    expect(paidFactory.completeWithFallback).not.toHaveBeenCalled();
  });
});
