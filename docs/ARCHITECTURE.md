# ApplyAI architecture

## Current shape

ApplyAI is a pnpm/Turborepo monorepo. A modular NestJS monolith owns product
rules; a Next.js dashboard and Manifest V3 browser extension are separate user
interfaces. This is the right level of complexity for the current workflow:
ownership, quotas, evidence checks, and approval need transactional consistency
more than separate microservices.

```text
Dashboard / Extension
         |
         v
NestJS product API ---- PostgreSQL (product records and audit history)
         |                         |
         |                         +-- S3-compatible storage (resume files)
         +---- Redis (rate limits, queues) ---- BullMQ workers
         +---- AI provider adapters

Public Nori UI --> standalone career-chat API --> Dahl-compatible provider
                    (no product database or candidate-data access)
```

## Component ownership

| Component | Owns | Must not own |
| --- | --- | --- |
| `apps/dashboard` | marketing pages, authenticated workflow UI, client state | provider secrets or authorization decisions |
| `apps/extension` | user-initiated job capture and approved-package fill | final submission or private data outside the approved package |
| `apps/api` | identity, ownership, quotas, CV evidence, job visibility, billing, audit logs | presentation-only concerns |
| PostgreSQL | durable workflow, user, billing, and audit state | raw provider API keys |
| Redis/BullMQ | shared limits and background work coordination | source of truth for product records |
| standalone Nori | public career Q&A and bounded rate limits | CV, profile, job-application, JWT, or product-API access |

## Core data boundaries

- A query for a user-owned record is scoped by the authenticated user ID.
- A public job is usable only while it satisfies the freshness policy. A
  browser-captured job is usable only by its capturing user.
- Match scoring receives original parsed resume evidence and a bounded job text.
- Generation receives only authorized source evidence and is checked before a
  generated version can be stored or approved.
- The dashboard never receives server-side provider keys.

## Deployment model

- Dashboard: Vercel is suitable for the Next.js site.
- Product API and BullMQ workers: run the Docker image on a persistent
  container host with managed PostgreSQL, Redis, and object storage. Do not run
  the full worker workload in Vercel serverless.
- Nori: may run as a dedicated standalone deployment with its own Redis URL,
  trusted-proxy setting, environment variables, and provider key.

## Scaling direction

The repository currently has in-process refresh coordination and API-embedded
worker behavior. Before horizontal scaling, introduce a Redis distributed lock
for source refreshes and deploy the worker as a separately scaled process. This
is a deliberate next-stage operational change, not a reason to prematurely
split the product API into microservices.

Operational prerequisites are documented in
[DEPLOYMENT_OPERATIONS.md](DEPLOYMENT_OPERATIONS.md).
