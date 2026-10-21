# CI/CD and release gates

ApplyAI uses one delivery owner per component:

| Component                     | Delivery owner                    | Why                                                                                                       |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Dashboard                     | Vercel Git integration            | Next.js is a short-lived web deployment.                                                                  |
| Nori public assistant         | Separate Vercel project           | It is stateless apart from Redis-backed limits and does not load product data.                            |
| Product API and BullMQ worker | Persistent container host         | Resume parsing, Redis queues, S3 uploads, and PostgreSQL connection management require durable processes. |

Do not deploy the full product API to Vercel serverless. A serverless request can
end while a BullMQ worker still has queued resume jobs. Run the API and at least
one dedicated worker process from the API Docker image on a container-capable
host, with managed PostgreSQL, Redis, and object storage.

## Pull-request gate

Every pull request to `main` runs:

1. dependency installation from the locked pnpm graph;
2. dependency vulnerability audit;
3. Prisma generation and schema validation;
4. linting, type checking, unit tests, database migration, integration tests,
   browser critical-flow test, and production builds;
5. dependency-diff review and CodeQL analysis.

### Temporary dependency-audit risk acceptance

The single native pnpm `auditConfig.ignoreGhsas` entry for
`GHSA-vfj7-8cjw-p6xm` (`CVE-2026-93687`, `braces@3.0.3`) is **risk acceptance,
not remediation**. No patched release exists. The assessed API and Dashboard
production dependency closures exclude `braces`; no route from attacker-controlled
input to a runtime brace pattern was found. Build and test tooling still contains
the affected package, and the extension's production dependency graph includes
Tailwind's transitive copy. The actual Docker image contents were not inspectable
in the assessment.

Owner: `@yahyanaim`. Expiry: **2026-11-03 UTC**. Track
[micromatch/braces#70](https://github.com/micromatch/braces/issues/70). Remove
the exception immediately when a compatible patched release is published and
validated, or if a runtime exposure is found. The audit-policy guard fails CI
after expiry or if any other advisory is added to the ignore list. The ordinary
`pnpm audit --audit-level=low` still evaluates every other advisory.

GitHub branch protection for `main` requires these checks before a merge:

- `Quality, tests, and production builds`
- `Dashboard critical-flow browser test`
- `Review dependency changes` (pull requests)
- `CodeQL analysis`

It resolves conversations, covers administrators, and disallows force pushes.
This is a single-maintainer repository, so it deliberately does **not** require
a second-person approval; the required automated checks remain the merge gate.
Vercel should deploy production only from `main`, so branch protection prevents
an unverified change from reaching production.

## Vercel release verification

Vercel deployment success, GitHub CI success, public-origin smoke success and
authenticated application health are separate evidence. A green Vercel status
does not prove that a public origin or its dependencies are ready.

The Product API/worker deployment is currently **deferred**. Standalone Nori is
already a separate public service; it must never be substituted for Product API.
`Verify Vercel production release` checks these services independently:

| Service | Required evidence | Missing configuration / failure |
| --- | --- | --- |
| Dashboard | Canonical production `/`: HTTP 200, HTML | Fail |
| Standalone Nori | Its own `/health/ready`: HTTP 200, `status: ready`, `mode: career-chat-standalone` | Fail; Nori is explicitly required |
| Product API: deferred | No probe; summary says `DEFERRED`, never `PASSED` | A supplied URL while deferred is a configuration failure |
| Product API: enabled | Its own `/health/ready`: HTTP 200 with ready database, Redis and storage; not standalone Nori | Fail if URL is absent/invalid or readiness is wrong/unhealthy |

An operator must review and configure these **GitHub repository variables**
(not secrets). This code change does not set them:

| Variable | Contract |
| --- | --- |
| `PRODUCTION_DASHBOARD_URL` | Required canonical Dashboard production origin |
| `PRODUCTION_NORI_API_URL` | Required canonical standalone Nori production origin |
| `PRODUCTION_PRODUCT_API_STATE` | `deferred` (explicit current-stage default) or `enabled`; any other value fails |
| `PRODUCTION_API_URL` | Empty while deferred; mandatory when enabled and actually deployed |

Origins must be distinct, credential-free HTTPS origins without a path, query,
fragment, custom port, IP literal or local hostname. Use approved stable public
origins, not Vercel deployment/log URLs. Do not populate `PRODUCTION_API_URL`
with Nori's address to satisfy CI. Enabling Product API is a separately approved
operational step, not inferred from Nori availability or the presence of a URL.

The workflow accepts successful `deployment_status` events only for
`Production – autoapply` (Dashboard) and `Production – autoapply-api` (Nori).
It validates repository identity, Vercel bot creators, matching environment
metadata, SHA, deployment ID and the event origin. Vercel currently marks these
named production deployments `production_environment=false`; that flag alone
cannot classify the actual project stage.

`environment_url` is preferred to the legacy `target_url`. The accepted event
origin must match the configured service origin or the observed generated-host
family `autoapply-<id>-yahyanaims-projects.vercel.app`. Both projects currently
use that family, so the hostname prefix is **not** a service identity. Review
the script and regression tests if project/team naming changes. No event URL
is fetched: every probe uses a separately configured canonical origin. The
workflow checks out trusted `main`, never a deployment-supplied source ref.

Every relevant event rechecks all expected services, including independent
failures. Each probe permits at most three GET attempts, ten seconds per
attempt, and one second between retryable failures (network/timeout, HTTP 429
or 5xx). Redirects are rejected, not followed. Readiness JSON is limited to
8 KiB and validated without logging its contents. No chat, inference request,
registration or mutation occurs. Nori's readiness endpoint itself makes its
existing public, keyless provider-availability GET; it does not generate text.

Runs are serialized per deployment ID without cancellation. Repeated events
are idempotent, read-only **rechecks**, not persistent deduplication or new
releases. They can fail if health changes. The summary records the event ID/SHA
but does not claim to prove which commit a stable origin currently serves.
Preview/unrelated events are ignored without a health claim.

The workflow also runs offline regressions on relevant pull requests/main
changes. Local check: `node --test scripts/verify-production-smoke.test.mjs`.

## Release sequence

1. Open a pull request; CI and security checks must pass.
2. Review and merge it into `main`.
3. Vercel creates the dashboard/Nori deployment from `main`.
4. Confirm Dashboard/Nori smoke results, with Product API explicitly deferred.
5. Only after separate Product API deployment authorization: release API/worker
   from the tested commit, migrate first, wait for `/health/ready`, then enable
   its production verification contract. Do not infer this from Vercel success.
6. Once Product API exists, run the documented synthetic user flow: register, upload one CV, wait for
   parsing, discover jobs, prepare/review an application, and exercise the
   extension without submitting a real application.

If any stage fails, stop promotion and roll forward with a corrective commit.
Do not bypass checks or deploy a different commit from the dashboard/API/worker.
