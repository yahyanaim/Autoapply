# ApplyAI specification completion matrix

This document maps `docs/PRODUCT_SPEC.md` to the implementation. It deliberately separates
the MVP build from later roadmap phases and from release gates that require
external organizations or production infrastructure.

## Status

- **Implemented** — source behavior and repository-level automated coverage
  exist.
- **Partially implemented** — the core behavior exists, but some live-provider,
  environment, or release validation remains.
- **Planned** — designed or assigned to a later product phase, but not
  implemented.
- **Requires infrastructure** — source support may exist, but completion or
  proof requires deployed services, an operator, or a third party.

## MVP product and platform

| Requirement                                             | Status                | Evidence / remaining work                                                                                                                                                                              |
| ------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Modular NestJS, Next.js dashboard, MV3 extension        | Implemented           | Monorepo builds all three production artifacts.                                                                                                                                                        |
| PostgreSQL/Prisma schema and migrations                 | Implemented           | Schema validates and the repository includes ordered migrations.                                                                                                                                       |
| Email/password and Google/GitHub authentication         | Implemented           | Argon2id, verified OAuth email selection, rotating refresh sessions, and token-family replay response.                                                                                                 |
| Active-session view and revocation                      | Implemented           | Settings lists active devices and supports current, individual, and all-other revocation.                                                                                                              |
| Complete candidate preferences                          | Implemented           | Location, workplace preference, salary range, work authorization, phone, LinkedIn, and portfolio are editable and exportable.                                                                          |
| Resume upload, storage, PDF/DOCX parsing                | Implemented           | Size/type/ZIP-bomb controls, isolated PDF worker, local/S3 adapters.                                                                                                                                   |
| Match score and explainability                          | Implemented           | Versioned deterministic scoring compares the original verified CV with the job, returns confidence/category evidence and gaps, and reuses a privacy-conscious hash cache without consuming LLM tokens. |
| Resume optimization and generated ATS CV                | Implemented           | Structured truthfulness comparison blocks unsupported claims and exposes confirmation-required changes before authenticated PDF download.                                                              |
| Cover-letter generation                                 | Implemented           | Structured provider output validation, bounded tone choices, and an editable review surface.                                                                                                           |
| Unified application preparation                         | Implemented           | One workflow connects tenant-scoped job capture, structured job analysis, optimized CV, cover letter, editing, approval hashes, extension handoff and tracking.                                        |
| CV-based job discovery                                  | Implemented           | A ready resume can rank up to 20 jobs per run with verified-skill overlap, role alignment, keyword gaps, tracked-job detection, bounded approved-source refresh, and monthly plan allowances.          |
| Application tracker CRUD                                | Implemented           | List/Kanban/review views, preparation and submission states, timeline, notes, delete, and monthly quota visibility enforce tenant ownership.                                                           |
| Assistive extension autofill                            | Partially implemented | Greenhouse, Lever, Ashby and user-opened Moroccan-board adapters exist; live-site compatibility and Chrome Web Store approval require external validation.                                             |
| Dashboard account linking for the extension             | Implemented           | Two-minute single-use Pro handoff; extension sessions are revoked after downgrade and extension password login is rejected.                                                                            |
| Cover-letter dashboard workflow                         | Implemented           | Ready-resume selection, generation, review, and specificity regeneration are available on Jobs.                                                                                                        |
| Stripe Free/Pro/Premium billing                         | Partially implemented | Checkout, portal, webhook ledger, and reconciliation exist; live Stripe products, prices, secrets, and webhooks require production configuration.                                                      |
| Per-plan application/AI/discovery/resume/storage quotas | Implemented           | Atomic counters and rollback behavior are implemented; discovery allows 3 Free, 50 Pro, and unlimited Premium runs per month.                                                                          |
| Feature entitlements                                    | Implemented           | Free receives 5 monthly AI requests and 1 CV optimization; centralized guards keep cover letters, unified preparation, and extension access on Pro/Premium.                                            |
| Independent Morocco career chatbot                      | Implemented           | Nori is isolated, stateless, bounded, source-restricted, resilient to temporary provider failures, and covered by security/limit tests.                                                                |

## Security, privacy and reliability

| Requirement                                       | Status      | Evidence / remaining work                                                                                                                                                           |
| ------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-replica throttling                          | Implemented | Atomic Redis-backed Nest throttler uses verified user IDs for authenticated requests and IP fallback for public or invalid-token traffic.                                           |
| Exact public/authenticated/admin rate tiers       | Implemented | Public 100/15m, authenticated 1000/15m, admin 50/15m, login 10/15m.                                                                                                                 |
| Required production security headers              | Implemented | Explicit CSP, HSTS, frame denial, nosniff, referrer and permissions policy.                                                                                                         |
| HTTPS-only production URLs                        | Implemented | API config, dashboard build and deployment workflows reject HTTP.                                                                                                                   |
| Encrypted resume storage                          | Implemented | Production requires S3; uploads request AES-256 server-side encryption.                                                                                                             |
| GDPR consent, export and erasure                  | Implemented | Persistent explicit consent, feature gates, secret-free export, Stripe/file/database erasure.                                                                                       |
| Privileged-role MFA and session timeouts          | Implemented | TOTP enrollment, encrypted secrets, MFA-gated admin sessions, 15m idle/8h absolute limits.                                                                                          |
| AI input/output/time/cost controls                | Implemented | Byte, token, timeout and request-cost ceilings are enforced.                                                                                                                        |
| AI provider fallback/circuit breaker              | Implemented | Ordered fallback and per-provider circuits; partner APIs are allow-listed and circuit-broken.                                                                                       |
| Resume parsing retry and dead-letter visibility   | Implemented | The shipped queue uses stable job IDs, exponential backoff, idempotent completion, activity records, and a retained terminal DLQ.                                                   |
| Database-backed costly-mutation replay protection | Implemented | User-scoped fingerprints, atomic pending claims, stored successful responses, bounded expiry, and stable client keys prevent duplicate repository work and quota charges on replay. |
| Later asynchronous workflow queues                | Planned     | Resume optimization, job ingestion, autofill, and notification flows remain synchronous.                                                                                            |
| Dependency integrity and vulnerability scanning   | Implemented | Frozen lockfile install and dependency audit are part of `pnpm check` and CI.                                                                                                       |
| Audit logs and request tracing                    | Implemented | Separate request-ID traces, persisted access-denial/auth/queue audits, and provider-branch correlation.                                                                             |

## Testing and documentation

| Requirement                                 | Status                  | Evidence / remaining work                                                                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/regression tests                       | Implemented             | API, dashboard, and extension regression suites run in `pnpm check`.                                                                                                                                                                                                   |
| API/DB/queue integration tests              | Partially implemented   | CI uses real PostgreSQL and Redis for parsing, ownership, quotas, caches, workflows, billing, deletion, auth replay, and Nori limits. The application workflow replaces the upstream AI provider, and partner/Dahl live calls remain mocked or staging-dependent.      |
| Mocked dashboard critical-flow E2E          | Implemented             | CI runs the dashboard flow against deterministic API routes at desktop and Pixel 7 viewports.                                                                                                                                                                          |
| Live paid staging workflow                  | Requires infrastructure | The test logs into an existing isolated paid account and covers upload/parse, discovery, match, preparation replay, truthfulness review, approval, and cleanup. It requires `E2E_API_URL`, `E2E_PAID_EMAIL`, `E2E_PAID_PASSWORD`, indexed jobs, and working providers. |
| AI golden-set evaluation                    | Implemented             | Score-band golden sets and engineering, marketing, finance, and design truthfulness cases run in the standard suite.                                                                                                                                                   |
| Technical architecture documentation        | Implemented             | `docs/TECHNICAL.md` describes the source architecture and links to external operations.                                                                                                                                                                                |
| ADRs, data dictionary and incident runbooks | Implemented             | `docs/ADRS`, `DATA_DICTIONARY.md`, `INCIDENT_RESPONSE.md`, and the sub-processor register are present.                                                                                                                                                                 |

## Operational tooling versus production gates

| Requirement                                 | Status                  | Evidence / remaining work                                                                                                                                                     |
| ------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment configuration preflight          | Implemented             | `infra/scripts/deploy.sh` validates the selected provider/key, positive prices, HTTPS public URLs, CORS origins, core secrets, and TLS before migrations.                     |
| GitHub-to-AWS OIDC workflow configuration   | Partially implemented   | Workflows request short-lived OIDC credentials. AWS trust roles, environment protection rules, and deletion of obsolete long-lived secrets require operator action.           |
| Nori production activation                  | Requires infrastructure | A rotated Dahl key, managed Redis, correct trusted-proxy/CORS settings, live-provider validation, and operational alert routing must be configured in the target environment. |
| Portable PostgreSQL backup/restore tooling  | Implemented             | Scripts create a custom-format dump and companion SHA-256 file; restore refuses a missing, malformed, or mismatched checksum.                                                 |
| Successful isolated restore drill           | Requires infrastructure | An operator must restore real backup output, run migrations and product checks, and record RPO/RTO evidence.                                                                  |
| Live alerts and scheduled encrypted backups | Requires infrastructure | Hosting/provider configuration must schedule backups, enforce retention/versioning, route alerts, and prove that pages reach an owner.                                        |

## Explicit roadmap and external gates

| Requirement                                                        | Classification          |
| ------------------------------------------------------------------ | ----------------------- |
| Funnel analytics, interview coach                                  | Planned — V1            |
| Career advisor, salary prediction, recruiter chat, voice mode      | Planned — V2            |
| Organizations, seats, SAML SSO, university analytics               | Planned — Enterprise    |
| Chrome Web Store submission/approval                               | Requires infrastructure |
| Legal review and approval of published Terms/Privacy drafts        | Requires infrastructure |
| Live alert routing, scheduled backups, retention and S3 versioning | Requires infrastructure |
| SOC 2 Type II audit                                                | Requires infrastructure |
