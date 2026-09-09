# CI/CD and release gates

ApplyAI uses one delivery owner per component:

| Component                     | Delivery owner                    | Why                                                                                                       |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Dashboard                     | Vercel Git integration            | Next.js is a short-lived web deployment.                                                                  |
| Nori public assistant         | Separate Vercel project, optional | It is stateless apart from Redis-backed limits and does not load product data.                            |
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

Vercel emits a GitHub production deployment status after its deployment. The
`Verify Vercel production release` workflow then checks the dashboard and the
product API readiness endpoint. It also checks the independent Nori readiness
endpoint when configured.

Add these **GitHub repository variables** (not secrets):

```text
PRODUCTION_API_URL=https://api.example.com
PRODUCTION_NORI_API_URL=https://nori.example.com
```

Leave `PRODUCTION_NORI_API_URL` empty only while Nori is intentionally not
public. The API domains must be HTTPS and must not contain credentials.

The smoke job intentionally listens only to Vercel's dashboard deployment
environment, currently named `Production – autoapply`. This avoids duplicate
checks from separate Vercel projects while still checking the dashboard and the
independently hosted product API. If the Vercel project is renamed, update the
workflow condition and test it with a production deployment.

## Release sequence

1. Open a pull request; CI and security checks must pass.
2. Review and merge it into `main`.
3. Vercel creates the dashboard/Nori deployment from `main`.
4. Release the full API and worker from the same tested commit, run Prisma
   migrations first, and wait for `/health/ready`.
5. Confirm the Vercel smoke-test workflow succeeds.
6. Run the documented synthetic user flow: register, upload one CV, wait for
   parsing, discover jobs, prepare/review an application, and exercise the
   extension without submitting a real application.

If any stage fails, stop promotion and roll forward with a corrective commit.
Do not bypass checks or deploy a different commit from the dashboard/API/worker.
