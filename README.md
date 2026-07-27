# ApplyAI — AI-Powered Job Search & Auto-Apply Platform

An AI-driven personal recruiter: parse resumes, score job matches, optimize applications, and manage the entire job search pipeline — with the human always in control.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | NestJS 11, Prisma 5, PostgreSQL 16, Redis 7, BullMQ |
| Frontend | Next.js 15, React 19, Tailwind CSS, Zustand, React Query |
| Chrome Extension | Manifest V3, Vite 6, React 18, Tailwind CSS |
| AI Providers | Configurable OpenAI, Anthropic Claude, or Google Gemini |
| Auth | JWT/session rotation, OAuth 2.0, Argon2id, authenticator MFA |
| Payments | Stripe (subscriptions, billing portal) |
| Storage | Local development storage or AWS S3 (resumes) |
| Infrastructure | Docker, Kubernetes, GitHub Actions CI/CD |
| Monorepo | pnpm 9, Turborepo |

## Project Structure

```
applyai/
├── .github/workflows/          # CI and environment deployments
├── apps/
│   ├── api/                    # NestJS backend API
│   │   └── src/
│   │       ├── main.ts         # App bootstrap
│   │       ├── app.module.ts   # Root module
│   │       ├── database/       # Prisma schema + migrations
│   │       ├── modules/        # Feature modules (hexagonal)
│   │       │   ├── auth/       # Authentication & authorization
│   │       │   ├── user/       # User management
│   │       │   ├── profile/    # Profile management
│   │       │   ├── resume/     # Resume upload, parse, optimize
│   │       │   ├── ai/         # AI provider abstraction + scoring
│   │       │   ├── job/        # Job search + ingestion
│   │       │   ├── application-tracker/  # Application pipeline
│   │       │   ├── billing/    # Stripe subscriptions
│   │       │   ├── notification/ # In-app + email notifications
│   │       │   └── admin/      # Protected admin APIs and metrics
│   │       └── shared/         # Guards, interceptors, ports, adapters
│   ├── dashboard/              # Next.js web dashboard
│   │   └── src/
│   │       ├── app/            # App Router pages
│   │       ├── components/     # UI components + layout
│   │       └── lib/            # API client, hooks, store
│   └── extension/              # Chrome extension (Manifest V3)
│       └── src/
│           ├── background/     # Service worker, auth, messaging
│           ├── popup/          # Extension popup UI
│           ├── options/        # Extension options page
│           └── content-scripts/ # Job site adapters + overlay
├── packages/
│   ├── shared-types/           # Entities, enums, DTOs
│   ├── design-tokens/          # Nova Design System v2.0 tokens
│   ├── api-client/             # Typed API client
│   └── config/                 # Shared tsconfig, eslint, prettier
├── infra/
│   ├── docker/                 # Dockerfiles + docker-compose
│   ├── k8s/                    # Base manifests + staging/production overlays
│   └── scripts/                # Release automation
└── docs/                       # ADRs, API docs
```

## Architecture Principles

- **Ports & adapters where boundaries matter** — Storage and AI providers are isolated behind explicit interfaces and factories.
- **Module isolation** — Each NestJS module owns one domain concept with `domain/`, `application/`, `infrastructure/`, `interface/`, `__tests__/` layers.
- **AI provider abstraction** — All AI calls go through `AIProvider.complete()`. Providers (OpenAI, Claude, Gemini) are swappable via config, not code changes.
- **Monolith-first** — Single NestJS monolith for MVP. Clean module boundaries enable future service extraction without rewrites.
- **User-scoped data** — Private records are checked against the authenticated user at service boundaries.

## Getting Started

### Prerequisites

- Node.js 24.11+ (LTS)
- pnpm 9
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)

### 1. Clone & Install

```bash
git clone <repo-url> applyai
cd applyai
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys and database credentials
```

Set `EXTENSION_ID` to the unpacked/published Chrome extension ID before using
extension authentication. Production extension builds must also set
`VITE_DASHBOARD_URL` and `VITE_API_BASE_URL` to the deployed HTTPS origins.
Configure the optional `SMTP_*` values only when email notifications are
required.

### 3. Start Development Dependencies

```bash
docker compose up -d
```

This starts PostgreSQL 16 and Redis 7 on localhost only. To run the complete
containerized stack (including migrations and persistent uploads), use
`docker compose -f infra/docker/docker-compose.yml up --build` instead.

### 4. Run Database Migrations

```bash
pnpm --filter @applyai/api prisma:generate
pnpm --filter @applyai/api prisma:migrate:dev
```

### 5. Start Development

```bash
pnpm dev
```

This starts all apps via Turborepo:
- API: `http://localhost:3001`
- Dashboard: `http://localhost:3000`
- API Docs: `http://localhost:3001/api/docs`

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register with email/password |
| POST | `/auth/login` | Login; returns a short-lived access token and sets a refresh cookie |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke session |
| GET | `/auth/profile` | Get current user profile |
| GET/DELETE | `/auth/sessions/*` | Review and revoke active sessions |
| POST | `/auth/mfa/setup`, `/auth/mfa/confirm` | Enroll authenticator MFA |
| POST | `/auth/extension/handoff`, `/auth/extension/exchange` | Single-use dashboard-to-extension sign-in |
| GET | `/auth/google` | Google OAuth redirect |
| GET | `/auth/github` | GitHub OAuth redirect |

### Resumes
| Method | Endpoint | Description |
|---|---|---|
| POST | `/resumes` | Upload resume (PDF/DOCX) |
| GET | `/resumes` | List user resumes |
| GET | `/resumes/:id` | Get resume details |
| DELETE | `/resumes/:id` | Delete resume |
| POST | `/resumes/:id/optimize` | Optimize resume for a job |

### Jobs
| Method | Endpoint | Description |
|---|---|---|
| GET | `/jobs/search` | Search jobs with filters |
| GET | `/jobs/:id` | Get job details |

### Applications
| Method | Endpoint | Description |
|---|---|---|
| POST | `/applications` | Create application |
| GET | `/applications` | List applications |
| GET | `/applications/:id` | Get an owned application |
| PATCH | `/applications/:id` | Update application status |
| GET | `/applications/:id/timeline` | Get application timeline |
| DELETE | `/applications/:id` | Delete an owned tracked application |

### AI
| Method | Endpoint | Description |
|---|---|---|
| POST | `/ai/match-score` | Score a stored resume against a stored job |
| POST | `/ai/match-score-text` | Score a stored resume against supplied job text |
| POST | `/ai/optimize` | Optimize resume for a job |
| POST | `/ai/cover-letter` | Generate cover letter |
| GET | `/ai/usage` | Get current usage stats |

### Billing
| Method | Endpoint | Description |
|---|---|---|
| GET | `/billing/subscription` | Get current plan and recent payments |
| POST | `/billing/checkout-session` | Create Stripe checkout |
| POST | `/billing/portal-session` | Create Stripe portal session |
| POST | `/billing/webhook` | Stripe webhook handler |

### Admin
| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/users` | List all users |
| GET | `/admin/metrics` | Platform metrics |
| GET | `/admin/ai-usage` | AI usage analytics |
| POST | `/admin/jobs/ingest` | Ingest a public Greenhouse, Lever, or Ashby board |

## Chrome Extension

### Supported Job Sites

| Site | Status | Adapter |
|---|---|---|
| Greenhouse | ✅ Implemented | `adapters/greenhouse/adapter.ts` |
| Lever | ✅ Implemented | `adapters/lever/adapter.ts` |
| Ashby | ✅ Implemented | `adapters/ashby/adapter.ts` |
| LinkedIn | ⚠️ ToS Risk | Not implemented (see Section 0) |
| Indeed | ⚠️ ToS Risk | Not implemented (see Section 0) |
| Workday | 📋 Planned | Not implemented |
| SmartRecruiters | 📋 Planned | Not implemented |
| BambooHR | 📋 Planned | Not implemented |

### Extension Features

- **Match Score Overlay** — Injects on job pages, shows score badge with accessibility labels
- **Assistive Autofill** — Populates application forms, user reviews before submit
- **Quick Actions** — Popup for analyzing the current posting and showing its score
- **Auth** — User-approved, two-minute single-use dashboard handoff; the extension never asks for a password

## Design System — Nova v2.0

### Colors
| Token | Value | Usage |
|---|---|---|
| `brand.primary` | `#FF6A00` | CTAs, primary actions |
| `brand.hover` | `#E95E00` | Hover states |
| `success` | `#22C55E` | Match score 80+, positive states |
| `warning` | `#F59E0B` | Match score 50-79, caution |
| `danger` | `#EF4444` | Match score <50, errors |
| `info` | `#3B82F6` | Informational |

### Typography
- **Headings**: Inter, 600 weight (h1: 32px, h2: 24px)
- **Body**: Inter, 400 weight, 16px, line-height 1.5
- **Code**: JetBrains Mono
- **Minimum contrast**: 4.5:1 (WCAG AA)

### Spacing
8-point grid: 4, 8, 12, 16, 24, 32, 40, 48px

### Radius
- Buttons/inputs: 16px
- Cards: 24px
- Modals: 32px
- Badges: fully rounded

## Database Schema

19 models covering the full domain:

- **User** — Auth, roles, privacy consent, encrypted MFA configuration
- **ExtensionAuthHandoff** — Short-lived, hashed, single-use extension linking
- **OAuthAccount** — External identity links
- **Profile** — Career info, preferences
- **Resume** — File storage and parsed JSON
- **ResumeVersion** — Job-specific optimized resume revisions
- **Skill** — Many-to-many with Resume and Job
- **Job** — Sources, descriptions, skills
- **Company** — Employer metadata
- **Application** — Pipeline tracking with timeline
- **CoverLetter** — Generated content
- **Subscription** — Plan management (Free/Pro/Premium)
- **Payment** — Stripe payment records
- **StripeWebhookEvent** — Idempotent webhook processing ledger
- **AIRequest** — Cost tracking per feature/provider
- **UsageLimit** — Per-tier quotas
- **Notification** — In-app + email delivery
- **ActivityLog** — Auth, access-denial, and queue audit records
- **Session** — Active session, idle/absolute expiry, and MFA verification tracking

## Security

- **Password hashing**: Argon2id (not bcrypt)
- **Auth**: Short-lived JWT, rotating server-side sessions, 15-minute idle/8-hour absolute limits, OAuth state validation, one-time extension handoff, and MFA-gated privileged access
- **Rate limiting**: Redis-backed per-route throttling shared across API replicas, plus ingress limits and atomic plan quotas
- **Security headers**: Explicit production CSP, one-year HSTS, anti-framing/sniffing, strict referrers, and permissions policy
- **Input validation**: class-validator DTOs on all endpoints, parameterized queries via Prisma
- **Dependency hygiene**: frozen lockfile plus a zero-known-vulnerability audit in CI
- **OWASP Top 10** mapped mitigations in `docs/TECHNICAL.md`

## Deployment

### Local Development
```bash
docker compose up -d
pnpm dev
```

### Staging (auto-deploy on merge to main)
```bash
# GitHub Actions: deploy-staging.yml
# Builds Docker images → pushes to ECR → kubectl apply
```

### Production (manual trigger)
```bash
# GitHub Actions: deploy-production.yml
# Requires environment approval
```

### Docker
```bash
# API
docker build -f infra/docker/api.Dockerfile -t applyai-api .

# Dashboard
docker build -f infra/docker/dashboard.Dockerfile -t applyai-dashboard .
```

### Vercel dashboard

Deploy the Next.js app as a Vercel monorepo project with Root Directory
`apps/dashboard`. The checked-in `apps/dashboard/vercel.json` pins the
framework and workspace-aware install/build commands. Configure
`NEXT_PUBLIC_API_URL` with the public HTTPS API origin.

The NestJS API must run separately on container infrastructure with PostgreSQL,
Redis, BullMQ workers, and S3-compatible storage. See
[`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md) for the complete
configuration and verification checklist.

## Testing

```bash
# Run all tests
pnpm test

# Run specific module tests
pnpm exec turbo run test --filter=@applyai/api

# Run the API tests directly
pnpm --filter @applyai/api test

# Run PostgreSQL/Redis API and BullMQ lifecycle integration tests
pnpm --filter @applyai/api test:integration

# Run the staging core journey (requires E2E_API_URL and configured dependencies)
pnpm --filter @applyai/api test:e2e
```

## Development Workflow

1. Create feature branch from `main`
2. Implement with tests (follow Appendix A execution order in `Prompt.md`)
3. Run `pnpm check` before committing
4. Open PR — CI runs lint, typecheck, test, build
5. Merge to main → auto-deploy to staging
6. Manual promote to production

## Legal Notice

Automated interaction with LinkedIn, Indeed, Greenhouse, Lever, Workday, etc. may violate those platforms' Terms of Service. This project implements **assistive** features (user-in-the-loop autofill) for MVP. Fully unattended auto-submit is a Phase 3+ feature gated behind legal review and official partner APIs only.

## License

Private — All rights reserved.
