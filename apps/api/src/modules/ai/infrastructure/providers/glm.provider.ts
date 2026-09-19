import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AIExecutionOptions,
  AIProvider,
  AIResponse,
  PromptTemplate,
} from "../../domain/ai-provider.interface";
import { parseExternalHttpsBaseUrl } from "../../../../shared/config/external-endpoint";

const MAX_RESPONSE_BYTES_PER_TOKEN = 32;

/**
 * The Free-plan adapter deliberately owns only the GLM-compatible protocol.
 * It is never registered in AIProviderFactory, which prevents it from becoming
 * a paid-provider fallback accidentally.
 */
@Injectable()
export class GlmProvider implements AIProvider {
  constructor(private readonly config: ConfigService) {}

  async complete(
    prompt: PromptTemplate,
    context: Record<string, unknown>,
    options?: AIExecutionOptions,
  ): Promise<AIResponse> {
    const apiKey = this.config.get<string>("GLM_FREE_PLAN_API_KEY");
    const baseUrl = this.config.get<string>("GLM_FREE_PLAN_BASE_URL");
    const model = this.config.get<string>("GLM_FREE_PLAN_MODEL");
    if (!apiKey || !baseUrl || !model) {
      throw freeAiUnavailable(false);
    }

    const timeoutMs =
      options?.timeoutMs ??
      this.config.get<number>("GLM_FREE_PLAN_TIMEOUT_MS", 30_000);
    const maxOutputTokens =
      options?.maxOutputTokens ??
      this.config.get<number>("GLM_FREE_PLAN_MAX_OUTPUT_TOKENS", 2_048);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await globalThis.fetch(this.endpoint(baseUrl), {
        method: "POST",
        redirect: "error",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxOutputTokens,
          messages: [
            { role: "system", content: prompt.systemPrompt },
            { role: "user", content: interpolate(prompt.userPrompt, context) },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw freeAiUnavailable(isRetryableStatus(response.status));
      }
      const payload = await response.json();
      return this.readResponse(payload, model, maxOutputTokens);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw freeAiUnavailable(true);
    } finally {
      clearTimeout(timeout);
    }
  }

  private endpoint(baseUrl: string): string {
    const endpoint = parseExternalHttpsBaseUrl(
      baseUrl,
      "GLM_FREE_PLAN_BASE_URL",
    );
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/chat/completions`;
    return endpoint.toString();
  }

  private readResponse(
    value: unknown,
    configuredModel: string,
    maxOutputTokens: number,
  ): AIResponse {
    if (!isRecord(value) || !Array.isArray(value.choices)) {
      throw freeAiUnavailable(false);
    }
    const firstChoice = value.choices[0];
    if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
      throw freeAiUnavailable(false);
    }
    const content = firstChoice.message.content;
    if (
      typeof content !== "string" ||
      !content.trim() ||
      Buffer.byteLength(content) >
        maxOutputTokens * MAX_RESPONSE_BYTES_PER_TOKEN
    ) {
      throw freeAiUnavailable(false);
    }

    const usage = isRecord(value.usage) ? value.usage : {};
    const responseModel =
      typeof value.model === "string" &&
      /^[A-Za-z0-9._:-]{1,128}$/.test(value.model)
        ? value.model
        : configuredModel;

    return {
      content,
      model: responseModel,
      tokensUsed: {
        input: nonNegativeInteger(usage.prompt_tokens),
        output: nonNegativeInteger(usage.completion_tokens),
      },
    };
  }
}

function interpolate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    context[key] !== undefined ? String(context[key]) : `{{${key}}}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function freeAiUnavailable(retryable: boolean): ServiceUnavailableException {
  return new ServiceUnavailableException({
    statusCode: 503,
    code: "FREE_AI_TEMPORARILY_UNAVAILABLE",
    retryable,
    message: "The Free AI service is temporarily unavailable. Please retry.",
  });
}
