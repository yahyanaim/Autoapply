# Independent Morocco career assistant

This module powers Nori, the floating Morocco career chatbot. It is deliberately
isolated from `modules/ai`.

## Isolation contract

- Uses only `DAHL_CAREER_CHAT_*` configuration.
- Does not import `AIModule`, `AIService`, `AIProviderFactory`, or CV/application
  prompts.
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
- 3,500 conservatively estimated input-plus-output tokens per upstream attempt
  by default.
- 250,000 conservatively reserved provider tokens per UTC day by default.
- 5,000,000 conservatively reserved provider tokens per UTC month by default.
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
DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS=3500
DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET=250000
DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET=5000000
DAHL_CAREER_CHAT_MAX_RETRIES=2
DAHL_CAREER_CHAT_RETRY_BASE_DELAY_MS=200
DAHL_CAREER_CHAT_CIRCUIT_BREAKER_FAILURE_THRESHOLD=3
DAHL_CAREER_CHAT_CIRCUIT_BREAKER_RESET_MS=30000
DAHL_CAREER_CHAT_HEALTH_TIMEOUT_MS=3000
```
