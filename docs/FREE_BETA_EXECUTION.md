# Free beta execution boundary

This document describes the code and deployment contract for ApplyAI's closed
beta. It is a readiness guide, not proof that any external account or
production environment has been configured.

## Plan-routing contract

The dashboard and browser extension submit authenticated product actions only.
They never choose a plan, provider, queue, worker, or infrastructure target.
`PlanAwareAiRouter` looks up the current `Subscription` in PostgreSQL for every
AI execution and applies this matrix:

| Trusted entitlement                                   | Execution boundary | Provider path                                       | Queue for resume parsing |
| ----------------------------------------------------- | ------------------ | --------------------------------------------------- | ------------------------ |
| `free` + `active`                                     | Free               | `GlmProvider` directly                              | `resume-parse-free`      |
| `pro`/`premium` + `active`, `trialing`, or `past_due` | Paid               | Existing `AIProviderFactory.completeWithFallback()` | `resume-parse-paid`      |
| Missing, cancelled, inconsistent, or unknown          | None               | No provider call                                    | No enqueue               |

The router never accepts a client `plan`, `tier`, `provider`, or queue field.
Free executions invoke GLM directly and cannot reach the paid factory. Paid
executions use the existing paid provider order and never invoke GLM. The
separation is independent of `BETA_MODE`: beta capacity controls registration,
not provider authorization.

Resume parsing has physical queue separation. `ResumeService` resolves the
server-side boundary before storing queue metadata, and signs the
server-generated `{ resumeId, userId, executionBoundary, jobId }` identity
with the dedicated `RESUME_QUEUE_SIGNING_KEY`. The worker verifies that
signature and exact queue/job ID, confirms resume ownership, then atomically
claims the stable `(queue, job ID)` identity before parsing. The unique claim
prevents a delivered job attempt from invoking a provider twice. A later
BullMQ delivery is accepted only when the preceding real retryable failure
atomically authorized that exact next attempt; changing the mutable BullMQ
attempt counter or replaying the original signed payload cannot create an
authorization. This is **at-most-once per delivery attempt; intentional
retries are separately authorized and idempotent.** It resolves
the subscription again immediately before parsing, and `AIService` resolves it
again immediately before provider execution. A job copied to the wrong queue
or changed in Redis is rejected before a parser or AI provider is called. If a
valid queued job's entitlement changes before processing, the document is
marked failed so it cannot remain indefinitely pending; the user can upload it
again under the current plan. Failed GLM calls release their existing reserved
quota atomically and never enter the paid fallback chain.

Other current AI features execute synchronously through the same router in the
trusted API. They have logical provider isolation now. Splitting those request
paths into dedicated network workers is intentionally deferred until a concrete
asynchronous product workload exists; do not create public worker endpoints or
allow a browser to select an internal endpoint.

## Configuration contract

All values below are server-only. Use placeholders in source control and put
real values in the deployment secret manager only.

```text
APP_PROCESS_ROLE=api|worker|all
AI_EXECUTION_ROLE=all|free|paid
FREE_AI_PROVIDER=glm
GLM_FREE_PLAN_API_KEY=
GLM_FREE_PLAN_MODEL=
GLM_FREE_PLAN_BASE_URL=
GLM_FREE_PLAN_TIMEOUT_MS=30000
GLM_FREE_PLAN_MAX_OUTPUT_TOKENS=2048
GLM_FREE_PLAN_MAX_INPUT_BYTES=100000
RESUME_QUEUE_SIGNING_KEY=
RESUME_PARSE_LEGACY_DRAIN_ENABLED=false
```

`GLM_FREE_PLAN_*` is required only when `AI_EXECUTION_ROLE` can execute Free
work (`all` or `free`). The base URL must be a public HTTPS hostname with no
credentials, query, fragment, local name, IP literal, or non-standard port.
The adapter is intentionally isolated from the OpenAI-compatible paid adapter;
adding GLM to `AI_FALLBACK_PROVIDERS` is prohibited.
`RESUME_QUEUE_SIGNING_KEY` is required in production for every API/worker that
creates or consumes resume jobs. Generate a distinct 32-byte base64 value with
`openssl rand -base64 32`; never reuse the JWT, MFA, provider, or session key.
`RESUME_PARSE_LEGACY_DRAIN_ENABLED` is false in normal operation. It may only
be true on a dedicated worker used to quarantine unsigned legacy jobs.

Run the public API with `APP_PROCESS_ROLE=api`. Run a Free resume worker with
`APP_PROCESS_ROLE=worker` and `AI_EXECUTION_ROLE=free`; it binds no HTTP
listener. The shipped paid worker uses `AI_EXECUTION_ROLE=paid`. The public API
uses `AI_EXECUTION_ROLE=all` because it owns authenticated synchronous product
actions. A Free worker must receive the GLM key and must not receive
paid-provider keys. A paid worker must receive paid-provider keys and must not
receive GLM credentials.

## Quotas and provider budgets

AI requests reserve the existing general allowance atomically before provider
execution. A provider, validation, timeout, or persistence failure releases
that reservation with an atomic guarded decrement; the counter cannot become
negative. A successful GLM request records only normalized metadata with
`provider: "glm"`; prompts, CV text, generated documents, headers, and provider
responses are not stored in AI request accounting.

Paid requests retain the existing provider order and circuit breakers. The
factory also enforces a maximum attempt count, a shared timeout budget,
provider-specific output limits, and a total estimated fallback-cost ceiling.
The total ceiling is always clamped to the per-request maximum, so a fallback
cannot make one paid request exceed that request's configured cost cap. The
estimate is conservative and is not billed-cost reconciliation. Free work has
a paid-provider budget of zero because it does not enter the paid factory.

## Storage, Redis, and container roles

The S3 adapter accepts normal AWS S3 defaults or a validated S3-compatible
endpoint for Cloudflare R2:

```text
STORAGE_DRIVER=s3
S3_BUCKET_RESUMES=
S3_ENDPOINT=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
```

Object keys are opaque UUIDs; uploaded filenames are not retained in the key.
Objects remain private and retain server-side encryption. `S3_FORCE_PATH_STYLE`
is explicit because R2 setup varies; do not enable it without confirming the
selected endpoint's addressing requirements.

For the beta, select one managed Redis/Valkey design for the entire Free
environment (for example, one Upstash Redis instance) and use it for rate
limits and both BullMQ queues. Do not silently fall back to paid Redis. Before
separating credentials between workers, configure provider-supported ACLs or a
network boundary so the Free worker can consume only Free queue traffic. Local
Docker development may use the repository's local Redis service only. A
restricted Free/Paid process does not initialize a client for the other resume
queue, but that code boundary is not a substitute for Redis ACLs or isolated
credentials in a deployed environment.

`infra/docker/api.Dockerfile` is the public API image. It sets
`APP_PROCESS_ROLE=api`, runs as a non-root user, and exposes `/health` for the
container health check. `infra/docker/free-worker.Dockerfile` builds the same
verified API artifact but sets `APP_PROCESS_ROLE=worker` and
`AI_EXECUTION_ROLE=free`; it has no listening port and uses a process liveness
check. Both pin pnpm to `10.30.3`.

`infra/docker/docker-compose.yml` starts `resume-worker-free` and
`resume-worker-paid` after Redis and the migration service are ready. It pins
their roles explicitly so a value in the local `.env` file cannot make the API
also consume jobs. The local workers share `api_uploads` only because local
development may use `STORAGE_DRIVER=local`; deployed workers read private
object storage instead. Compose uses one local development environment file,
so it is not a production credential-isolation model.

The EKS base starts one `resume-worker-free` Deployment and one
`resume-worker-paid` Deployment using the same tested API image. They expose
no Service or HTTP port, use a process-liveness probe, and receive a 150-second
termination grace period so `Worker.close()` can finish an active job before
Kubernetes terminates the process. Their `Recreate` rollout strategy avoids
unnecessary overlapping worker generations; work waits safely in Redis during
the short handoff.

EKS requires three externally managed secrets. They are deliberately not
defined in this repository:

| Secret | Required contents | Must not contain |
| --- | --- | --- |
| `api-secrets` | Full public-API configuration, including Stripe and GLM values | — |
| `resume-worker-free-secrets` | Common worker values (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `RESUME_QUEUE_SIGNING_KEY`, `DASHBOARD_URL`, storage access) plus `GLM_FREE_PLAN_*` | Paid-provider and Stripe credentials |
| `resume-worker-paid-secrets` | Common worker values and storage access plus the selected paid-provider configuration and its credentials | `GLM_FREE_PLAN_*` and Stripe credentials |

`RESUME_QUEUE_SIGNING_KEY` must be the same value in all three secrets. The
worker secrets may use distinct least-privilege database, Redis, or object
storage credentials, but they must reach the same product records, queue
namespace, and resume objects. When Redis ACLs are available, grant the Free
worker access only to `resume-parse-free` and the paid worker only to
`resume-parse-paid` plus the redacted DLQ. The deployment preflight validates
the required keys, the shared signing key, the GLM configuration, and the
paid-provider selection before it runs database migrations.

## Legacy `resume-parse` queue retirement

The old, unsegmented `resume-parse` queue predates signed job identities. Its
jobs contain an unsigned `{ resumeId, userId }` payload and cannot prove that
they were authorized by the current API. Normal Free and paid workers never
consume it, and it is never a source for re-signing or replaying work.

Treat legacy retirement as a one-time, manually approved quarantine procedure:

1. Confirm every old worker deployment has stopped and only the signed
   `resume-parse-free` and `resume-parse-paid` consumers remain.
2. Record legacy queue counts for `waiting`, `prioritized`, `delayed`,
   `paused`, and `active`; wait for active leases from former workers to clear.
3. Start one dedicated worker with `APP_PROCESS_ROLE=worker` and
   `RESUME_PARSE_LEGACY_DRAIN_ENABLED=true`. It quarantines each unprocessed
   legacy job without executing it. A retained record contains only the
   original job ID, original queue name, attempt count, a safe error category,
   and the quarantine timestamp.
   Never copy `job.data`, resume identifiers, filenames, errors, or CV text to
   the DLQ, activity log, Sentry, or ordinary logs.
4. Remove the quarantined legacy job only after its redacted record is durable.
   Do not use `retry`, `promote`, automatic migration, or a bulk Redis
   `drain`/`obliterate` operation, which would lose forensic evidence or allow
   unsigned execution.
5. Verify all live legacy states are zero, stop and remove the dedicated drain
   worker, retain the redacted quarantine records for the incident-retention
   period, and leave the queue name unused. Resolve any still-pending user
   record through a separately reviewed, database-authorized recovery path;
   users can safely upload the document again under the current entitlement.

## Beta capacity and privacy

`BETA_MODE` and `BETA_MAX_REGISTRATIONS` preserve the existing atomic
registration gate. The singleton counter lives in the registration transaction
with user, subscription, and usage-limit creation. Do not reset or delete it
during rollback; disabling `BETA_MODE` only bypasses future slot claims.

Sentry remains disabled by default and is separately configured for API,
dashboard browser, and dashboard server/edge runtimes. Its existing allow-list
sanitizers and transport filtering remain mandatory. Ordinary API and worker
logs use an allow-list serializer: they retain only validated technical event,
component, provider, status category, duration, attempt, and request ID data.
They never serialize an input error, CV, prompt, generated text, filename,
signed URL, address, identity, header, cookie, token, key, DSN, or queue
payload.

## Closed-beta capacity and degradation

The initial operational assumption is approximately 100 invited testers, not
an unlimited Free service. Keep the existing request throttles, upload size
limit, plan quotas, provider input/output bounds, and three-attempt queue
limit. Monitor queue age, failed jobs, provider errors, Redis availability,
storage health, and daily AI use. When a Free dependency fails, return a safe
retryable error or mark the queued document failed; never spend a paid provider
or route Free traffic through paid infrastructure as an automatic fallback.

## Deployment sequence (manual and deferred)

1. Configure isolated staging PostgreSQL, one selected Redis/Valkey service,
   private R2 bucket, and a GLM beta credential outside this repository.
2. Give the API, Free worker, and paid worker only their required credentials.
3. Run `prisma migrate deploy` exactly once as a controlled release job before
   rolling out application containers. Do not run migrations from every
   replica or container startup command.
4. Start the API and workers from the same tested commit. Check API readiness,
   queue processing, and one synthetic Free and paid request in staging.
5. Configure encrypted database snapshots/logical backups and test restore in
   a database whose name contains `test` before inviting users.
6. Configure DNS/TLS, monitoring, email, Stripe, Sentry, provider alerts, and
   a rollback owner externally. These have not been provisioned or verified by
   this repository change.

Rollback deploys a known-good application image and disables new beta
registrations if necessary. Preserve the additive Beta Gate table and its
stored count. A source review cannot prove Oracle, Neon/Supabase, Upstash, R2,
GLM, Cloudflare, Sentry, email, Stripe, DNS, TLS, backups, or production
readiness; all require isolated staging smoke tests.
