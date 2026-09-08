# ApplyAI architecture and product-quality audit

Audit date: 2026-09-08

## Product contract

ApplyAI is an **assistive** job-application product. Its reliable workflow is:

1. a user uploads a CV they own;
2. the CV is parsed into verified candidate evidence;
3. approved sources and the browser extension provide job listings;
4. a deterministic score compares the original verified CV to each job;
5. AI prepares a job analysis, CV version, and cover letter from that evidence;
6. the user reviews and explicitly approves the materials; and
7. the extension assists with form filling but never makes the final submission.

The product must never make a generated CV look stronger by inventing experience,
nor imply that an AI score is proof that a candidate will be hired.

## Architecture review

The repository is a modular NestJS monolith with a Next.js dashboard, a browser
extension, and shared TypeScript packages. This is an appropriate architecture
for the current product: the core workflow needs clear transactional boundaries
more than independently deployed microservices.

| Area              | Responsibility                                                                           | Assessment                                                             |
| ----------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Dashboard         | User-facing CV, jobs, preparation, review, billing, and public Nori UI                   | Sound separation from the API; dashboard contains no provider secrets. |
| Product API       | Authentication, ownership checks, workflows, quotas, AI orchestration, auditability      | Correct owner for product rules; should run as a persistent service.   |
| Worker and queues | CV parsing and background work through BullMQ/Redis                                      | Correctly decoupled, but requires a durable worker process.            |
| Data stores       | PostgreSQL for product data, Redis for limits/queues, S3-compatible storage for CV files | Appropriate production split.                                          |
| Extension         | User-initiated capture, review, and assisted form filling                                | Correctly human-in-the-loop; it must not auto-submit.                  |
| Nori              | Stateless public Morocco career Q&A assistant                                            | Deliberately separate from private dashboard/CV data.                  |

## Findings and fixes in this change

### Corrected: one truthful, explainable match score

The discovery response previously blended the deterministic score with a second
skills calculation and a role-title calculation. Skills and experience were
therefore counted twice, while the breakdown shown to the user described only
the first calculation. The displayed `matchScore` now equals the deterministic
comparison of the original uploaded CV with the job. Explicit CV-skill overlap
is retained as supporting evidence, not as hidden scoring weight.

For the same reason, an optimized CV version stores the match score of the
original verified CV. A rewrite can improve clarity and ATS coverage, but it
cannot improve the candidate's real experience.

### Corrected: listing freshness

`scrapedAt` now records the latest observation of a source listing during an
upsert. Public search and discovery exclude public listings older than
`JOB_DISCOVERY_MAX_JOB_AGE_HOURS` (seven days by default); a user can still see
their own browser-captured listings. This prevents an old job from being
presented as fresh merely because its record was originally created recently.

### Corrected: cover-letter truthfulness

Generated cover letters, edited cover letters, and package approval now use the
same evidence-based fabrication detector as generated CVs. Unsupported claims
such as a metric that does not exist in the uploaded CV are rejected before
storage or approval. Non-blocking wording differences can still require the
user's explicit confirmation.

### Corrected: quality gates

The GitHub workflows now provide a repeatable pull-request gate, dependency
review, CodeQL scanning, and production-release smoke tests. Full details are
in [CI_CD.md](CI_CD.md).

## Product limitations to resolve before a broad launch

These are intentionally documented rather than hidden by an unsafe code change:

1. **Moroccan-board coverage.** Greenhouse, Lever, and Ashby have approved API
   adapters. Indeed Maroc, Rekrute, ANAPEC, and MarocAnnonces do not currently
   have native provider ingestion. The extension can capture a page the user
   opened, but ApplyAI must not advertise automated discovery from those boards
   until it has written permission, an official API/feed, or a commercial data
   partner.
2. **A listing seen recently is not proof it is open.** The new age limit is a
   safe first control. Proper closed-job handling needs a stable source ID,
   `active/closedAt` lifecycle fields, and a reconciliation job that runs only
   when a source supplies complete, non-truncated data.
3. **Candidate retrieval needs relevance at scale.** Discovery currently scores
   a bounded recent pool. Before a large catalogue, add PostgreSQL full-text
   retrieval (or a search service) before deterministic reranking so a relevant
   job is not hidden by the newest 500 records.
4. **Refresh coordination is single-process.** In-memory refresh state prevents
   duplicate calls only inside one API process. Multiple replicas require a
   Redis-backed distributed lock plus a scheduled refresh worker.
5. **Preparation should become asynchronous.** Job analysis, CV generation, and
   cover-letter generation still happen in one request. Move the workflow to a
   queue with a durable status endpoint before high-volume usage.
6. **The full API cannot run on Vercel serverless.** Use the Docker image on a
   persistent container host for the API and BullMQ worker. Vercel remains
   suitable for the dashboard and the separate Nori-only mode.

## Release criteria

Before accepting real candidate data at scale, require the CI checks in
[CI_CD.md](CI_CD.md), a production database/Redis/S3 backup and recovery test,
provider permissions for every advertised job source, a synthetic end-to-end
journey, and monitoring for queue depth, provider failures, job freshness, and
truthfulness rejections.
