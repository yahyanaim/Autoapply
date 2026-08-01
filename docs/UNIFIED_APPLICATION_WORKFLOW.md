# Unified application workflow

ApplyAI prepares one application package instead of generating disconnected
documents.

## User flow

1. Upload and parse a primary PDF or DOCX resume.
2. After parsing finishes, choose **Find matching jobs**.
3. ApplyAI refreshes configured approved ATS boards, ranks a bounded candidate
   pool against the verified CV and returns up to 20 explainable matches. Plan
   allowances are 3 runs per month on Free, 50 on Pro, and unlimited on Premium.
4. Select one recommendation, capture an open job with the extension, or paste
   a job URL and description.
5. Choose **Prepare selected job**.
6. ApplyAI creates one application record and moves it through:

   `job_captured -> analyzing -> generating -> ready_for_review -> ready_to_submit`

7. The job analysis, optimized CV, cover letter, match score and safety results
   are stored together.
8. The user edits and reviews both documents in one workspace.
9. **Approve application package** hashes and freezes the reviewed versions.
10. The extension may retrieve only an approved package, fill supported fields,
    attach the approved PDF and insert the approved cover letter.
11. The extension never clicks the final Submit button. The user submits and
    confirms the tracker status.

`generation_failed` is a recoverable state. The workflow keeps the draft and
offers a retry without creating a disconnected application.

## API contract

- `POST /jobs/capture` — normalize and deduplicate a job captured by the user.
- `POST /jobs/discover` — refresh approved sources and rank up to 20 jobs
  against a ready, user-owned resume.
- `POST /applications/prepare` — analyze and generate the complete package.
- `GET /applications/:id` — return the job analysis and connected materials.
- `PATCH /applications/:id/materials` — edit grounded CV sections and the letter.
- `POST /applications/:id/regenerate` — regenerate the CV, letter, or package.
- `POST /applications/:id/approve` — approve exact content hashes.
- `GET /applications/approved-package?sourceUrl=...` — extension-only package
  handoff using the authenticated user session.

Captured jobs are tenant-scoped. Approved partner-API jobs remain public.

`POST /jobs/discover`, `POST /applications/prepare`,
`POST /applications`, and `POST /applications/:id/regenerate` require an
`Idempotency-Key` header. The key must contain 16–128 letters, numbers, dots,
underscores, colons, or hyphens. Keep the same key and identical payload when
retrying a logical operation after a timeout or lost response. Reusing the key
with a different payload, or while the original is still pending, returns
`409`; a completed response is replayed during its retention window.

## Job-source policy

Greenhouse, Lever and Ashby use their official public JSON APIs. The backend
does not scrape their web pages. Indeed
Maroc, Rekrute, Anapec and MarocAnnonces are captured only from a page the user
has opened through the browser extension. The adapter prefers schema.org
`JobPosting` data and falls back to page selectors. This is not a server-side
bulk crawler. Per-site terms and selector fixtures must be reviewed before each
adapter is released publicly.

## Deployment

Apply the Prisma migration before enabling the workflow:

```bash
pnpm --filter @applyai/api prisma:migrate:deploy
```

The API requires configured PostgreSQL, Redis, object storage and an AI
provider. The extension build must set `VITE_API_BASE_URL` and
`VITE_DASHBOARD_URL` to the production origins.

Configure the approved discovery catalog before launch:

```dotenv
JOB_DISCOVERY_SOURCES=greenhouse:board-token,lever:site-name,ashby:job-board-name
JOB_DISCOVERY_REFRESH_TTL_MINUTES=30
```
