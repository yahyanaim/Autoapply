# Independent Morocco career assistant

This module powers Nori, the floating Morocco career chatbot. It is deliberately
isolated from `modules/ai` and is loaded only by the standalone Nori root
module. The full ApplyAI `AppModule` does not import this module or expose its
routes.

## Isolation contract

- Uses only `DAHL_CAREER_CHAT_*` configuration.
- Does not import `AIModule`, `AIService`, `AIProviderFactory`, or CV/application
  prompts.
- Is not registered in the authenticated ApplyAI API or its readiness checks.
- Does not reserve or consume `UsageLimit.aiRequestsUsed`.
- Has its own user-aware/IP-aware request throttle.
- Does not receive resume, profile, application, or account data.
- Conversation messages are sent for the current response and are not persisted.

## Standalone deployment

Set `CAREER_CHAT_STANDALONE=true` on a deployment dedicated to Nori. The
bootstrap loader then imports `CareerChatStandaloneModule` instead of the full
`AppModule`.

Standalone mode:

- does not import or connect Prisma, PostgreSQL, BullMQ, JWT auth, Stripe, S3
  storage, or the existing AI providers;
- uses Redis only for shared abuse and provider-budget state; production
  requires it, while local single-instance development may omit it;
- uses only the dedicated Dahl key and bounded official Morocco career context;
- exposes `GET /health`, `GET /health/ready`, and
  `POST /career-chat/messages`;
- uses the built-in in-memory IP throttle only for non-production,
  single-instance development when `REDIS_URL` is absent;
- automatically uses the shared atomic Redis throttle when `REDIS_URL` is set,
  which is required when multiple serverless instances serve the endpoint.

## Endpoint

```text
POST /career-chat/messages
```

The request contains between 1 and 12 bounded `user`/`assistant` messages and
must end with a user question.

## Provider

Dahl exposes an OpenAI-compatible chat-completions endpoint:

```text
https://inference.dahl.global/v1/chat/completions
```

The API key is read only on the backend. Never use a `NEXT_PUBLIC_*` or `VITE_*`
variable for it.

## Trusted context

The assistant receives:

- a small set of official Morocco career-resource URLs;
- in the full API, at most six recently indexed, public, Morocco-located
  ApplyAI jobs;
- in standalone mode, no database listings;
- no private or user-captured jobs.

Only allow-listed sources actually cited by the model are returned as clickable
links to the dashboard. Only credential-free HTTPS URLs are accepted. Provider
markup is neutralized by the API and rendered as React text, never injected as
HTML.

## Limits

- 20 requests per hour per verified user ID or trusted-proxy-aware IP.
- 12 messages per request.
- 2,000 characters per message.
- 8,000 total conversation characters.
- 700 output tokens by default.
- 12,000 conservatively estimated input-plus-output units per upstream attempt
  by default.
- 250,000 conservative reservation units per UTC day by default.
- 5,000,000 conservative reservation units per UTC month by default.
- 30-second provider timeout by default.

Set `TRUST_PROXY_HOPS=1` on the Vercel deployment so Express uses the visitor
address supplied by Vercel rather than treating the edge proxy as the visitor.
Do not enable trust proxy when the service is directly reachable through an
untrusted proxy.

Budget reservation uses UTF-8 bytes as a conservative tokenizer-independent
input bound and reserves the worst-case cost of every configured retry before
the first provider call. It is atomic in Redis when `REDIS_URL` is configured.
Without Redis it remains process-local, which is permitted only for local,
single-instance development. A configured Redis limiter fails closed rather
than silently granting a new local allowance during an outage.

### Usable request allowance

The default is a local cost-safety ceiling, not MiniMax's context window. The
actual framed policy/static context uses about 3.3 KB before conversation text.
A full 2,000-character ordinary-Unicode question can add 6 KB; output allowance,
the greeting and framing also count. A 12,000-unit ceiling leaves useful room
without removing policy or changing daily/monthly budgets. Input units remain
UTF-8 bytes, not measured model tokens; worst-case retries multiply the reservation
for the shared budgets, not the per-attempt ceiling.

Startup derives the minimum from the same production prompt, context and Dahl
framing, a full three-byte-Unicode question, configured output allowance and 256
bytes of starter-history headroom. An explicitly configured old 3,500 ceiling
now fails startup with `CAREER_CHAT_REQUEST_BUDGET_INVALID`; operators must review
and update that dedicated Nori setting before deploying this revision. No live
configuration is changed by the repository default. Escape-heavy input and long
multi-turn histories can still exceed the runtime ceiling and are rejected.

Both daily and monthly budgets must also fund the minimum supported API starter:
one `Hi` user message without prior history, using the same real framing and
configured maximum output allowance, multiplied by `MAX_RETRIES + 1`. Startup
accepts that exact reservation and rejects a budget one unit below it with
`CAREER_CHAT_REQUEST_BUDGET_INVALID`, naming only the setting and required units.
The fixed 3,500-unit aggregate validation floor is replaced by this derived
floor; default budgets and their upper bounds are unchanged. Validation never
raises a budget automatically. Longer questions, the UI greeting and conversation
history require more capacity than this minimum. The budgets are shared across
the service, not per visitor, and are conservative units rather than measured
provider tokens or monetary charges.

Conversation content above 8,000 characters returns HTTP 413 with
`CAREER_CHAT_CONVERSATION_TOO_LONG`. A framed request exceeding its configured
allowance returns HTTP 413 with `CAREER_CHAT_REQUEST_BUDGET_EXCEEDED`. Neither
error includes conversation content or provider details.

### Assistant-message compatibility

Both incoming user and assistant messages retain the 2,000-character limit.
Accepted provider answers must fit that same limit (and the existing output
token-derived limit). An oversized answer is rejected intact with HTTP 502 and
`CAREER_CHAT_RESPONSE_TOO_LONG`, asking the visitor to request a shorter answer.
It is never silently truncated or inserted into the next turn as an invalid
assistant message. This policy does not guarantee unlimited history: the
aggregate conversation and framed-byte limits still apply.

The prompt asks for at most approximately 1,500 characters including source URLs
in English, French, Arabic or Darija, prioritizing essential guidance and sources
and offering expansion in a later turn. This is guidance, not a replacement for
validation. The hard response boundary uses JavaScript string length (UTF-16 code
units), so supplementary Unicode characters can use two units each. There is no
automatic regeneration or additional provider call for an overlength answer.
The existing circuit policy is unchanged: three consecutive invalid/overlength
responses open the default 30-second circuit, just like other counted failures.

Provider answers are deliberately not cached because this public endpoint
promises that chat messages and answers are not stored. Frequently requested,
stable guidance should be published as reviewed static product content rather
than placing provider conversations in a shared cache.

## Reliability and telemetry

- Transient network errors, HTTP 429, and HTTP 5xx receive at most two retries
  with bounded backoff inside one total provider deadline.
- HTTP 400, 401, 402, and 403 responses are never retried.
- Three consecutive provider failures open a 30-second circuit breaker by
  default.
- `CareerChatHealthService.check()` probes Dahl's public `/v1/models` endpoint
  without sending the provider key or any conversation content.
- Anonymous logs contain only outcome, latency, reserved token estimate,
  attempt count, and model. Prompts, answers, API keys, and user identifiers are
  never logged.

Relevant settings:

```text
DAHL_CAREER_CHAT_MAX_OUTPUT_TOKENS=700
DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS=12000
DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET=250000
DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET=5000000
DAHL_CAREER_CHAT_MAX_RETRIES=2
DAHL_CAREER_CHAT_RETRY_BASE_DELAY_MS=200
DAHL_CAREER_CHAT_CIRCUIT_BREAKER_FAILURE_THRESHOLD=3
DAHL_CAREER_CHAT_CIRCUIT_BREAKER_RESET_MS=30000
DAHL_CAREER_CHAT_HEALTH_TIMEOUT_MS=3000
```
