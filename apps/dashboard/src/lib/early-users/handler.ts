import {
  isValidEarlyUserIdempotencyKey,
  parseEarlyUserSubmission,
} from "./submission";
import { EarlyUserSubmissionService } from "./store";

const INVALID_SUBMISSION_MESSAGE =
  "Please check the required fields and try again.";
const TEMPORARY_FAILURE_MESSAGE =
  "We could not add you to the early-user list right now. Please try again later.";

export interface EarlyUserRequestHandlerDependencies {
  getService: () => EarlyUserSubmissionService | undefined;
  reportFailure?: (category: "early_user_submission_failed") => void;
}

/**
 * The handler is framework-agnostic so its privacy behaviour can be tested
 * without starting Next.js or contacting Google. It deliberately never logs a
 * request body, idempotency key, provider response, address, or exception.
 */
export function createEarlyUserRequestHandler({
  getService,
  reportFailure = () => undefined,
}: EarlyUserRequestHandlerDependencies) {
  return async function handleEarlyUserRequest(request: Request): Promise<Response> {
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!isValidEarlyUserIdempotencyKey(idempotencyKey)) {
      return response(INVALID_SUBMISSION_MESSAGE, 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response(INVALID_SUBMISSION_MESSAGE, 400);
    }

    const parsed = parseEarlyUserSubmission(body);
    if (!parsed.success) return response(INVALID_SUBMISSION_MESSAGE, 400);

    const service = getService();
    if (!service) return response(TEMPORARY_FAILURE_MESSAGE, 503);

    try {
      await service.submit(parsed.data, idempotencyKey);
      return Response.json({ ok: true }, { status: 200 });
    } catch {
      reportFailure("early_user_submission_failed");
      return response(TEMPORARY_FAILURE_MESSAGE, 503);
    }
  };
}

function response(message: string, status: number): Response {
  return Response.json({ ok: false, message }, { status });
}
