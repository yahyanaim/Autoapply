import { ServiceUnavailableException } from "@nestjs/common";
import { GlmProvider } from "../infrastructure/providers/glm.provider";

const prompt = {
  id: "resume-parse.v1",
  version: "v1",
  systemPrompt: "system instructions",
  userPrompt: "resume {{resumeText}}",
};

describe("GlmProvider", () => {
  const values: Record<string, unknown> = {
    GLM_FREE_PLAN_API_KEY: "synthetic-test-key",
    GLM_FREE_PLAN_BASE_URL: "https://glm.example.test/v1",
    GLM_FREE_PLAN_MODEL: "glm-test-model",
    GLM_FREE_PLAN_TIMEOUT_MS: 30_000,
    GLM_FREE_PLAN_MAX_OUTPUT_TOKENS: 128,
  };
  const config = {
    get: jest.fn((key: string, fallback: unknown) => values[key] ?? fallback),
  };
  const provider = new GlmProvider(config as never);

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("pins each request to the configured endpoint and rejects redirects", async () => {
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "glm-test-model",
        choices: [{ message: { content: '{"skills":[]}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }),
    } as Response);

    await expect(
      provider.complete(prompt, { resumeText: "synthetic CV text" }),
    ).resolves.toEqual({
      content: '{"skills":[]}',
      model: "glm-test-model",
      tokensUsed: { input: 12, output: 4 },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://glm.example.test/v1/chat/completions",
      expect.objectContaining({ method: "POST", redirect: "error" }),
    );
  });

  it.each([
    { status: 429, retryable: true },
    { status: 503, retryable: true },
    { status: 401, retryable: false },
  ])(
    "maps a GLM HTTP $status failure to a safe retryable=$retryable result",
    async ({ status, retryable }) => {
      jest.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ error: "synthetic provider detail" }),
      } as Response);

      const error = await provider
        .complete(prompt, {})
        .catch((result) => result);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual(
        expect.objectContaining({ retryable }),
      );
    },
  );

  it("returns a safe non-retryable failure for a malformed completion", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    } as Response);

    const error = await provider.complete(prompt, {}).catch((result) => result);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual(
      expect.objectContaining({ retryable: false }),
    );
  });

  it.each([
    ["network failure", new TypeError("synthetic network failure")],
    ["timeout", Object.assign(new Error("synthetic timeout"), { name: "AbortError" })],
  ])("maps a GLM %s to a safe retryable failure", async (_name, failure) => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(failure);

    const error = await provider.complete(prompt, {}).catch((result) => result);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual(
      expect.objectContaining({ retryable: true }),
    );
  });

  it("returns a safe non-retryable failure when GLM configuration is missing", async () => {
    values.GLM_FREE_PLAN_API_KEY = "";
    const fetch = jest.spyOn(globalThis, "fetch");

    const error = await provider.complete(prompt, {}).catch((result) => result);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual(
      expect.objectContaining({ retryable: false }),
    );
    expect(fetch).not.toHaveBeenCalled();
    values.GLM_FREE_PLAN_API_KEY = "synthetic-test-key";
  });

  it("rejects an unsafe configured endpoint before making a request", async () => {
    values.GLM_FREE_PLAN_BASE_URL = "http://127.0.0.1:3000";
    const fetch = jest.spyOn(globalThis, "fetch");

    await expect(provider.complete(prompt, {})).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetch).not.toHaveBeenCalled();
    values.GLM_FREE_PLAN_BASE_URL = "https://glm.example.test/v1";
  });
});
