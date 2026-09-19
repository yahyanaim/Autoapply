import { describe, expect, it, vi } from "vitest";
import {
  GoogleSheetsEarlyUsersStore,
  readGoogleSheetsEarlyUsersConfiguration,
} from "./google-sheets-store";
import { createEarlyUserRequestHandler } from "./handler";
import {
  EARLY_USER_SHEET_COLUMNS,
  isValidEarlyUserIdempotencyKey,
  parseEarlyUserSubmission,
  type EarlyUserSubmission,
} from "./submission";
import {
  EarlyUserSubmissionService,
  type EarlyUserStore,
} from "./store";

const idempotencyKey = "early-user-request-0001";
const validSubmission = {
  firstName: "Avery",
  email: "AVERY@example.test",
  country: "France",
  jobSearchStatus: "actively-searching",
  preferredLanguage: "english",
  targetRole: "Product designer",
  heardAbout: "search",
  mainProblem: "Finding well-matched roles",
  consent: true,
  website: "",
};

function parsedSubmission(overrides: Record<string, unknown> = {}): EarlyUserSubmission {
  const result = parseEarlyUserSubmission({ ...validSubmission, ...overrides });
  if (!result.success) throw new Error("Expected a valid synthetic submission");
  return result.data;
}

class MemoryStore implements EarlyUserStore {
  readonly emails = new Set<string>();
  readonly claim = vi.fn(async (submission) => {
    if (this.emails.has(submission.email)) return "duplicate" as const;
    this.emails.add(submission.email);
    return "created" as const;
  });
}

function request(body: unknown, key = idempotencyKey): Request {
  return new Request("https://applyai.test/api/early-users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
}

describe("early-user submission validation", () => {
  it("normalizes a valid email and keeps only the approved fields", () => {
    const result = parseEarlyUserSubmission(validSubmission);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.email).toBe("avery@example.test");
    expect(result.data).not.toHaveProperty("website");
    expect(result.data).not.toHaveProperty("mainProblem", undefined);
  });

  it("rejects invalid email, missing consent, overlong free text, and honeypot input", () => {
    expect(parseEarlyUserSubmission({ ...validSubmission, email: "not-an-email" }).success).toBe(false);
    expect(parseEarlyUserSubmission({ ...validSubmission, consent: false }).success).toBe(false);
    expect(
      parseEarlyUserSubmission({ ...validSubmission, mainProblem: "x".repeat(501) }).success,
    ).toBe(false);
    expect(parseEarlyUserSubmission({ ...validSubmission, website: "spam.example" }).success).toBe(false);
  });

  it("rejects unapproved payload fields and malformed idempotency keys", () => {
    expect(parseEarlyUserSubmission({ ...validSubmission, resumeText: "never accepted" }).success).toBe(false);
    expect(isValidEarlyUserIdempotencyKey("short")).toBe(false);
    expect(isValidEarlyUserIdempotencyKey(idempotencyKey)).toBe(true);
  });
});

describe("early-user request handler", () => {
  it("returns generic validation and unavailable-storage errors without echoing data", async () => {
    const unavailable = createEarlyUserRequestHandler({ getService: () => undefined });
    const invalid = await unavailable(request({ ...validSubmission, consent: false }));
    const unavailableResponse = await unavailable(request(validSubmission));

    expect(invalid.status).toBe(400);
    expect(await invalid.text()).not.toContain(validSubmission.email);
    expect(unavailableResponse.status).toBe(503);
    expect(await unavailableResponse.text()).not.toContain(validSubmission.email);
  });

  it("accepts duplicate email and idempotent retries with the same safe response", async () => {
    const store = new MemoryStore();
    const service = new EarlyUserSubmissionService(store, () => 1_735_689_600_000);
    const handler = createEarlyUserRequestHandler({ getService: () => service });

    const first = await handler(request(validSubmission));
    const retry = await handler(request(validSubmission));
    const duplicate = await handler(request({ ...validSubmission, email: "avery@example.test" }, "early-user-request-0002"));

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(store.claim).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent retries and logs only a fixed error category on storage failure", async () => {
    let resolveClaim: ((result: "created") => void) | undefined;
    const store: EarlyUserStore = {
      claim: vi.fn(
        () =>
          new Promise<"created">((resolve) => {
            resolveClaim = resolve;
          }),
      ),
    };
    const service = new EarlyUserSubmissionService(store);
    const handler = createEarlyUserRequestHandler({ getService: () => service });
    const first = handler(request(validSubmission));
    const retry = handler(request(validSubmission));
    await vi.waitFor(() => expect(resolveClaim).toBeTypeOf("function"));
    resolveClaim?.("created");

    expect((await first).status).toBe(200);
    expect((await retry).status).toBe(200);
    expect(store.claim).toHaveBeenCalledTimes(1);

    const reportFailure = vi.fn();
    const failingHandler = createEarlyUserRequestHandler({
      getService: () => ({
        submit: vi.fn().mockRejectedValue(new Error(`credential ${validSubmission.email}`)),
      }) as unknown as EarlyUserSubmissionService,
      reportFailure,
    });
    const failed = await failingHandler(request(validSubmission));
    expect(failed.status).toBe(503);
    expect(reportFailure).toHaveBeenCalledWith("early_user_submission_failed");
    expect(JSON.stringify(reportFailure.mock.calls)).not.toContain(validSubmission.email);
    expect(await failed.text()).not.toContain(validSubmission.email);
  });
});

describe("Google Sheets early-user adapter", () => {
  const configuration = {
    EARLY_USERS_SHEET_ID: "sheet_identifier_1234567890",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "early-users@applyai-test.iam.gserviceaccount.com",
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "not-a-real-private-key",
    EARLY_USERS_SHEET_NAME: "Early Users",
  };

  it("treats missing configuration as unavailable", () => {
    expect(readGoogleSheetsEarlyUsersConfiguration({})).toBeUndefined();
    expect(
      readGoogleSheetsEarlyUsersConfiguration({
        EARLY_USERS_SHEET_ID: configuration.EARLY_USERS_SHEET_ID,
      }),
    ).toBeUndefined();
  });

  it("uses only the approved spreadsheet columns with a mocked Google API", async () => {
    const parsed = parsedSubmission();
    const googleConfiguration = readGoogleSheetsEarlyUsersConfiguration(configuration);
    if (!googleConfiguration) throw new Error("Expected synthetic Google configuration");

    // Signing is intentionally not exercised against a real key or network in
    // unit tests. This test covers request construction after a token is cached.
    const mockFetch = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.includes("values/")) {
        if (init?.method === "POST") return new Response(JSON.stringify({ updates: {} }), { status: 200 });
        return new Response(JSON.stringify({ values: [EARLY_USER_SHEET_COLUMNS] }), { status: 200 });
      }
      return new Response(JSON.stringify({ access_token: "synthetic", expires_in: 3600 }), { status: 200 });
    });

    const store = new GoogleSheetsEarlyUsersStore(googleConfiguration, mockFetch, () => 1_735_689_600_000);
    // Seed the access token by replacing the private method for this fully mocked unit.
    Object.defineProperty(store, "accessToken", {
      value: { value: "synthetic", expiresAt: 1_735_689_700_000 },
      writable: true,
    });

    await expect(
      store.claim({
        ...parsed,
        createdAt: "2025-01-01T00:00:00.000Z",
        source: "landing-page",
        status: "new",
      }),
    ).resolves.toBe("created");

    const appendCall = mockFetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(appendCall?.[0]).toContain(":append");
    expect(appendCall?.[1]?.body).toContain("avery@example.test");
    expect(appendCall?.[1]?.body).not.toContain("website");
  });

  it("does not append when a normalized duplicate already exists or headers are wrong", async () => {
    const parsed = parsedSubmission();
    const googleConfiguration = readGoogleSheetsEarlyUsersConfiguration(configuration);
    if (!googleConfiguration) throw new Error("Expected synthetic Google configuration");
    const mockFetch = vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ updates: {} }), { status: 200 });
      return new Response(
        JSON.stringify({ values: [EARLY_USER_SHEET_COLUMNS, ["", "", "AVERY@EXAMPLE.TEST"]] }),
        { status: 200 },
      );
    });
    const store = new GoogleSheetsEarlyUsersStore(googleConfiguration, mockFetch, () => 1_735_689_600_000);
    Object.defineProperty(store, "accessToken", {
      value: { value: "synthetic", expiresAt: 1_735_689_700_000 },
      writable: true,
    });

    await expect(
      store.claim({ ...parsed, createdAt: "2025-01-01T00:00:00.000Z", source: "landing-page", status: "new" }),
    ).resolves.toBe("duplicate");
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});
