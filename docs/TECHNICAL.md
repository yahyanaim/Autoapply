# ApplyAI — Technical Documentation

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Database Schema](#2-database-schema)
3. [Authentication & Security](#3-authentication--security)
4. [AI Architecture](#4-ai-architecture)
5. [API Reference](#5-api-reference)
6. [Chrome Extension Architecture](#6-chrome-extension-architecture)
7. [Deployment & Infrastructure](#7-deployment--infrastructure)
8. [Monitoring & Observability](#8-monitoring--observability)
9. [Prompt Engineering](#9-prompt-engineering)
10. [Performance & Scalability](#10-performance--scalability)

---

## 1. System Architecture

### 1.1 High-Level Overview

```
┌─────────────────┐   ┌──────────────────────┐   ┌─────────────────┐
│ Chrome Extension │──▶│   Backend API (NestJS) │◀──│  Web Dashboard   │
│ (Manifest V3)    │   │       REST API         │   │  (Next.js/React) │
└─────────────────┘   └──────────┬───────────┘   └─────────────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                 ▼
          ┌────────────┐  ┌──────────────┐  ┌────────────────┐
          │ PostgreSQL │  │ Redis + BullMQ│  │ AI Provider Layer│
          │  (Prisma)  │  │ (resume queue)│  │ (OpenAI/Claude/  │
          └────────────┘  └──────────────┘  │     Gemini)      │
                                             └────────────────┘
                                  │
                          ┌───────────────┐
                          │ S3 / Object   │
                          │ Storage       │
                          │ (resumes, PDFs)│
                          └───────────────┘
```

### 1.2 Architectural Decisions

| Decision | Rationale | Reference |
|---|---|---|
| Monolith-first | Small team, MVP, unclear domain boundaries → low complexity, fast development | Section 6.1 of Prompt.md |
| Hexagonal architecture | Domain logic isolated from framework/DB/AI specifics | Section 2.3 of Prompt.md |
| AI provider abstraction | Every AI call through `AIProvider.complete()` for swappability | Section 7.1 of Prompt.md |
| BullMQ queue | Durable resume parsing with bounded retries and retained failures | Section 6.3 of Prompt.md |
| Multi-tenant from day one | Avoid painful later migration | Section 2.2 of Prompt.md |

### 1.3 Module Boundaries

Each NestJS module follows hexagonal architecture:

```
module/
├── domain/          # Entities, value objects, domain logic
├── application/     # Business services (orchestration layer)
├── infrastructure/  # External adapters (DB, AI, S3, Stripe)
├── interface/       # HTTP layer (controllers, DTOs, guards)
└── __tests__/       # Unit and integration tests
```

**Dependency rule**: Domain → Application → Interface. Infrastructure implements port interfaces defined in domain or shared.

---

## 2. Database Schema

### 2.1 Entity Relationship Diagram

```
User (1) ── (1) Profile
User (1) ── (N) Resume ── (N) ResumeVersion
User (1) ── (N) Application ── (1) Job ── (1) Company
User (1) ── (N) CoverLetter
User (1) ── (1) Subscription ── (N) Payment
User (1) ── (N) AIRequest
User (1) ── (N) Notification
User (1) ── (N) ActivityLog
User (1) ── (N) Session
User (1) ── (1) UsageLimit
User (1) ── (N) OAuthAccount
Job (N) ── (N) Skill
Resume (N) ── (N) Skill
```

### 2.2 Core Models

#### User
| Field | Type | Description |
|---|---|---|
| id | String (cuid) | Primary key |
| email | String | Unique, indexed |
| passwordHash | String? | Null for OAuth-only users |
| role | UserRole | user, org_admin, platform_admin |
| isEmailVerified | Boolean | Default false |

#### Resume
| Field | Type | Description |
|---|---|---|
| id | String (cuid) | Primary key |
| userId | String | FK → User |
| originalFileUrl | String | Local `/uploads/...` path or `s3://...` object reference |
| parsedJson | Json? | Structured extraction (skills, experience, etc.) |
| isPrimary | Boolean | User's default resume |

#### AIRequest
| Field | Type | Description |
|---|---|---|
| id | String (cuid) | Primary key |
| userId | String | FK → User |
| feature | AIRequestFeature | resume_optimize, match_score, cover_letter, etc. |
| provider | String | openai, claude, gemini |
| tokensUsed | Int? | Token count |
| cost | Float? | USD cost |
| inputHash | String? | Request fingerprint for observability and future deduplication |
| cached | Boolean | Reserved cache marker; currently always false |

#### UsageLimit
| Field | Type | Description |
|---|---|---|
| userId | String | Unique, FK → User |
| applicationsUsed | Int | Current period count |
| applicationsMax | Int | Free: 10, Pro: unlimited |
| aiRequestsUsed | Int | Current period count |
| aiRequestsMax | Int | Free: 50, Pro: 500, Premium: unlimited |
| resumesUsed / resumesMax | Int | Stored résumé count and plan cap (Free: 1, Pro: 5) |
| storageBytesUsed / storageBytesMax | Int | Stored résumé bytes and plan cap |
| resetAt | DateTime | Period reset timestamp |

### 2.3 Key Indexes

- `users`: email (unique)
- `resumes`: userId
- `jobs`: companyId, sourceUrl (unique)
- `applications`: userId, jobId, status
- `ai_requests`: userId, feature, createdAt, inputHash
- `sessions`: userId, token (unique)
- `activity_logs`: userId, type, createdAt

---

## 3. Authentication & Security

### 3.1 Auth Flow

```
Register → Hash password (Argon2id) → Create User + Subscription + UsageLimit + Session → Issue token pair
Login → Verify password (Argon2.verify) → Verify TOTP for privileged role → Create Session → Issue JWT pair
Refresh → Enforce idle/absolute limits → SHA-256 hash comparison → Atomic single-use rotation
Logout → Revoke Session
Extension → Dashboard creates 2-minute one-time code → Trusted extension exchanges once → Create Session
```

### 3.2 Token Strategy

| Token | Lifetime | Storage | Rotation |
|---|---|---|---|
| Access token (JWT) | 15 minutes | Memory / Authorization header | No (short-lived) |
| Refresh token | Up to configured token TTL, bounded by 15-minute idle and 8-hour absolute session limits | HTTP-only cookie (dashboard) or trusted extension storage | Yes (single-use rotation) |

### 3.3 Password Policy

- Minimum 12 characters
- Must contain: uppercase, lowercase, number, special character
- Hashed with Argon2id (type 2) — NOT bcrypt
- Cost factor: memory 65536 KB, iterations 3, parallelism 4

### 3.4 OAuth Integration

| Provider | Strategy | Callback |
|---|---|---|
| Google | passport-google-oauth20 | `/auth/google/callback` |
| GitHub | passport-github2 | `/auth/github/callback` |

OAuth users get auto-created accounts with `isEmailVerified: true`. Callback
requests are bound to a short-lived, HTTP-only state cookie to prevent login
CSRF. An existing password account is never silently linked by email alone.

### 3.5 Rate Limiting

| Route class | Limit | Scope |
|---|---|---|
| Public | 100 requests / 15 minutes | Health and public webhooks |
| Authenticated | 1,000 requests / 15 minutes | Default signed-in API tier |
| Administrator | 50 requests / 15 minutes | `/admin/*` |
| Registration/login | 10 requests / 15 minutes | Credential endpoints |
| Resume upload | 10 requests / hour | Expensive storage/parser path |

### 3.6 Security Headers

Production explicitly sets `default-src 'self'`, frame denial, no-sniff,
strict-origin referrers, HSTS for one year with subdomains, and a restrictive
permissions policy. Development disables only CSP for local Swagger.

### 3.7 OWASP Top 10 Mitigations

| Risk | Mitigation |
|---|---|
| Broken Access Control | JWT and role guards on protected controllers, explicit public routes, server-side ownership checks |
| Cryptographic Failures | Argon2id, HTTPS-only production ingress, hashed refresh tokens, `crypto.randomBytes` |
| Injection | Prisma parameterized queries, class-validator DTOs |
| Insecure Design | Threat-model AI features, sanitize inputs |
| Security Misconfiguration | Helmet middleware, no default admin accounts |
| Vulnerable Components | Frozen lockfile, automated tests, and zero-known-vulnerability audit at release review |
| Authentication Failures | Redis-backed cross-replica throttling, 12+ character passwords, verified OAuth emails and state validation, rotating sessions |
| Data Integrity Failures | Idempotent Stripe webhook ledger and migration-before-rollout deployment |
| Logging Failures | Request-ID developer traces are separate from persisted auth, access-denial, and queue audit events |
| SSRF | URL allow-list validation on job ingestion |

---

## 4. AI Architecture

### 4.1 Provider Abstraction

```typescript
interface AIProvider {
  complete(
    prompt: PromptTemplate,
    context: Record<string, unknown>
  ): Promise<AIResponse>;
}

interface AIResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
}
```

### 4.2 Provider Implementations

| Provider | Package | Model | Use Case |
|---|---|---|---|
| OpenAI | `openai` | `OPENAI_MODEL` (`gpt-4o-mini` by default) | Primary or fallback |
| Claude | `@anthropic-ai/sdk` | `ANTHROPIC_MODEL` | Primary or fallback |
| Gemini | `@google/generative-ai` | `GOOGLE_AI_MODEL` | Primary or fallback |

Provider calls use configurable ordered fallback and per-provider circuit
breakers. The provider actually used is recorded on `AIRequest`.

Every provider request shares the same guardrails: `AI_MAX_INPUT_BYTES`,
`AI_MAX_OUTPUT_TOKENS`, `AI_REQUEST_TIMEOUT_MS`, and
`AI_MAX_REQUEST_COST_USD`. Production also requires non-zero per-token pricing so
the cost ceiling cannot silently be bypassed.

Exactly one configured provider is selected for a request. The implementation
does not silently fall back to a different provider when that provider fails.

### 4.3 Prompt Template System

Prompts are versioned markdown files in `src/modules/ai/prompts/`:

| File | Feature | Variables |
|---|---|---|
| `match-score.v2.md` | ATS scoring | `{{resume}}`, `{{jobDescription}}` |
| `resume-optimize.v2.md` | Resume optimization | `{{resume}}`, `{{jobDescription}}` |
| `cover-letter.v2.md` | Cover letter generation | `{{resume}}`, `{{jobDescription}}`, `{{tone}}` |

**Versioning rules**:
- Bump version suffix on any meaningful change
- `AIRequest.promptVersion` logs which version produced which output
- Keep previous version for 30 days for regression comparison

### 4.4 Match Scoring Algorithm

Weighted 4-dimension scoring (0–100):

| Dimension | Weight | Evaluation |
|---|---|---|
| Skills & Keywords | 40% | Hard skills, tools, technologies from JD |
| Experience Relevance | 30% | Years, seniority, industry context |
| Education & Credentials | 15% | Degree, certifications, licenses |
| Keyword Coverage | 15% | Literal coverage of significant job-description terms |

**Score bands**: 80–100 strong, 60–79 moderate, 40–59 weak, 0–39 poor.

### 4.5 Fabrication Detection

Post-generation validation that checks:
- No added experience, titles, or roles
- No modified dates or durations
- No fabricated skills or certifications
- Original facts preserved exactly

### 4.6 Generated CV Documents

Resume optimization returns structured copy rather than an untrusted finished
document. The server merges that copy with verified resume and profile fields,
rejects changed or fabricated claims, and persists a `classic-ats-v1` JSON
snapshot on `ResumeVersion.documentJson`.

The dashboard can restore that snapshot after refresh and displays an HTML
preview matching the downloadable result. An authenticated, tenant-scoped
endpoint renders selectable text with PDFKit:

```text
GET /resumes/:resumeId/versions/:versionId/pdf
```

The A4 PDF uses a one-column serif structure with no icons, images, or floating
text boxes. This mirrors the supplied classic resume reference and remains
friendly to common applicant tracking systems.

### 4.7 Cost Controls

- Per-tier monthly AI-request quotas enforced at `AIModule` level
- Token/cost logging per request (`AIRequest.tokensUsed`, `.cost`)
- Input hashes recorded for observability and future deduplication (no response cache yet)
- Protected admin API for per-feature AI usage and cost summaries

---

## 5. API Reference

### 5.1 Authentication

Business endpoints require JWT via `Authorization: Bearer <token>`. Public
routes are the authentication entry points, `/health`, `/health/ready`, and the
Stripe-signature-verified `/billing/webhook` endpoint.

### 5.2 Response Format

Successful endpoints return their documented payload directly. Validation errors
use NestJS's standard shape:
```json
{
  "statusCode": 400,
  "message": ["email must be an email"],
  "error": "Bad Request"
}
```

### 5.3 Key Endpoints

Outside production, see `GET /api/docs` (Swagger) for the generated OpenAPI
specification. Swagger is intentionally not mounted in production.

---

## 6. Chrome Extension Architecture

### 6.1 Manifest V3 Structure

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://boards.greenhouse.io/*",
    "https://job-boards.greenhouse.io/*",
    "https://*.lever.co/*",
    "https://jobs.ashbyhq.com/*"
  ],
  "background": { "service_worker": "src/background/index.ts" },
  "action": { "default_popup": "src/popup/index.html" },
  "content_scripts": [{
    "matches": ["https://boards.greenhouse.io/*", ...],
    "js": ["src/content-scripts/core/index.ts"]
  }]
}
```

### 6.2 Adapter Pattern

Each job site gets an adapter implementing `JobPageAdapter`:

```typescript
interface JobPageAdapter {
  name: string;
  canHandle(url: string): boolean;
  detectJobPosting(): boolean;
  extractJobDescription(): {
    title: string;
    company: string;
    description: string;
    url: string;
  } | null;
  findFormFields(): FormField[];
  fillField(fieldId: string, value: string): boolean;
}
```

### 6.3 Message Flow

```
Content Script (detects job page)
    │
    ▼
Background Service Worker (message router)
    │
    ├──▶ API: POST /ai/match-score-text
    │
    ◀── Response: { score, missingKeywords, weakSections, explanation }
    │
    ▼
Content Script (injects MatchScoreOverlay via Shadow DOM)
```

### 6.4 Security

- Access tokens in `chrome.storage.session`; refresh tokens in extension-only
  `chrome.storage.local` so service-worker restarts do not sign the user out
- Linking uses a two-minute, hashed, single-use code approved in the signed-in
  dashboard; direct extension password login is rejected
- Minimum host permissions per site (not `<all_urls>`)
- Shadow DOM for style isolation on overlays
- No remote code execution in content scripts

---

## 7. Deployment & Infrastructure

### 7.1 Environments

| Environment | Trigger | Stack |
|---|---|---|
| Local dependencies | `docker compose up -d` | PostgreSQL + Redis, followed by `pnpm dev` |
| Local full stack | `docker compose -f infra/docker/docker-compose.yml up --build` | API + dashboard + PostgreSQL + Redis |
| Staging | Push to `main` | ECR + Kubernetes |
| Production | Manual workflow dispatch | ECR + Kubernetes |

### 7.2 Docker

**API** (multi-stage):
1. Builder: `node:24-alpine`, pnpm install, Prisma generation, filtered API build and production deploy bundle
2. Runner: `node:24-alpine`, copy dist, expose 3001

**Dashboard** (multi-stage):
1. Builder: `node:24-alpine`, pnpm install, next build (standalone)
2. Runner: `node:24-alpine`, copy .next/standalone, expose 3000

### 7.3 Kubernetes

- **Deployment**: 2 replicas, RollingUpdate, resource limits
- **Health checks**: Liveness (`/health`, 15s initial), dependency readiness (`/health/ready`, 5s initial)
- **Ingress**: nginx, externally provisioned TLS secrets, rate limit annotations

### 7.4 CI/CD (GitHub Actions)

**CI** (on PR):
1. Frozen install → dependency audit → Prisma generation → lint → typecheck → test → build

**Deploy Staging** (on push to main):
1. Docker build → Push to ECR → kubectl apply

**Deploy Production** (manual):
1. Same as staging, with environment approval gates

---

## 8. Monitoring & Observability

### 8.1 Operational Signals

- **Developer traces**: structured start/completion/failure events keyed by
  `X-Request-ID`, with user/job IDs carried through significant branches
- **Security/business audit**: persisted authentication, access-denial, and
  queue lifecycle events in `ActivityLog`
- **AI operations**: provider, model, prompt version, token count, cost, latency,
  and input hash persisted in `AIRequest`
- **Durable state**: Stripe webhook events, payments, resume parse status, and
  retained BullMQ failures support diagnosis and safe retries
- **Dead-letter visibility**: terminal resume parsing failures are retained in
  `resume-parse-dead-letter` with original job IDs and attempt metadata

### 8.2 Metrics to Monitor

| Metric | Alert Threshold |
|---|---|
| API error rate | > 1% of requests |
| Queue depth (BullMQ) | > 100 pending jobs |
| AI provider latency | > 5s p95 |
| AI cost per day | > $50/day |
| Stripe webhook failures | Any failure |
| Authentication failures | > 50/hour per IP |

### 8.3 Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 15
  periodSeconds: 20
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3
```

---

## 9. Prompt Engineering

### 9.1 Prompt Structure (v2)

Each prompt follows a consistent structure:
1. **Role definition** — Expert persona
2. **Task** — Specific objective
3. **Methodology** — Weighted scoring, rules, formatting
4. **Hard constraints** — Non-negotiable rules
5. **Output format** — Strict JSON schema
6. **Input variables** — `{{placeholder}}` syntax

### 9.2 Anti-Fabrication Rules

- Never invent experience, titles, dates, or skills
- Rephrase existing facts only
- The resume-optimization prompt requires `fabricationCheck: "passed"`; other
  response schemas do not expose that field
- Original text returned unchanged if optimization requires fabrication

### 9.3 Quality Controls

- Versioned prompts with `AIRequest.promptVersion` logging
- Deterministic match-score, fabrication, and cover-letter genericness controls
- Golden-set score-band and shipped-prompt guardrail evaluation in the standard suite
- Previous prompt files retained during version transitions for comparison

---

## 10. Performance & Scalability

### 10.1 Current Architecture

Single NestJS monolith with PostgreSQL. Designed for horizontal scaling via:
- Stateless API servers behind load balancer
- PostgreSQL-backed session records and Redis-backed queue and rate-limit management
- S3 object storage in Kubernetes; private local storage for development

### 10.2 Scaling Path

| Stage | Trigger | Action |
|---|---|---|
| Single process | MVP | Current architecture |
| Multi-process | > 1000 concurrent users | PM2 cluster mode or Kubernetes replicas |
| Service extraction | Independent scaling needed | Split ResumeModule or AIModule into standalone service |
| Database scaling | > 10k users | Read replicas, connection pooling |

### 10.3 Caching Strategy

Deterministic match scoring does not call a paid provider. Provider-backed
requests record input hashes for observability and future response caching;
session state and explicit expiries remain in PostgreSQL.

### 10.4 Queue Design

| Queue | Purpose | Retry Strategy |
|---|---|---|
| `resume-parse` | PDF/DOCX → structured JSON | Stable job ID, idempotent completion, exponential backoff, max 3 attempts, ActivityLog, terminal DLQ |

Resume optimization, job ingestion, assistive autofill, and notifications are
currently synchronous request flows rather than BullMQ queues.

---

## Appendix: Implemented Areas

The repository contains the NestJS API modules, Next.js 15 dashboard, Manifest
V3 extension, shared packages, test suites, and Docker/Kubernetes/GitHub Actions
deployment definitions described above. File counts are intentionally omitted
because generated artifacts and ongoing development make them misleading.
