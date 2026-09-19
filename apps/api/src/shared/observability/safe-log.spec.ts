import { BadRequestException } from "@nestjs/common";
import { serializeSafeLog } from "./safe-log";

describe("serializeSafeLog", () => {
  it("allows only bounded technical metadata and drops synthetic sensitive values recursively", () => {
    const secret = "synthetic-secret-should-never-appear";
    const serialized = serializeSafeLog({
      event: "provider_failed",
      component: "ai",
      requestId: "request_12345678",
      provider: "glm",
      action: "resume_parse",
      statusCode: 503,
      durationMs: 42,
      attempt: 1,
      error: new BadRequestException({
        message: `CV email@example.test ${secret}`,
        authorization: `Bearer ${secret}`,
        nested: {
          prompt: secret,
          url: `https://storage.example.test/${secret}`,
        },
      }),
      // Unknown input is intentionally ignored without traversal.
      extra: { cv: secret, circular: null },
    } as never);

    const output = JSON.parse(serialized) as Record<string, unknown>;
    expect(output).toEqual({
      event: "provider_failed",
      component: "ai",
      requestId: "request_12345678",
      provider: "glm",
      action: "resume_parse",
      statusCategory: "http_5xx",
      durationMs: 42,
      attempt: 1,
      errorCategory: "http_4xx",
    });
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("email@example.test");
    expect(serialized).not.toContain("authorization");
  });

  it("fails closed for throwing getters and never returns the original object", () => {
    const input = {
      event: "safe_event",
      component: "worker",
      get error() {
        throw new Error("synthetic sensitive failure");
      },
    };

    expect(serializeSafeLog(input)).toBe(
      '{"event":"log_sanitization_failed","component":"observability"}',
    );
  });
});
