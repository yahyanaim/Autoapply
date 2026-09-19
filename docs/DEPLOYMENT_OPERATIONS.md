# Deployment and operations

## Environment separation

Use distinct projects, databases, Redis instances, storage buckets, Stripe
modes, provider budgets, and secrets for each environment:

| Environment | Trigger                                     | Data and credentials                                                                                            |
| ----------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Preview     | Vercel pull-request preview                 | Synthetic data and preview-only credentials                                                                     |
| Staging     | Explicit operator deployment                | Isolated staging services; never production data                                                                |
| Production  | Manual production workflow; run from `main` | Production services and environment-scoped secrets; GitHub Environment approval rules are configured externally |

The repository’s Vercel Git integration may own Preview and Production. The
AWS/EKS staging workflow is intentionally manual so a repository configured
only for Vercel no longer creates a failing AWS deployment on every `main`
push. Do not configure two systems to deploy the same environment.

## GitHub-to-AWS OIDC

The AWS workflows request `id-token: write` and use
`AWS_DEPLOY_ROLE_ARN`; they no longer accept an access-key ID or secret access
key. Create GitHub’s OIDC provider in AWS, then create separate least-privilege
roles for the `staging` and `production` GitHub environments.

Restrict each role trust policy to this repository and environment. The subject
claims are:

```text
repo:yahyanaim/Autoapply:environment:staging
repo:yahyanaim/Autoapply:environment:production
```

Store the matching role ARN as the environment-scoped
`AWS_DEPLOY_ROLE_ARN` GitHub secret. Grant only the ECR and EKS operations used
by the workflow. After one successful deployment, delete the obsolete
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` GitHub secrets.

## Deployment preflight

Before changing workloads, `infra/scripts/deploy.sh` verifies:

- the selected environment and deployment inputs;
- the Kubernetes `api-secrets`, `resume-worker-free-secrets`, and
  `resume-worker-paid-secrets` objects;
- core database, Redis, auth, MFA, storage, and Stripe secrets;
- that the selected paid provider has its matching credentials, the Free GLM
  endpoint is an approved HTTPS endpoint, and all API/worker secrets share the
  resume-job signing key;
- positive input/output token prices;
- credential-free HTTPS dashboard and Stripe return URLs;
- every configured CORS value is a credential-free HTTPS origin;
- the environment’s TLS secret;
- successful database migration before rollout.

The controlled rollout also waits for the API plus Free and paid resume-worker
deployments. It never starts the legacy queue drainer. Follow the quarantine
procedure in [FREE_BETA_EXECUTION.md](FREE_BETA_EXECUTION.md#legacy-resume-parse-queue-retirement)
only as a separately approved, one-time operation.

These configuration checks run before the migration job. NestJS repeats its
schema and cross-field validation when the new API starts.

## Free beta and paid execution boundaries

The future beta uses one trusted product API for authentication, subscriptions,
quotas, and dispatch. It chooses the execution boundary from the PostgreSQL
subscription on every AI action; dashboard and extension input never selects a
plan, provider, queue, or worker. Free calls GLM directly and never fall back
to paid providers. Pro and Premium retain the existing paid provider fallback
chain and never use GLM.

Resume parsing is dispatched to `resume-parse-free` or `resume-parse-paid`
with a server-generated identity signed by the dedicated
`RESUME_QUEUE_SIGNING_KEY`. The worker verifies the signature, exact queue/job
identity, resume ownership, and current entitlement before parsing, and
atomically claims each attempt before calling a provider. `AIService` validates
the trusted boundary once more immediately before execution, so a changed or
copied job is rejected before an AI call. A valid job whose entitlement changes
is marked failed rather than left pending. The API uses `APP_PROCESS_ROLE=api`; a worker uses
`APP_PROCESS_ROLE=worker` and does not bind an HTTP listener.
`AI_EXECUTION_ROLE=free` makes a Free worker GLM-only, while `paid` rejects
Free work. See
[FREE_BETA_EXECUTION.md](FREE_BETA_EXECUTION.md) for the exact configuration,
R2 contract, capacity assumptions, queue controls, and deferred external work.

Do not make Vercel the production host for the full API or BullMQ workers. The
full product requires a container-capable host; the listed Oracle Free Tier
approach is a future staging/production choice that has not been provisioned or
verified here.

## Health and monitoring

`GET /health` checks process liveness. `GET /health/ready` on the full product
API checks PostgreSQL, Redis, and object storage. The separate Nori deployment
has its own `/health/ready` probe for its public career provider and Redis
limits without loading the product API.

The repository defines the health signals and initial thresholds below. It does
not provision an alerting vendor, paging route, cloud budget alarm, or on-call
schedule. An operator must connect the hosting platform to these signals and
configure these minimum alerts:

| Signal             | Initial trigger                                        | Response                                           |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------- |
| Deployment         | Failed migration or rollout                            | Page release owner; stop promotion                 |
| API errors         | 5xx rate above 2% for 5 minutes                        | Inspect request IDs and dependency health          |
| Database           | Connection use above 80% or readiness failure          | Stop workers if necessary; inspect pool/exhaustion |
| Career/AI provider | Failure rate above 10% for 5 minutes or open circuit   | Disable provider/fail over; preserve cost limits   |
| AI spend           | Daily spend above the configured product budget        | Disable non-essential generation and investigate   |
| Queue              | Oldest resume job above 5 minutes or retained DLQ item | Follow the queue incident procedure                |

Alert routing, on-call destinations, and cloud-provider budget alarms remain
external environment configuration. Record the owner and test each route
quarterly; source review alone does not prove that an alert reaches a person.

### Optional Sentry error monitoring

Sentry is disabled by default. Enable each runtime explicitly; an unset, empty,
or `false` flag keeps its SDK inactive. Any other value is invalid. A `true`
flag requires a valid DSN and fails startup before the application begins
serving traffic.

| Runtime | Enable flag | DSN |
| --- | --- | --- |
| Product API | `SENTRY_ENABLED=true` | `SENTRY_DSN` |
| Dashboard browser | `NEXT_PUBLIC_SENTRY_ENABLED=true` | `NEXT_PUBLIC_SENTRY_DSN` |
| Dashboard server and edge | `DASHBOARD_SENTRY_ENABLED=true` | `DASHBOARD_SENTRY_DSN` |

The browser flag controls only browser initialization. The dashboard server and
edge runtimes never read browser flags. `DASHBOARD_SENTRY_*` is intentionally
separate from the product API's `SENTRY_*` values, so deployments can use
different Sentry projects and DSNs.

ApplyAI builds a new minimal error event instead of editing the SDK event. The
only retained diagnostics are the fixed `ApplyAIError` category, optional
line/column numbers, and the internal-frame boolean. Trusted deployment
environment and release values come only from configuration; file names,
function names, exception messages/types, modules, routes, transactions,
request/user data, breadcrumbs, tags, and arbitrary metadata are dropped.

The sanitizer fails closed (`null`) for malformed values, getters/proxies,
circular input, non-plain objects, excessive or sparse arrays, deep input, or
an oversized event. Limits are: 8,192 total characters, depth 8, array length
64, object keys 64, exception values 4, stack frames 32, and a string length of
256 characters. The final allow-listed event is also limited to 8,192
characters. Before it can leave, a transport boundary drops every non-error
envelope item, including sessions, replays, traces, logs, metrics, profiles,
check-ins, client reports, and attachments. Do not add `captureMessage`,
request/user contexts, breadcrumbs, tags, or new retained fields without a new
privacy review and sanitizer test.

### Closed-beta registration capacity

`BETA_MODE=true` activates the database-backed lifetime registration cap set by
`BETA_MAX_REGISTRATIONS`. The additive migration creates the singleton counter
at zero. Accounts created before the gate migration or before beta is enabled
do not retrospectively consume a slot.

Every successful new password registration consumes one slot, even while its
email remains unverified. Every successful first OAuth registration consumes
one slot as well. The slot claim, user, subscription, and usage-limit records
are in one transaction: any failed or rolled-back registration consumes no
slot. Returning OAuth users do not consume another slot. Deleted users also do
not release a slot because this is a lifetime successful-registration cap, not
an active-user cap.

The conditional database increment makes the cap safe across concurrent API
instances. Set the intended maximum before enabling beta. Lowering a maximum
below the current count blocks new registrations but never resets or reduces
the stored counter; changing the maximum never resets it. To pause new
sign-ups, set `BETA_MODE=false` and redeploy. Never delete, reset, or migrate
away the singleton counter during beta.

For a rollback, begin by deploying these disabled values:

```env
SENTRY_ENABLED=false
DASHBOARD_SENTRY_ENABLED=false
NEXT_PUBLIC_SENTRY_ENABLED=false
BETA_MODE=false
```

Preserve the `beta_registration_gate` table and its value. There is no
destructive down migration or counter reset. A rollback target must understand
the additive table, or beta mode must stay disabled.

### Beta Gate integration-test database

The integration suite refuses to run unless `DATABASE_URL` contains `test`.
It must point to an isolated PostgreSQL database only; never reuse a local
development, preview, staging, or production URL. CI provisions PostgreSQL
with database name `applyai_test`, runs `pnpm --filter @applyai/api
prisma:migrate:deploy`, then runs `pnpm --filter @applyai/api test:integration`.
Replicate that arrangement for local verification with a disposable database
whose name clearly includes `test`.

## PostgreSQL backup and restore

Configure encrypted snapshots with the database provider. Separately, create a
portable logical backup:

```sh
DATABASE_URL='postgresql://…' \
BACKUP_DIRECTORY='/secure/applyai-backups' \
infra/scripts/backup-postgres.sh
```

Copy the dump and checksum to encrypted, access-controlled storage with a
retention policy. Never place them in the repository.

The repository does not schedule this command, upload its output, configure
provider snapshots, or enable bucket versioning. Those controls must be
configured and monitored in each production environment.

Test restoration against an empty, isolated database first:

```sh
RESTORE_DATABASE_URL='postgresql://…/applyai_restore_test' \
BACKUP_FILE='/secure/applyai-backups/applyai-YYYYMMDDTHHMMSSZ.dump' \
RESTORE_CONFIRMATION='restore:applyai_restore_test' \
infra/scripts/restore-postgres.sh
```

The restore script expects the companion file at `<backup-file>.sha256` and
refuses to run if that file is missing or malformed, or if its SHA-256 value
does not match the selected dump. It validates the dump format before asking
PostgreSQL to replace objects. Keep the dump and checksum together when moving
or renaming a backup.

After restore, run migrations, start a staging API, verify `/health/ready`,
authentication, one synthetic resume, and tenant isolation. Record the dump
timestamp, restore duration, verifier, result, and any corrective action.
A real restoration is an operational release gate and cannot be proven by the
source repository alone.
