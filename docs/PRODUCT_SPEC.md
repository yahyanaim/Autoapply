# ApplyAI — AI-Powered Job Search & Auto-Apply Platform

## Master Technical & Product Specification (Execution-Ready)

**Document purpose:** This is a build specification intended to be handed directly to an AI coding agent (e.g., Claude Code) or an engineering team to execute in phases. It converts the original concept brief into a structured, sequenced, and testable engineering plan. Each section is self-contained enough to be pulled out and used as a standalone prompt/ticket.

**How to use this document with an AI agent:** Do not paste the whole document as a single build request. Work top-down: Section 1–2 establish scope and guardrails, Section 11–12 define the sequencing, and each subsequent numbered section is a spec for one subsystem that can be executed independently once its dependencies (listed at the top of each section) are met.

---

## Skills Applied to This Specification

This revision was produced by reading and applying four of your skill files, not just general knowledge. Concretely:

| Skill                                                                            | Where it shaped this document                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **hqse-software-engineering**                                                    | Section 2.3 (component/interface design, encapsulation, tracing vs. logging), Section 6 (async/failure handling), Section 19 (adversarial testing, boundary conditions, regression policy), Section 12 (estimation + contingency, dependency sequencing) |
| **backend-development** (incl. `backend-security.md`, `backend-architecture.md`) | Section 6 (monolith-first justified against the skill's own decision matrix), Section 9 (OWASP Top 10 2025 mapped mitigations, Argon2id, exact rate-limit tiers, security headers)                                                                       |
| **nova-design-system**                                                           | Section 10 rewritten to use your actual v2.0 tokens (color palette, type scale, 8pt spacing, radius/shadow system) instead of generic "modern minimal" direction                                                                                         |
| **behavioral-guidelines**                                                        | Appendix A rewritten as explicit build instructions for the coding agent — simplicity-first, surgical changes only, no speculative abstraction, stop-and-ask on ambiguity                                                                                |

Sections not tied to a specific skill (business/marketing/pricing) are left as general product judgment.

---

## 0. Legal & Platform-Risk Notice (Read First)

Before any engineering work begins, flag this explicitly to stakeholders — it changes MVP scope:

- **Automated interaction with LinkedIn, Indeed, Greenhouse, Lever, Workday, etc. (scraping job data or auto-submitting applications) generally violates those platforms' Terms of Service.** LinkedIn in particular actively detects and bans automation (see _hiQ Labs v. LinkedIn_ and LinkedIn's own enforcement history). This is a business risk, not just a technical one — accounts can be banned, and B2B partners may refuse to integrate with a tool that automates against their ToS.
- **Recommended posture for MVP:** build the _assistive_ layer first (resume parsing, optimization, match scoring, cover letter generation, application tracking, and a **user-in-the-loop autofill** extension that fills a form the user reviews and submits themselves) and treat **fully unattended auto-submit** as a Phase 3+ feature gated behind explicit legal review, and ideally implemented only against platforms with **official partner APIs** (e.g., Greenhouse Job Board API, Lever Postings API, Ashby API) rather than DOM scraping of LinkedIn/Indeed.
- Data protection: resumes and application data are sensitive personal data. GDPR/CCPA compliance is a Day-1 architectural constraint, not a later add-on (see Section 9 and Section 18).

This document proceeds with the full vision as requested, but every section involving auto-apply or scraping is marked **[ToS-Risk]** so the team can consciously choose scope.

---

## 1. Product Requirements Document (PRD)

### 1.1 Problem Statement

Job seekers spend disproportionate time on low-leverage, repetitive work — tailoring resumes per role, filling near-identical application forms, and manually tracking status — while the actual differentiators of a strong application (relevance, keyword alignment to the job description, and a compelling narrative) are hard to get right without expert help.

### 1.2 Product Vision

ApplyAI acts as an AI-driven personal recruiter: it understands a candidate's profile, finds relevant roles, scores fit, optimizes materials per job, and manages the entire pipeline — with the person retaining control over what's actually submitted.

### 1.3 Target Users (Personas)

| Persona                 | Primary Need              | Key Feature                   |
| ----------------------- | ------------------------- | ----------------------------- |
| Student / New Grad      | Volume + guidance         | ATS Score, Interview Coach    |
| Junior Developer        | Confidence, keyword gaps  | Resume Optimizer, Match Score |
| Senior Engineer         | Time savings, targeting   | AI Recruiter Chat filters     |
| Designer / PM           | Narrative quality         | Cover Letter Generator        |
| Career Changer          | Skill gap mapping         | AI Career Advisor             |
| International Applicant | Visa/relocation filtering | Advanced search filters       |
| Remote Worker           | Geography-agnostic search | Remote-only job aggregation   |

### 1.4 Success Metrics (Product KPIs)

- Activation: % of signups who upload a resume and get a Match Score within 24h
- Core loop engagement: applications tracked per active user per week
- Quality signal: interview rate per application (self-reported + inferred from status changes)
- Retention: Week-4 and Month-3 retention by plan tier
- Monetization: Free→Pro conversion rate, MRR, churn

### 1.5 Business Model — Tiered SaaS

| Tier        | Price positioning                  | Includes                                                                                                           |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Free**    | $0                                 | Resume upload & parsing, limited applications/month (e.g., 10), manual job tracker                                 |
| **Pro**     | Mid-tier monthly                   | Unlimited tracked applications, AI Resume Optimizer, AI Cover Letter Generator, ATS Score, Job Match Score         |
| **Premium** | Top-tier monthly / annual discount | Everything in Pro + AI Interview Coach, AI Career Advisor, Salary Prediction, AI Recruiter Chat, Team/Org accounts |

Pricing specifics (exact $ figures, annual discount %, seat-based pricing for Team accounts) should be validated against competitor pricing (Teal, Simplify, LazyApply, JobCopilot) during Phase 0 discovery rather than fixed in this document.

### 1.6 Non-Goals (explicitly out of scope for MVP)

- Fully unattended auto-submission on platforms without an official API **[ToS-Risk]**
- Native mobile apps (web-responsive only for MVP)
- Multi-language UI localization (English-first, i18n architecture ready but not populated)

---

## 2. System Architecture Overview

### 2.1 High-Level Components

```
┌─────────────────┐   ┌──────────────────────┐   ┌─────────────────┐
│ Chrome Extension │──▶│   Backend API (NestJS) │◀──│  Web Dashboard   │
│ (Manifest V3)    │   │  REST + WebSocket      │   │  (Next.js/React) │
└─────────────────┘   └──────────┬───────────┘   └─────────────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                 ▼
          ┌────────────┐  ┌──────────────┐  ┌────────────────┐
          │ PostgreSQL │  │ Redis + BullMQ│  │ AI Provider Layer│
          │  (Prisma)  │  │ (queues/cache)│  │ (OpenAI/Claude/  │
          └────────────┘  └──────────────┘  │  Gemini/OpenRtr) │
                                             └────────────────┘
                                  │
                          ┌───────────────┐
                          │ S3 / Object   │
                          │ Storage       │
                          │ (resumes, PDFs)│
                          └───────────────┘
```

### 2.2 Guiding Architectural Principles

- **Clean/hexagonal architecture**: domain logic isolated from framework, DB, and AI-provider specifics.
- **AI-provider abstraction**: every AI call goes through a single internal interface (`AIProvider.complete()`) so providers can be swapped or A/B tested without touching business logic.
- **Idempotent job processing**: every long-running task (parsing, optimization, auto-fill) runs as a queued job with retries, so a failed API call never corrupts state.
- **Multi-tenant from day one**: even pre-Team-accounts, every table is scoped by `userId`/`orgId` to avoid a painful later migration.

### 2.3 HQSE Engineering Principles Applied (per hqse-software-engineering skill)

These are binding constraints for implementation, not suggestions:

- **Single responsibility per module.** Every NestJS module in Section 6 owns exactly one domain concept. If a feature doesn't obviously belong to an existing module, create a new one rather than bolting it onto the nearest one.
- **Black-box interfaces.** Each module exposes only what callers need (e.g., `ResumeModule` exposes `parse()`, `optimize()` — never raw parser internals). Test: could the entire implementation be swapped without any caller noticing? If not, the interface leaks internals and needs tightening.
- **Encapsulate everything external.** All third-party/system calls — AI provider SDKs, `Date.now()`, S3, Stripe, job-site DOM access — go through a wrapped interface (Section 7.1's `AIProvider` is the template for this pattern; apply the same shape to storage, payments, and time). This is what makes the system testable and swappable later.
- **Async discipline.** Every async operation (queue jobs, AI calls, webhooks) must define: how the result is delivered, what state survives the async gap, how responses correlate to requests, what happens on out-of-order responses, and cleanup if the remote side disappears mid-operation. BullMQ jobs in Section 6 must specify retry count, backoff strategy, and a dead-letter queue — not just "retry if failed."
- **Tracing is not logging.** Logging (Section 9's audit logs) is for operators; tracing is for developers debugging a specific request. Every significant code branch should emit a trace statement carrying a request/user/job ID, not just "got here." Keep these as separate systems with separate retention policies.
- **Minimize special cases.** Per-job-site adapters (Section 5) are an intentional special case — encapsulate each one behind the shared `JobPageAdapter` interface rather than letting site-specific logic leak into the extension's core code.

### 2.4 Scalability Path (design for it now, don't build it now)

Per the HQSE scalability principle: single-process → multi-process → distributed is the expected path, and each step is cheap **only if the step before encapsulated its data access properly.** Concretely: Section 6 ships as a monolith for MVP (see Section 6.1), but because all data access goes through Prisma repositories and all AI calls go through the provider abstraction, splitting `ResumeModule` or `AIModule` into standalone services later is a deployment change, not a rewrite.

---

## 3. Database Schema (ERD Summary)

Core entities and relationships (Prisma-style, abbreviated — full schema to be generated as `schema.prisma` in implementation):

```
User (1) ── (1) Profile
User (1) ── (N) Resume ── (N) ResumeVersion
User (1) ── (N) Application ── (1) Job ── (1) Company
User (1) ── (N) CoverLetter
User (1) ── (N) Subscription ── (N) Payment
User (1) ── (N) AIRequest
User (1) ── (N) Notification
User (1) ── (N) ActivityLog
User (1) ── (N) Session
User (1) ── (1) UsageLimit
Job (N) ── (N) Skill
Resume (N) ── (N) Skill
```

Key fields per entity (non-exhaustive, implementation should expand):

- **User**: id, email, passwordHash (nullable if OAuth-only), oauthProviders[], role (user/admin), createdAt, isEmailVerified
- **Profile**: userId, fullName, headline, location, visaStatus, desiredSalaryMin/Max, remotePreference
- **Resume**: userId, originalFileUrl, parsedJson (structured skills/experience/education/projects/languages), isPrimary
- **ResumeVersion**: resumeId, jobId (nullable), optimizedFileUrl, matchScore, generatedAt
- **Job**: source, sourceUrl, title, companyId, description, location, remoteType, salaryMin/Max, requiredSkills[], scrapedAt
- **Company**: name, domain, sizeRange, industry
- **Application**: userId, jobId, resumeVersionId, coverLetterId, status (enum: draft/submitted/viewed/interview/offer/rejected), appliedAt, source, screenshotUrl, timeline (JSON log)
- **CoverLetter**: userId, jobId, content, generatedAt
- **Subscription**: userId, plan (free/pro/premium), stripeSubscriptionId, status, renewsAt
- **Payment**: subscriptionId, amount, currency, status, invoiceUrl
- **AIRequest**: userId, feature (resume_optimize/cover_letter/interview_coach/...), provider, tokensUsed, cost, latencyMs, createdAt — **critical for cost monitoring and per-tier usage limits**
- **UsageLimit**: userId, period, applicationsUsed, aiRequestsUsed, resetAt

---

## 4. API Specification (Representative Endpoints)

Full OpenAPI/Swagger spec to be generated in implementation; representative surface below.

**Auth**

- `POST /auth/register` `POST /auth/login` `POST /auth/refresh` `POST /auth/logout`
- `GET /auth/google` `GET /auth/github` (OAuth callbacks)

**Profile & Resume**

- `GET/PUT /profile`
- `POST /resumes` (upload) → triggers async parse job
- `GET /resumes/:id` `DELETE /resumes/:id`
- `POST /resumes/:id/optimize` (body: jobDescription) → returns matchScore, missingKeywords, ResumeVersion

**Jobs**

- `GET /jobs/search?query=&location=&remote=&salaryMin=...`
- `GET /jobs/:id`

**Applications**

- `POST /applications` `GET /applications` `PATCH /applications/:id` `GET /applications/:id/timeline`

**AI**

- `POST /ai/cover-letter` `POST /ai/interview-questions` `POST /ai/career-advice`
- `POST /ai/recruiter-chat` (streamed via WebSocket)

**Billing**

- `POST /billing/checkout-session` `POST /billing/portal-session` `POST /billing/webhook` (Stripe)

**Admin**

- `GET /admin/users` `GET /admin/metrics` `GET /admin/ai-usage`

All endpoints require JWT auth except `/auth/*`; rate-limited per Section 9.

---

## 5. Chrome Extension Architecture

**Stack:** Manifest V3, React, TypeScript, Vite, Tailwind CSS.

**Components:**

- **Content Scripts** — injected per supported site (LinkedIn, Greenhouse, Lever, Ashby, Workday, SmartRecruiters, BambooHR, Indeed). Each site gets its own adapter module implementing a shared `JobPageAdapter` interface: `detectJobPosting()`, `extractJobDescription()`, `findFormFields()`, `fillField()`.
- **Background Service Worker** — owns auth token storage, message routing between content scripts and the backend API, and job queueing for autofill.
- **Popup** — quick actions: "Analyze this job," "Show Match Score," "Generate Cover Letter."
- **Options Page** — link account, manage default resume, autofill preferences (assistive vs. auto-submit **[ToS-Risk, default OFF]**).
- **Storage** — `chrome.storage.sync` for lightweight prefs; auth tokens in memory + secure background-worker-managed storage, never in `localStorage` of the page context.
- **Permissions** — request the minimum host permissions needed (per-site, not `<all_urls>`) to reduce Chrome Web Store review friction and user distrust.

**MVP behavior:** content script detects a job page → sends job description to backend for Match Score → shows an in-page overlay with score + "Autofill (review before submit)" button → autofill populates the form but **requires explicit user click to submit**.

---

## 6. Backend Architecture

**Stack:** Node.js, NestJS, Prisma ORM, PostgreSQL, Redis, BullMQ, WebSocket (Socket.io or native), REST (GraphQL optional/deferred).

### 6.1 Monolith-First, Not Microservices (explicit decision)

Per the backend-development skill's own architecture decision matrix — _"Monolith: small team, MVP, unclear domain boundaries → Low complexity, simple, fast development"_ vs. _"Microservices: large team, clear domains, need independent scaling → High complexity"_ — ApplyAI ships as a **single modular NestJS monolith** through MVP and V1. Reasons specific to this product:

- Team size at this stage doesn't justify per-service deployment overhead.
- Domain boundaries (resume parsing vs. matching vs. billing) aren't proven stable yet — splitting early risks a **distributed monolith** (the skill's #1 listed anti-pattern: services that all depend on each other anyway, but now with network latency).
- A shared PostgreSQL database with clean module boundaries (Section 2.3) gives ACID transactions where they matter (billing, usage limits) without distributed-transaction complexity (sagas, eventual consistency) that the product doesn't need yet.

**Re-evaluate microservices only when a concrete trigger appears**: e.g., the AI/job-processing workload needs to scale independently of the API layer at a rate that's cost-inefficient inside the monolith, or a second team needs to own a domain independently. Until then, splitting is premature.

### 6.2 Module Boundaries (NestJS modules)

- `AuthModule`, `UserModule`, `ProfileModule`
- `ResumeModule` (parsing, optimization)
- `JobModule` (search aggregation, ingestion)
- `ApplicationModule` (tracker, timeline)
- `AIModule` (provider abstraction, prompt templates, request logging)
- `BillingModule` (Stripe integration, usage limits)
- `NotificationModule`
- `AdminModule`

### 6.3 Queue Design (BullMQ) — with resilience requirements

- `resume-parse` — PDF/DOCX → structured JSON
- `resume-optimize` — resume + JD → match score + optimized version
- `job-ingest` — scheduled ingestion from partner APIs/feeds
- `autofill` — per-application fill jobs, with retry + screenshot capture
- `notification` — email/push dispatch

Every queue must be configured with: **exponential backoff retry** (not fixed-interval), a **max-attempt limit with dead-letter routing** (failed jobs go somewhere visible, not silently dropped), and **idempotency keys** so a retried job never double-charges an AI provider or double-submits an application. This satisfies both the HQSE async-discipline requirement (Section 2.3) and prevents the specific failure mode of "auto-apply submits twice because the retry didn't check state first."

### 6.4 Resilience Pattern for External Calls

Per the backend-architecture reference's circuit breaker pattern: AI provider calls and job-board partner API calls should go through a circuit breaker (e.g., `opossum` in Node), not a bare `fetch`. If OpenAI is down, the breaker opens after a defined failure threshold, requests fail fast with a fallback (e.g., "try Claude" per the multi-provider abstraction in Section 7.1) instead of every concurrent user request hanging on a timeout individually.

Every queue job writes to `ActivityLog` for observability and to support the "retry if failed" requirement.

---

## 7. AI Architecture

### 7.1 Provider Abstraction

```
interface AIProvider {
  complete(prompt: PromptTemplate, context: object): Promise<AIResponse>
}
```

Implementations: `OpenAIProvider`, `ClaudeProvider`, `GeminiProvider`, `OpenRouterProvider`, `LocalModelProvider`. Selection can be per-feature (e.g., long-form cover letters on one model, fast classification on a cheaper one) via config, not code changes.

### 7.2 Prompt Template System

Each AI feature has a versioned prompt template stored in the DB or a `prompts/` directory (`resume_optimize.v3.md`, `cover_letter.v2.md`, etc.) so prompts can be iterated without redeploys, and so `AIRequest` logs can record which template version produced which output (needed for quality regression debugging).

### 7.3 Core AI Features & Guardrails

- **Resume Parsing**: PDF/DOCX → structured JSON (skills, experience, education, projects, certifications, languages). Use a deterministic parser (e.g., layout-aware extraction) as a first pass, AI as a normalization/cleanup step — do not rely on AI alone for extraction accuracy.
- **Match Scoring**: resume JSON + job description → numeric score + missing-keyword list + weak-section flags. Should be explainable (show _why_ the score is what it is), not a black box.
- **Resume Optimization**: **must never invent experience, titles, or dates the user didn't provide.** Enforce this with a post-generation validation pass that diffs claimed facts against the source resume and flags/rejects fabrications.
- **Cover Letter Generation**: company + role + resume → personalized letter. Guardrail against generic filler via a template review process (see Section 10 tone constraints) and a "regenerate with more specificity" option.
- **Interview Coach**: question generation by category (behavioral/technical/system design/coding) + mock interview mode + structured feedback.
- **Career Advisor**: skill-gap analysis against target roles, learning path suggestions.
- **Recruiter Chat**: natural-language job search/filter interface (e.g., "remote React jobs in Europe paying over 80k, companies under 500 people") — parses into structured filter object, then queries the job index; does not itself decide to submit applications without confirmation.

### 7.4 Cost & Abuse Controls

- Per-tier monthly AI-request quotas enforced at the `AIModule` level before any provider call.
- Token/cost logging per request (`AIRequest.tokensUsed`, `.cost`) rolled up into admin dashboards for margin monitoring.
- Caching of identical (resume, job-description) match-score requests to avoid redundant spend.

---

## 8. Authentication & Security Flow

1. **Registration**: email/password (hashed with bcrypt/argon2) or OAuth (Google, GitHub).
2. **Login**: issues short-lived JWT access token (~15 min) + long-lived refresh token (httpOnly, secure cookie).
3. **Refresh**: `/auth/refresh` rotates refresh tokens (rotation + reuse detection to catch token theft).
4. **Extension auth**: extension obtains a token via the web dashboard OAuth-style handoff (never asks users to paste credentials into the extension directly).
5. **RBAC**: `user` / `org_admin` / `platform_admin` roles gate access to admin and team endpoints.
6. **Session tracking**: `Session` table allows users to view/revoke active sessions (extension + web + mobile-web).

---

## 9. Security & Compliance Checklist (OWASP Top 10, 2025 RC1 — per backend-development skill)

Mapped directly to current OWASP priorities, with the specific mitigation this project must implement — not a generic checklist:

| #   | Risk                                                                         | Mitigation for ApplyAI                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Broken Access Control (28% of vulnerabilities — the single largest category) | RBAC via NestJS Guards on every endpoint; deny-by-default; authorization enforced server-side only (never trust the extension's client-side state); log every access-control failure                                               |
| 2   | Cryptographic Failures                                                       | **Argon2id** for password hashing (not bcrypt — bcrypt is the 2025 legacy choice per the skill's own guidance); TLS 1.3 in transit; AES-256 for resume/PII at rest; `crypto.randomBytes()` for all tokens, never `Math.random()`   |
| 3   | Injection                                                                    | Parameterized queries via Prisma exclusively — no raw SQL string interpolation anywhere, including admin tooling; `class-validator` DTOs with allow-list field filtering on every mutating endpoint                                |
| 4   | Insecure Design                                                              | Threat-model each AI feature before building it — specifically: what happens if a user submits a job description containing a prompt injection aimed at the resume optimizer? (validate/sanitize AI inputs, don't just trust them) |
| 5   | Security Misconfiguration                                                    | `helmet` middleware with explicit CSP (`default-src 'self'`), HSTS (`max-age=31536000; includeSubDomains`), no default admin accounts, no verbose stack traces in production error responses                                       |
| 6   | Vulnerable/Supply Chain Components                                           | Dependabot + `npm audit`/SCA in CI on every PR; lockfile integrity checks — relevant given the extension pulls in a wide dependency surface for 8 site adapters                                                                    |
| 7   | Authentication Failures                                                      | Rate limit login at **10 attempts/15 min**; 12+ character password minimum with complexity; session timeout 15 min idle / 8 hr absolute; MFA mandatory for `platform_admin` and `org_admin` roles                                  |
| 8   | Software & Data Integrity Failures                                           | Signed/immutable CI builds; checksum verification on the Chrome extension bundle before Web Store submission                                                                                                                       |
| 9   | Logging & Monitoring Failures                                                | Centralized logging (auth events, access-control failures) separate from the developer-facing tracing system (Section 2.3); alerting on anomalous patterns (e.g., one account attempting 500 auto-fills/hour)                      |
| 10  | SSRF                                                                         | Allow-list validation on any URL ApplyAI fetches server-side (job postings, company career pages) — relevant because Section 11's job-ingest pipeline fetches external URLs by design                                              |

**Rate limit tiers (exact, not "reasonable limits"):**

- Public/unauthenticated endpoints: 100 requests / 15 min
- Authenticated API: 1000 requests / 15 min
- Auth endpoints (login/register): 10 attempts / 15 min
- Admin endpoints: 50 requests / 15 min

**Security headers (required on every response):**

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=()
```

**Beyond OWASP — product-specific compliance:**

- [ ] GDPR: data export endpoint, right-to-erasure flow, explicit consent for resume storage/AI processing, DPA-ready sub-processor list (OpenAI/Anthropic/etc.)
- [ ] CCPA: "do not sell my data" posture (default — no data sales)
- [ ] SOC 2-ready architecture: access logging, least-privilege IAM, change-management trail
- [ ] Secrets management via a vault, 90-day rotation policy (not `.env` in production)
- [ ] Chrome extension: minimum host permissions, hardened CSP, no remote code execution in content scripts

---

## 10. UI/UX Design System — Nova Design System v2.0

Per your nova-design-system skill, this is a **token-locked** system — the AI agent building the UI must use only the values below, not invent new ones ("Never invent new values" is a non-negotiable rule in the skill itself).

**Color tokens:**

| Role                              | Value                                         |
| --------------------------------- | --------------------------------------------- |
| Brand primary                     | `#FF6A00` (hover `#E95E00`, light `#FFF2E8`)  |
| Success / Warning / Danger / Info | `#22C55E` / `#F59E0B` / `#EF4444` / `#3B82F6` |
| Background primary / secondary    | `#FFFFFF` / `#F8FAFC`                         |
| Border default                    | `#E5E7EB`                                     |
| Text primary / secondary          | `#111827` / `#6B7280`                         |
| Dark mode background primary      | `#0F172A`                                     |

Use these directly for Match Score badges (success/warning/danger by score band), status pills in the Application Tracker, and the primary CTA ("Optimize Resume," "Generate Cover Letter") — all in `#FF6A00`.

**Typography:** Inter (sans), JetBrains Mono (code/technical fields). Scale: `h1` 32px/600, `h2` 24px/600, `body` 16px/400 (line-height 1.5, never below 14px), `caption` 12px. Minimum 4.5:1 contrast.

**Spacing:** 8-point grid exclusively — `4, 8, 12, 16, 24, 32, 40, 48...px`. No arbitrary spacing values in the dashboard or extension popup.

**Radius:** buttons/inputs `16px`, cards `24px`, modals `32px`, pills/badges (status, score) fully rounded.

**Shadows:** soft elevation only (`shadow-sm` → `shadow-floating`), never hard shadows. Hover states increase elevation by one level (e.g., the Application Tracker row card on hover).

**Layout:** mobile-first from 375px; dashboard sidebar 280px expanded / 72px collapsed, breakpoint at 1024px; 12-column grid, 24px gutter.

**Non-negotiables from the skill, carried into this build:**

- No visual clutter — if a dashboard element's purpose isn't obvious in one glance, remove or simplify it
- WCAG AA minimum on every screen, including the extension overlay (Match Score badge needs a screen-reader label, not just a colored number)
- Every interactive component (buttons, inputs, score badges) must ship all four states: default, hover, focus, disabled — plus error state on inputs
- Reference bar: this should read as Linear/Stripe/Vercel-quality density and restraint, not a generic AI-SaaS gradient template

**Tone constraint for AI-generated copy** (cover letters, chat responses): natural, specific, professional — explicitly avoid generic filler phrases ("I am a hardworking team player passionate about..."). Enforce via prompt design and a lightweight "genericness" scoring pass, not just instruction.

---

## 11. Roadmap — MVP → V1 → V2 → Enterprise

**MVP (Phase 0–1, ~8–10 weeks)**

- Auth, profile, resume upload/parsing
- Match Score against a pasted/scraped job description
- Resume Optimizer (assistive, human-reviewed output)
- Cover Letter Generator
- Manual job tracker (CRUD, no auto-apply)
- Chrome extension: detect job page, show Match Score, **assistive autofill only**
- Free + Pro tiers, Stripe billing

**V1 (Phase 2, ~+6–8 weeks)**

- Job search aggregation via **official partner APIs only** (Greenhouse, Lever, Ashby job board APIs) **— no LinkedIn/Indeed scraping**
- Dashboard analytics (application funnel, response rates)
- AI Interview Coach (text mode)
- Notification system (email + browser)

**V2 (Phase 3, ~+8–12 weeks)**

- AI Career Advisor
- Salary Prediction
- AI Recruiter Chat (natural-language filters)
- Interview Coach voice mode
- Reconsider auto-submit **only** for partner-API sources, with explicit per-application user confirmation retained (not fully unattended)

**Enterprise (Phase 4+)**

- Team/org accounts, seat management
- Admin analytics for career-services teams/universities
- SSO (SAML), advanced audit logging
- SOC 2 Type II audit

---

## 12. Development Plan (MVP — Week by Week)

**Estimation discipline (per HQSE skill):** the table below is a first-pass estimate — expect it to be wrong, and track estimate-vs-actual per week to recalibrate rather than silently absorbing overruns into later weeks. Budget an explicit **15% contingency** across the 10 weeks (not listed as its own row — distribute it) for the items teams reliably forget: onboarding, documentation, and the inevitable integration friction between the extension and backend auth handoff in Week 7. Dependencies are called out because per the HQSE dependency rule, component B should build against A's _interface_ (defined early) with a test stub, not wait for A's full implementation.

| Week | Focus                                                                                                 | Depends on                                                         |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | Repo scaffolding (NestJS + Next.js monorepo), CI/CD skeleton, DB schema v1, auth module               | —                                                                  |
| 2    | Resume upload + storage (S3), deterministic parsing pipeline, structured JSON output                  | Week 1 schema                                                      |
| 3    | AI provider abstraction layer, prompt template system, resume-optimize feature (backend)              | Week 2 parsed JSON shape                                           |
| 4    | Match Score algorithm + explainability UI, dashboard shell (Next.js), design tokens                   | Week 3 AI layer; Nova tokens (Section 10)                          |
| 5    | Cover Letter Generator (backend + UI), application tracker CRUD                                       | Week 3 AI layer                                                    |
| 6    | Chrome extension scaffolding (Manifest V3), site adapters for 2 pilot sites (e.g., Greenhouse, Lever) | Can start in parallel with Week 2–3 against a stubbed API contract |
| 7    | Extension autofill (assistive) + Match Score overlay, extension↔backend auth handoff                  | Week 6 scaffolding + Week 1 auth                                   |
| 8    | Stripe billing integration, usage limits enforcement, Free/Pro gating                                 | Week 1 schema (Subscription/UsageLimit tables)                     |
| 9    | Security hardening pass (Section 9 checklist), GDPR data-export/delete flows                          | All prior weeks — nothing ships to beta before this                |
| 10   | QA, bug bash, closed beta launch prep, analytics instrumentation                                      | All prior weeks                                                    |

---

## 13. Business Plan Summary

- **Wedge**: resume optimization + match scoring is the trust-building entry point (low ToS/legal risk, high perceived value) before any automation trust is required.
- **Moat over time**: proprietary dataset of (resume, job description, outcome) pairs improves match-scoring accuracy — a data-driven advantage competitors without real user-outcome data can't easily replicate.
- **Distribution**: Chrome Web Store SEO, university career-center partnerships, developer-community content (the target users are online and searchable).
- **Key risk**: platform ToS enforcement against automation (Section 0) — mitigate by leading with assistive, not autonomous, features and pursuing official API partnerships for job data.

---

## 14. Pricing Strategy Detail

- Anchor Pro price against comparable tools (validate current competitor pricing before finalizing numbers — this space moves quickly).
- Annual billing discount (commonly 15–25% in this category) to improve cash flow and reduce churn.
- Team/Enterprise: per-seat pricing with volume discounts, plus a custom tier for university career centers.
- Usage-based guardrails even within "unlimited" tiers (soft caps + fair-use policy) to protect AI margin.

---

## 15. Marketing Strategy (Outline)

- Content: "ATS score checker" and "resume vs. job description match" as free, no-signup lead magnets (SEO-friendly, low-friction top of funnel)
- Community: presence in developer/job-seeker communities (Reddit r/cscareerquestions, Discord servers, LinkedIn creator content) — with clear disclosure that ApplyAI is an assistive tool, not a spam-apply bot, to build trust rather than backlash
- Partnerships: bootcamps, university career centers, coding communities
- Referral program: extra AI credits for successful referrals

---

## 16. Technical Documentation Requirements

Maintain, from Week 1: architecture decision records (ADRs) for major choices (e.g., "why partner APIs over scraping"), an internal API reference (auto-generated from OpenAPI spec), a runbook for on-call (queue failures, AI provider outages, Stripe webhook failures), and a data dictionary for the schema in Section 3.

---

## 17. Deployment Guide (Outline)

- **Environments**: local (Docker Compose) → staging → production
- **Infra**: Docker images per service, Kubernetes-ready manifests (even if running on ECS/simple compute initially — keep the option open), NGINX/Cloudflare in front for TLS + caching + DDoS protection
- **Storage**: S3 for resumes/generated PDFs, CloudFront for static asset delivery
- **CI/CD**: GitHub Actions — lint/test/build on PR, deploy-on-merge to staging, manual promote to production
- **Migrations**: Prisma migrate, run as a gated CI step, never manually against production
- **Backups**: automated PostgreSQL backups (point-in-time recovery), S3 versioning on resume bucket

---

## 18. Security Checklist

See Section 9 — treat as the canonical checklist; do not duplicate/diverge.

---

## 19. Testing Strategy

**Pyramid (per backend-development skill):** 70% unit / 20% integration / 10% E2E. Contract tests wherever a module boundary is crossed (e.g., `AIModule` ↔ `ResumeModule`), even inside the monolith — this is what makes a later service split (Section 2.4) low-risk.

**Adversarial mindset (per HQSE skill):** every test suite should be written with the explicit goal of breaking the feature, not confirming it works. For each feature, test:

- The golden path (main-line use case)
- Boundary conditions: 0, 1, max−1, max, max+1 (e.g., a resume with 0 skills parsed, or 200+ skills)
- Invalid inputs: malformed PDFs, empty job descriptions, null fields, absurdly large uploads
- Error/failure paths: AI provider timeout mid-request, Stripe webhook arrives twice, queue job's target row was deleted before the job ran
- Concurrency: two devices editing the same resume simultaneously; an autofill job racing a user manually editing the same application

**Design for testability (binding on implementation, not optional):**

- Wrap all non-determinism — `Date.now()`, AI provider calls, `Math.random()` — behind interfaces so tests substitute deterministic fakes (this is the same encapsulation principle as Section 2.3, applied to tests specifically)
- Dependency injection throughout (NestJS gives this by default — don't bypass it with direct instantiation)
- Business logic (match scoring, fabrication detection) must be testable without a rendered UI or live network call

**Specific to this product:**

- **Unit tests**: match-score algorithm, fabrication-detection validator (Section 7.3), resume-optimize prompt-output parsing
- **Integration tests**: API endpoints against a test DB, full BullMQ job lifecycle including retry/dead-letter paths
- **E2E tests**: signup → upload resume → get match score → generate cover letter → track application, via Playwright
- **Extension tests**: per-site adapter tests against saved DOM fixtures — job sites change layout, so fixtures need a refresh schedule with alerting on adapter breakage
- **AI evaluation harness**: golden-set of (resume, job description) pairs with expected score ranges and human-graded output quality, run on every prompt-template change to catch regressions before they reach users

**Regression policy:** every bug fixed ships with an automated test that would have caught it. A bug that recurs is a failure of the regression suite, not just a coding mistake — treat it as such in retros.

---

## 20. Production Readiness Checklist

- [ ] All Section 9 security items complete
- [ ] Load testing on core API paths (auth, resume upload, match score)
- [ ] AI provider fallback tested (primary provider outage → automatic failover)
- [ ] Billing webhook failure handling tested (Stripe retries, idempotency keys)
- [ ] GDPR data export/delete flows tested end-to-end
- [ ] Monitoring/alerting live (error rates, queue depth, AI cost per day, Stripe webhook failures)
- [ ] Extension submitted and approved in Chrome Web Store
- [ ] Legal review sign-off on Section 0 risk posture and Terms of Service/Privacy Policy published
- [ ] Incident response runbook in place

---

## Appendix A — Suggested Execution Order for an AI Coding Agent

When handing this to an AI agent (e.g., Claude Code) to actually build, execute in this order rather than requesting the whole system at once:

1. Section 3 (schema) → generate `schema.prisma` and run first migration
2. Section 8 (auth) → implement auth module end-to-end with tests
3. Section 7.3 resume parsing → implement `ResumeModule` parse pipeline
4. Section 7.3 match scoring + Section 7.4 quotas → implement scoring + usage limits together (limits must exist before any AI feature ships)
5. Section 4 API endpoints for the above, with OpenAPI docs generated from code
6. Section 10 design tokens → Section 11 MVP dashboard screens
7. Section 5 extension scaffolding → 2 pilot site adapters only (do not build all 8 adapters before validating one end-to-end)
8. Section 9 security checklist pass before any closed beta invite goes out

Each step should ship with tests (Section 19) before moving to the next — do not let the agent parallelize sections that share schema or auth dependencies.

### Standing instructions for the agent at every step (per behavioral-guidelines skill)

Paste these alongside whichever section you hand the agent — they govern _how_ it should work, not just what to build:

- **Think before coding.** Before implementing a section, the agent should state its assumptions explicitly (e.g., "assuming `matchScore` is 0–100, not 0–1") and flag anything genuinely ambiguous rather than silently picking an interpretation. If two reasonable interpretations of a spec section exist, it should surface both, not choose silently.
- **Simplicity first.** No speculative abstraction. If Section 6 says "monolith," the agent should not pre-build microservice-style inter-module RPC scaffolding "for later" — that's exactly the over-engineering the backend-development skill warns against. Minimum code that satisfies the current section, nothing more.
- **Surgical changes.** Once code exists, later sections should touch only what they must. No drive-by refactors of unrelated modules, no reformatting adjacent code, no "while I'm here" cleanup — flag issues instead of fixing them silently outside scope.
- **Goal-driven execution.** Every section above should be converted into a verifiable success criterion before the agent starts (e.g., Section 3 → "migration runs clean, all FK constraints match the ERD" — not "schema looks done"). Weak criteria like "make auth work" invite scope drift; specific, testable criteria let the agent self-verify and loop without constant check-ins.
- **The test for every diff:** every changed line should trace directly back to the section being implemented. If it doesn't, it's out of scope for that step — even if it's a legitimate improvement, it belongs in its own explicitly-requested change.
