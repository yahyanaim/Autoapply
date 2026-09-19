import { createHash } from "node:crypto";
import type {
  EarlyUserSubmission,
  StoredEarlyUserSubmission,
} from "./submission";

export type EarlyUserClaimResult = "created" | "duplicate";

/**
 * Adapters must never expose stored values or provider failures back to the
 * request handler. The sheet adapter uses email as the durable duplicate key.
 */
export interface EarlyUserStore {
  claim(submission: StoredEarlyUserSubmission): Promise<EarlyUserClaimResult>;
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("An idempotency key cannot be reused for a different submission.");
  }
}

interface CachedResult {
  expiresAt: number;
  fingerprint: string;
  result: EarlyUserClaimResult;
}

interface InFlightSubmission {
  fingerprint: string;
  promise: Promise<EarlyUserClaimResult>;
}

const COMPLETED_IDEMPOTENCY_TTL_MS = 10 * 60 * 1_000;

/**
 * Coalesces concurrent delivery of an opaque key and remembers completed
 * requests briefly. The store remains responsible for durable email dedupe
 * across cold starts; no raw applicant data is retained in these maps.
 */
export class EarlyUserSubmissionService {
  private readonly completed = new Map<string, CachedResult>();
  private readonly inFlight = new Map<string, InFlightSubmission>();

  constructor(
    private readonly store: EarlyUserStore,
    private readonly now: () => number = Date.now,
  ) {}

  async submit(
    submission: EarlyUserSubmission,
    idempotencyKey: string,
  ): Promise<EarlyUserClaimResult> {
    const fingerprint = fingerprintSubmission(submission);
    this.pruneCompleted();

    const cached = this.completed.get(idempotencyKey);
    if (cached) {
      this.assertSameSubmission(cached.fingerprint, fingerprint);
      return cached.result;
    }

    const pending = this.inFlight.get(idempotencyKey);
    if (pending) {
      this.assertSameSubmission(pending.fingerprint, fingerprint);
      return pending.promise;
    }

    const promise = this.store
      .claim({
        ...submission,
        createdAt: new Date(this.now()).toISOString(),
        source: "landing-page",
        status: "new",
      })
      .then((result) => {
        this.completed.set(idempotencyKey, {
          expiresAt: this.now() + COMPLETED_IDEMPOTENCY_TTL_MS,
          fingerprint,
          result,
        });
        return result;
      })
      .finally(() => {
        this.inFlight.delete(idempotencyKey);
      });

    this.inFlight.set(idempotencyKey, { fingerprint, promise });
    return promise;
  }

  private assertSameSubmission(existing: string, received: string): void {
    if (existing !== received) throw new IdempotencyConflictError();
  }

  private pruneCompleted(): void {
    const now = this.now();
    for (const [key, result] of Array.from(this.completed.entries())) {
      if (result.expiresAt <= now) this.completed.delete(key);
    }
  }
}

function fingerprintSubmission(submission: EarlyUserSubmission): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        submission.firstName,
        submission.email,
        submission.country,
        submission.jobSearchStatus,
        submission.preferredLanguage,
        submission.targetRole ?? "",
        submission.heardAbout ?? "",
        submission.mainProblem ?? "",
        submission.consent,
      ]),
    )
    .digest("hex");
}
