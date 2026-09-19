import { HttpException } from "@nestjs/common";

const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,96}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

export interface SafeLogInput {
  event: string;
  component: string;
  requestId?: string;
  provider?: string;
  action?: string;
  statusCode?: number;
  durationMs?: number;
  attempt?: number;
  error?: unknown;
}

/**
 * Builds log output from a narrow allow-list rather than attempting to redact
 * arbitrary data. Inputs outside this type are intentionally ignored, which
 * keeps user-controlled errors, queue payloads, URLs, and request data out of
 * stdout/stderr even when they contain circular values or throwing getters.
 */
export function serializeSafeLog(input: SafeLogInput): string {
  try {
    const payload: Record<string, string | number> = {
      event: safeIdentifier(input.event, "event") ?? "event",
      component: safeIdentifier(input.component, "component") ?? "component",
    };
    const requestId = safeRequestId(input.requestId);
    if (requestId) payload.requestId = requestId;
    const provider = safeIdentifier(input.provider, undefined);
    if (provider) payload.provider = provider;
    const action = safeIdentifier(input.action, undefined);
    if (action) payload.action = action;
    const statusCategory = safeStatusCategory(input.statusCode);
    if (statusCategory) payload.statusCategory = statusCategory;
    const durationMs = safeBoundedNumber(input.durationMs, 0, 3_600_000);
    if (durationMs !== undefined) payload.durationMs = durationMs;
    const attempt = safeBoundedNumber(input.attempt, 1, 100);
    if (attempt !== undefined) payload.attempt = attempt;
    if (input.error !== undefined)
      payload.errorCategory = safeErrorCategory(input.error);
    return JSON.stringify(payload);
  } catch {
    return '{"event":"log_sanitization_failed","component":"observability"}';
  }
}

export function safeErrorCategory(error: unknown): string {
  if (error instanceof HttpException) {
    return safeStatusCategory(error.getStatus()) ?? "http_error";
  }
  if (error instanceof Error) {
    switch (error.name) {
      case "AbortError":
        return "timeout";
      case "TimeoutError":
        return "timeout";
      case "TypeError":
        return "type_error";
      default:
        return "internal_error";
    }
  }
  return "unknown_error";
}

function safeIdentifier(
  value: unknown,
  fallback: string | undefined,
): string | undefined {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value)
    ? value
    : fallback;
}

function safeRequestId(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_REQUEST_ID.test(value)
    ? value
    : undefined;
}

function safeStatusCategory(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value >= 400 && value <= 499) return "http_4xx";
  if (value >= 500 && value <= 599) return "http_5xx";
  if (value >= 200 && value <= 399) return "http_success";
  return undefined;
}

function safeBoundedNumber(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}
