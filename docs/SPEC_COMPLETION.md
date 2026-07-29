# ApplyAI specification completion matrix

This document maps `Prompt.md` to the implementation. It deliberately separates
the MVP build from later roadmap phases and from release gates that require
external organizations or production infrastructure.

## Status

- **Complete** — implemented and covered by the repository verification pipeline.
- **In progress** — required for MVP completion and actively being implemented.
- **Roadmap** — explicitly assigned by the specification to V1, V2, or Enterprise.
- **External gate** — cannot be completed by source changes alone.

## MVP product and platform

| Requirement                                             | Status   | Evidence / remaining work                                                                                                                                                                              |
| ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Modular NestJS, Next.js dashboard, MV3 extension        | Complete | Monorepo builds all three production artifacts.                                                                                                                                                        |
| PostgreSQL/Prisma schema and migrations                 | Complete | Schema validates; initial and quota migrations are included.                                                                                                                                           |
| Email/password and Google/GitHub authentication         | Complete | Argon2id, verified OAuth email selection, rotating refresh sessions.                                                                                                                                   |
| Active-session view and revocation                      | Complete | Settings lists active devices and supports current, individual, and all-other revocation.                                                                                                              |
| Complete candidate preferences                          | Complete | Location, workplace preference, salary range, work authorization, phone, LinkedIn, and portfolio are editable and exportable.                                                                          |
| Resume upload, storage, PDF/DOCX parsing                | Complete | Size/type/ZIP-bomb controls, isolated PDF worker, local/S3 adapters.                                                                                                                                   |
| Match score and explainability                          | Complete | Versioned deterministic scoring compares the original verified CV with the job, returns confidence/category evidence and gaps, and reuses a privacy-conscious hash cache without consuming LLM tokens. |
| Resume optimization and generated ATS CV                | Complete | Post-generation validation rejects unsupported claims; verified fields are merged into a persisted classic template with authenticated PDF download.                                                   |
| Cover-letter generation                                 | Complete | Structured provider output validation and bounded tone choices.                                                                                                                                        |
| Unified application preparation                         | Complete | One workflow connects tenant-scoped job capture, structured job analysis, optimized CV, cover letter, editing, approval hashes, extension handoff and tracking.                                        |
| CV-based job discovery                                  | Complete | A ready resume can rank up to 20 jobs per run with verified-skill overlap, role alignment, keyword gaps, tracked-job detection, bounded approved-source refresh, and monthly plan allowances.          |
| Application tracker CRUD                                | Complete | List/Kanban/review views, preparation and submission states, timeline, notes, delete, and monthly quota visibility enforce tenant ownership.                                                           |
| Assistive extension autofill                            | Complete | Greenhouse, Lever, Ashby and user-opened Moroccan-board adapters capture jobs and fill only an approved package; unknown questions and final submission remain user-controlled.                        |
| Dashboard account linking for the extension             | Complete | Two-minute single-use Pro handoff; extension sessions are revoked after downgrade and extension password login is rejected.                                                                            |
| Cover-letter dashboard workflow                         | Complete | Ready-resume selection, generation, review, and specificity regeneration are available on Jobs.                                                                                                        |
| Stripe Free/Pro/Premium billing                         | Complete | Checkout, portal, webhook ledger and current-state reconciliation.                                                                                                                                     |
| Per-plan application/AI/discovery/resume/storage quotas | Complete | Atomic counters and rollback behavior are implemented; discovery allows 3 Free, 50 Pro, and unlimited Premium runs per month.                                                                          |
| Feature entitlements                                    | Complete | Free receives 5 monthly AI requests and 1 CV optimization; centralized guards keep cover letters, unified preparation, and extension access on Pro/Premium.                                            |
| Independent Morocco career chatbot                      | Complete | Nori uses a separate Dahl module, server-only key, stateless messages, public-job/official-source context, and an independent user/IP throttle; it does not consume CV/application AI quota.           |

## Security, privacy and reliability

| Requirement                                           | Status   | Evidence / remaining work                                                                                                                           |
| ----------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-replica throttling                              | Complete | Atomic Redis-backed Nest throttler uses verified user IDs for authenticated requests and IP fallback for public or invalid-token traffic.           |
| Exact public/authenticated/admin rate tiers           | Complete | Public 100/15m, authenticated 1000/15m, admin 50/15m, login 10/15m.                                                                                 |
| Required production security headers                  | Complete | Explicit CSP, HSTS, frame denial, nosniff, referrer and permissions policy.                                                                         |
| HTTPS-only production URLs                            | Complete | API config, dashboard build and deployment workflows reject HTTP.                                                                                   |
| Encrypted resume storage                              | Complete | Production requires S3; uploads request AES-256 server-side encryption.                                                                             |
| GDPR consent, export and erasure                      | Complete | Persistent explicit consent, feature gates, secret-free export, Stripe/file/database erasure.                                                       |
| Privileged-role MFA and session timeouts              | Complete | TOTP enrollment, encrypted secrets, MFA-gated admin sessions, 15m idle/8h absolute limits.                                                          |
| AI input/output/time/cost controls                    | Complete | Byte, token, timeout and request-cost ceilings are enforced.                                                                                        |
| AI provider fallback/circuit breaker                  | Complete | Ordered fallback and per-provider circuits; partner APIs are allow-listed and circuit-broken.                                                       |
| Queue retries, idempotency and dead-letter visibility | Complete | The shipped resume queue uses stable IDs, exponential retry, idempotent parsing, ActivityLog, retained DLQ. Later-phase queues remain roadmap work. |
| Dependency integrity and vulnerability scanning       | Complete | Frozen lockfile install and audit are part of `pnpm check`/CI.                                                                                      |
| Audit logs and request tracing                        | Complete | Separate request-ID traces, persisted access-denial/auth/queue audits, correlation in provider branches.                                            |

## Testing and documentation

| Requirement                                 | Status   | Evidence / remaining work                                                                                 |
| ------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| Unit/regression tests                       | Complete | API and extension regression suites run in `pnpm check`.                                                  |
| API/DB/queue integration tests              | Complete | Isolated PostgreSQL/Redis integration harness runs in CI; local execution requires those services.        |
| Playwright core-flow E2E                    | Complete | Environment-gated staging journey covers signup, upload/parse, score, cover letter, and tracker creation. |
| AI golden-set evaluation                    | Complete | Score-band golden set and shipped-prompt guardrail checks run in the standard test suite.                 |
| Technical architecture documentation        | Complete | `docs/TECHNICAL.md` reflects the implemented architecture.                                                |
| ADRs, data dictionary and incident runbooks | Complete | `docs/ADRS`, `DATA_DICTIONARY.md`, `INCIDENT_RESPONSE.md`, and sub-processor register.                    |

## Explicit roadmap and external gates

| Requirement                                                   | Classification                            |
| ------------------------------------------------------------- | ----------------------------------------- |
| Funnel analytics, interview coach                             | Roadmap — V1                              |
| Career advisor, salary prediction, recruiter chat, voice mode | Roadmap — V2                              |
| Organizations, seats, SAML SSO, university analytics          | Roadmap — Enterprise                      |
| Chrome Web Store submission/approval                          | External gate                             |
| Legal review and approval of published Terms/Privacy drafts   | External gate                             |
| Live monitoring, alert routing, backups and S3 versioning     | External gate / production infrastructure |
| SOC 2 Type II audit                                           | External gate                             |
