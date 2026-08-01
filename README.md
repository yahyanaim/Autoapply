# ApplyAI

ApplyAI is a human-controlled job-search workspace. A candidate uploads a real
resume, discovers relevant jobs, sees an explainable match score, prepares a
truthful job-specific CV and cover letter, reviews every change, and can use the
Chrome extension to fill an approved application package.

ApplyAI assists with applications; it does not send a final application without
the candidate.

## End-to-end workflow

1. **Upload a resume** — a PDF or DOCX is parsed into verified, structured
   candidate data.
2. **Discover jobs** — ApplyAI can refresh approved Greenhouse, Lever, and Ashby
   public APIs, rank the available jobs against the original resume, and return
   up to 20 results.
3. **Choose an opportunity** — the candidate explicitly selects a discovered
   job, pastes a job description, or captures the job page they opened with the
   extension.
4. **Prepare the application** — eligible plans generate a connected package:
   structured job analysis, truthful optimized CV, and tailored cover letter.
5. **Review and approve** — the candidate edits or regenerates materials and
   approves a fixed version.
6. **Fill and submit** — the extension can fill the approved package. Unknown
   questions and the final Submit action always remain with the candidate.
7. **Track progress** — the application, notes, status, and timeline stay in the
   dashboard.

See [Project use cases](docs/USE_CASES.md) for detailed actors, flows, plan
branches, failure cases, and product boundaries.

## Feature status

Status values are intentionally conservative:

- **Implemented** — source behavior and repository-level automated coverage exist.
- **Partially implemented** — the core behavior exists, but live-provider or
  release validation is still required.
- **Planned** — designed but not implemented.
- **Requires infrastructure** — source support exists, but completion depends on
  deployed services or an operator-controlled production action.

| Capability                       | Status                  | Current behavior / remaining gate                                                                                                                |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resume ingestion                 | Implemented             | Secure PDF/DOCX upload, parsing, structured candidate data, version history, and classic ATS PDF generation                                      |
| Job discovery                    | Implemented             | Approved public JSON APIs for Greenhouse, Lever, and Ashby; up to 20 ranked results per discovery run                                            |
| Match score v2                   | Implemented             | Deterministic, explainable comparison of the original verified CV with the job; no LLM tokens are used                                           |
| Application preparation          | Implemented             | Connected job analysis, truthful CV optimization, cover letter, review, regeneration, and approval                                               |
| Chrome extension                 | Partially implemented   | Capture and approved-package filling are implemented; live-site regression checks and Chrome Web Store approval remain release work              |
| Moroccan job pages               | Partially implemented   | User-opened pages use page data/DOM—not screenshots or bulk crawling; live markup compatibility needs ongoing validation                         |
| Application tracker              | Implemented             | List, Kanban, notes, timeline, review, and application status management                                                                         |
| Accounts and security            | Implemented             | Email/password, Google/GitHub OAuth, MFA, rotating sessions with replay-family protection, consent, export, and deletion                         |
| Billing and limits               | Partially implemented   | Stripe flows and atomic quotas are implemented; production products, prices, webhook secret, and live-mode validation require Stripe             |
| Administration                   | Implemented             | User/usage metrics and controlled ingestion of approved public job boards                                                                        |
| Public Career Assistant (Nori)   | Implemented             | The isolated, bounded assistant, public-data boundary, failure handling, and scroll-following mascot are implemented                             |
| Nori production activation       | Requires infrastructure | A rotated Dahl key, managed Redis, trusted proxy/CORS configuration, live-provider validation, and alert routing are deployment responsibilities |
| Personalized dashboard assistant | Planned                 | No private CV, profile, or application retrieval is exposed to Nori                                                                              |
| Additional ATS adapters          | Planned                 | Workday, SmartRecruiters, and BambooHR support is not implemented                                                                                |
| Live staging verification        | Requires infrastructure | The paid workflow test exists but requires an isolated staging account, indexed jobs, and working providers                                      |
| Alerts, backups, restore drill   | Requires infrastructure | Health signals and scripts exist; live alert routes, scheduling, retention, external storage, and a recorded restore drill remain external       |

## Job-source policy

Server-side job discovery does **not** scrape LinkedIn, Indeed, Rekrute, Anapec,
MarocAnnonces, or arbitrary HTML pages.

The backend aggregates only configured public JSON job-board APIs:

- Greenhouse Job Board API
- Lever Postings API
- Ashby public Job Postings API

Configure sources with:

```env
JOB_DISCOVERY_SOURCES=greenhouse:board-token,lever:site-name,ashby:job-board-name
JOB_DISCOVERY_REFRESH_TTL_MINUTES=30
```

The extension has a separate, user-initiated path for supported Moroccan sites.
It analyzes the specific job page that the candidate opened. It first reads
Schema.org `JobPosting` data and then uses bounded DOM selectors. It does not
take a screenshot and does not crawl search-result pages.

## Explainable match scoring

Match score v2 compares the **original parsed resume** with a job title and
description. It is deterministic and supports English/French terminology
aliases. The available categories are:

| Category         | Base weight |
| ---------------- | ----------: |
| Skills           |         40% |
| Experience       |         25% |
| Responsibilities |         15% |
| Education        |         10% |
| Languages        |          7% |
| Certifications   |          3% |

Categories absent from the job are omitted and the remaining weights are
normalized. The scorer accounts for employment duration without double-counting
overlapping dates, gives extra importance to hard requirements, and returns:

- overall score and evidence confidence;
- category breakdown;
- matched requirements and resume evidence;
- missing keywords or requirements;
- concise explanations of why the score was assigned.

Results are cached by resume/job/scorer-version hashes. Raw duplicate job
descriptions are not stored in the score cache. Because the scorer is
deterministic, ranking jobs consumes no AI-provider tokens.

The algorithm is documented in
[Match score v2](apps/api/src/modules/ai/domain/MATCH_SCORE.md).

## Plans and quotas

Monthly limits are enforced on the backend; hiding a control in the UI is not
the security boundary.

| Feature                                     |     Free | Pro ($19/month) | Premium ($49/month) |
| ------------------------------------------- | -------: | --------------: | ------------------: |
| AI requests                                 |        5 |             500 |           Unlimited |
| CV optimizations                            |        1 |       Unlimited |           Unlimited |
| Job-discovery runs                          |        3 |              50 |           Unlimited |
| Results per discovery run                   | Up to 20 |        Up to 20 |            Up to 20 |
| Tracked applications                        |       10 |       Unlimited |           Unlimited |
| Stored resumes                              |        1 |               5 |           Unlimited |
| Resume storage                              |     5 MB |           25 MB |          Up to 2 GB |
| Unified preparation workflow                |        — |        Included |            Included |
| Extension capture and approved-package fill |        — |        Included |            Included |

The deterministic match score and ranking do not consume AI requests. Resume
parsing, job analysis, CV optimization, and cover-letter generation are AI
operations and consume the applicable allowance. Public pricing copy and
server-side entitlements should be changed together.

Premium resume storage is enforced at 2,147,483,647 bytes (approximately 2 GB),
matching the public pricing copy. The same numeric constant acts as a practical
unlimited sentinel for count-based quotas, but storage remains bounded.

The public Career Assistant has a separate 20-request/hour user-or-IP throttle.
It does not consume the AI requests shown in this table and does not use the
existing CV/application AI provider.

## AI assistant boundaries

ApplyAI deliberately separates three product concepts:

| Assistant                        | Status      | Data boundary                                                                                                                                |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Public Career Assistant (Nori)   | Implemented | Receives only the conversation and approved public career context; it cannot read an account, CV, profile, or application                    |
| Application-generation AI        | Implemented | Processes a user-authorized CV and selected job for parsing, analysis, truthful optimization, and cover-letter generation                    |
| Personalized dashboard assistant | Planned     | Would require explicit consent, scoped retrieval, audit controls, and a separate security review before it can access private dashboard data |

## Architecture

ApplyAI is a pnpm/Turborepo monorepo built as a modular monolith.

| Layer            | Technology                                                      |
| ---------------- | --------------------------------------------------------------- |
| Backend API      | NestJS 11, Prisma 5, PostgreSQL 16, Redis 7, BullMQ             |
| Dashboard        | Next.js 15, React 19, Tailwind CSS, Zustand, React Query        |
| Chrome extension | Manifest V3, Vite 6, React 18, Tailwind CSS                     |
| AI providers     | Configurable OpenAI, Anthropic Claude, or Google Gemini         |
| Career Assistant | Dedicated Dahl-compatible adapter, isolated module, and Nori UI |
| Authentication   | JWT/session rotation, OAuth 2.0, Argon2id, authenticator MFA    |
| Billing          | Stripe subscriptions, portal, and idempotent webhooks           |
| Resume storage   | Local development adapter or AWS S3                             |
| Delivery         | Docker, Kubernetes manifests, GitHub Actions, Vercel dashboard  |
| Monorepo         | pnpm 10, Turborepo                                              |

Important architectural rules:

- user-owned records are checked against the authenticated user;
- AI and storage providers sit behind explicit ports/adapters;
- generated CV content is checked against verified source data to prevent
  fabricated claims;
- authenticated throttling uses the verified user ID; public traffic uses a
  trusted-proxy-aware IP key;
- final application submission is always a human decision.

## Repository structure

```text
applyai/
├── .github/workflows/          # CI and staging/production workflows
├── apps/
│   ├── api/                    # NestJS API, workers, Prisma schema/migrations
│   ├── dashboard/              # Next.js dashboard and marketing site
│   └── extension/              # Manifest V3 browser extension
├── packages/
│   ├── api-client/             # Typed API client
│   ├── config/                 # Shared TypeScript/lint/format config
│   ├── design-tokens/          # Shared design tokens
│   └── shared-types/           # Shared DTO and domain types
├── infra/
│   ├── docker/                 # Images and full local stack
│   ├── k8s/                    # Base and environment overlays
│   └── scripts/                # Release helpers
└── docs/                       # Architecture, operations, use cases, ADRs
```

The database contains 22 domain models, including users/sessions, profiles,
resumes and versions, jobs/companies, applications and cover letters,
subscriptions/payments, usage/audit records, the hashed match-score cache, and
durable mutation-idempotency records.

## Local development

### Prerequisites

- Node.js 24.x
- pnpm 10.x (the repository pins `pnpm@10.30.3`)
- Docker and Docker Compose

### Install and configure

```bash
git clone https://github.com/yahyanaim/Autoapply.git applyai
cd applyai
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Set the required database, Redis, AI-provider, authentication, storage, and
Stripe values in `.env`.

To enable the independent Career Assistant, add a newly rotated provider key
to the **API environment only**:

```env
CAREER_CHAT_ENABLED=true
DAHL_CAREER_CHAT_API_KEY=replace-with-a-rotated-server-side-key
DAHL_CAREER_CHAT_BASE_URL=https://inference.dahl.global/v1
DAHL_CAREER_CHAT_MODEL=MiniMaxAI/MiniMax-M2.7
```

The key must never use a `NEXT_PUBLIC_*` or `VITE_*` name. Nori sends no resume
or profile data and does not share the existing AI request allowance.

For extension authentication, set `EXTENSION_ID` to the unpacked or published
Chrome extension ID. Extension production builds also need:

```env
VITE_API_BASE_URL=https://api.example.com
VITE_DASHBOARD_URL=https://app.example.com
```

`VITE_API_BASE_URL` is compiled into the extension and tells it where to
exchange its one-time login code, capture jobs, request scores, and retrieve an
approved application package. It must be the deployed HTTPS NestJS API origin,
not the Vercel dashboard URL.

### Start dependencies and migrate

```bash
docker compose up -d
pnpm --filter @applyai/api prisma:generate
pnpm --filter @applyai/api prisma:migrate:dev
```

### Run the workspace

```bash
pnpm dev
```

- Dashboard: `http://localhost:3000`
- API: `http://localhost:3001`
- Swagger: `http://localhost:3001/api/docs`
- Liveness: `http://localhost:3001/health`
- Readiness: `http://localhost:3001/health/ready`

To run the complete containerized stack, including migrations and persistent
uploads:

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```

## Main API surface

All private endpoints require an authenticated, authorized user.

| Area         | Endpoints                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Auth         | register, login, refresh, logout, OAuth, MFA, active sessions, extension handoff/exchange                              |
| Resumes      | upload/list/get/delete, optimize, version history, authenticated version PDF                                           |
| Jobs         | search/get, capture a user-selected job, discover up to 20 ranked jobs                                                 |
| Applications | prepare, create/list/get/delete, edit materials, regenerate, approve, approved package, notes, status, timeline, usage |
| Career chat  | public, bounded `POST /career-chat/messages`; isolated Dahl provider and no persisted conversation                     |
| AI           | stored/text match score, optimize, cover letter, usage                                                                 |
| Billing      | subscription, checkout session, billing portal, Stripe webhook                                                         |
| Admin        | users, platform/AI metrics, approved public-board ingestion                                                            |

Swagger is the canonical request/response reference when the API is running.

Costly mutation endpoints require an `Idempotency-Key` header containing 16–128
letters, numbers, dots, underscores, colons, or hyphens. A client must keep the
same key and request body until a logical operation succeeds, including after a
timeout or lost response.
Reusing a key with a different body, or while the original request is still in
progress, returns `409`. Completed responses are replayed without repeating the
provider call, write, or quota charge. This is bounded replay protection, not a
general exactly-once guarantee across third-party systems.

## Chrome extension

### Supported page adapters

| Site           | Behavior                                      |
| -------------- | --------------------------------------------- |
| Greenhouse     | Capture, score overlay, approved-package fill |
| Lever          | Capture, score overlay, approved-package fill |
| Ashby          | Capture, score overlay, approved-package fill |
| Indeed Morocco | Capture and analyze only the user-opened job  |
| Rekrute        | Capture and analyze only the user-opened job  |
| Anapec         | Capture and analyze only the user-opened job  |
| MarocAnnonces  | Capture and analyze only the user-opened job  |

LinkedIn bulk automation is not implemented. Workday, SmartRecruiters, and
BambooHR adapters remain future work.

To preview locally:

```bash
pnpm --filter @applyai/extension build
```

Then open `chrome://extensions`, enable Developer mode, choose **Load
unpacked**, and select `apps/extension/dist`.

## Verification

Before committing:

```bash
pnpm check
```

This generates the Prisma client, lints, type-checks, tests, builds, and audits
dependencies. Service-backed suites can also be run explicitly:

```bash
pnpm --filter @applyai/api test:integration
pnpm --filter @applyai/api test:e2e
```

Integration tests require isolated PostgreSQL and Redis services. The mocked
dashboard Playwright flow runs in CI. The live staging journey additionally
requires an isolated paid test account:

```env
E2E_API_URL=https://staging-api.example.com
E2E_PAID_EMAIL=e2e-paid@example.com
E2E_PAID_PASSWORD=replace-with-staging-only-password
```

These live credentials are external release configuration and must never point
at a real user's account.

## Deployment

### Dashboard on Vercel

Use `apps/dashboard` as the Vercel Root Directory and set
`NEXT_PUBLIC_API_URL` to the public HTTPS API origin. The dashboard does not
contain the backend.

### Backend

Deploy the NestJS API and workers on container infrastructure with PostgreSQL,
Redis/BullMQ, S3-compatible storage, AI-provider credentials, and Stripe
configuration. Apply production Prisma migrations before serving traffic.

### Extension

Build the extension with its real `VITE_API_BASE_URL` and
`VITE_DASHBOARD_URL`, update manifest origins when domains change, and set the
resulting browser extension ID as `EXTENSION_ID` on the backend.

See [Vercel and backend deployment](docs/VERCEL_DEPLOYMENT.md) for the complete
configuration and verification checklist.

## Security, privacy, and legal boundaries

- passwords use Argon2id; sessions rotate and have idle/absolute expiry;
- production applies CSP, HSTS, anti-framing/sniffing, referrer, and
  permissions policies;
- resume storage is user-scoped and production uploads request S3 server-side
  encryption;
- consent, data export, and account erasure are implemented;
- AI inputs, outputs, time, cost, and plan quotas are bounded;
- the public Career Assistant uses a separate server-only key and rate limit, stores no conversation,
  and receives no private resume/profile/application data;
- the extension never answers unknown screening questions or clicks final
  Submit;
- use of any job source must follow its current terms, robots policy, privacy
  obligations, and applicable law.

Unattended auto-apply and unauthorized HTML crawling are intentionally outside
the current product boundary.

## More documentation

- [Project use cases](docs/USE_CASES.md)
- [Unified application workflow](docs/UNIFIED_APPLICATION_WORKFLOW.md)
- [Technical architecture](docs/TECHNICAL.md)
- [Specification completion matrix](docs/SPEC_COMPLETION.md)
- [Data dictionary](docs/DATA_DICTIONARY.md)
- [Incident response](docs/INCIDENT_RESPONSE.md)
- [Deployment and operations](docs/DEPLOYMENT_OPERATIONS.md)
- [MFA key operations](docs/MFA_KEY_OPERATIONS.md)
- [Canonical product specification](docs/PRODUCT_SPEC.md)
- [Architecture decisions](docs/ADRS)

## License

Private — All rights reserved.
