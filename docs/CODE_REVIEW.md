# ApplyAI code-review status

Last reviewed: 2026-09-09

## Confirmed strengths

- The NestJS modular monolith has clear product ownership and is appropriate for
  the current stage.
- The candidate-controlled workflow is correctly represented: original CV
  evidence, truthful generation checks, review, approval, then optional form
  fill.
- AI usage and plan limits are enforced server-side with atomic reservations.
- MFA key isolation, login timing equalization, TOTP replay protection, admin
  user-list protection, and authentication audit logging have automated tests.
- GitHub Dependabot alerts and automated security fixes are enabled for the
  repository.

## Corrections in this change

| Finding | Correction | Coverage |
| --- | --- | --- |
| A stale public job could be reached directly after discovery filtered it | One shared freshness predicate is used by search, discovery, direct reads, AI actions, and application preparation | unit tests for the predicate and service queries |
| Arabic letters were removed during score normalization | Unicode-preserving normalization and Arabic aliases for core evidence categories | Arabic CV/job scoring test |
| Year-only dates inflated verified experience | Year-only ranges are calculated as conservative lower bounds | experience-threshold test |
| Production could fall back to localhost Redis | Production config requires an explicit Redis URL | configuration-schema tests |
| Vercel smoke test watched the wrong deployment environment | workflow targets `Production – autoapply` | workflow configuration review |

## Remaining release work outside source code

- Configure the required Dashboard/Nori canonical origins for production smoke
  verification. Product API remains explicitly deferred; its URL must stay
  empty until separately deployed and enabled. Follow the deployment-state
  contract in [CI_CD.md](CI_CD.md#vercel-release-verification); never substitute
  Nori for Product API. Repository variables are operator-managed.
- Branch protection is enabled for `main`: current pull requests need the
  quality, browser, dependency-review, and CodeQL checks. Because this is a
  single-maintainer repository, no second-person approval is required; force
  pushes are disabled and administrators are covered too.
- Run a production restore drill, configure alert routing, and validate each
  live job source's permission and data lifecycle.
- Separate workers and distributed source-refresh locking before running
  multiple API replicas.

## Verification standard

Every focused fix adds a failure-path test. Before release, run `pnpm check`,
confirm the pull-request checks pass and verify currently deployed components.
After separately authorizing Product API deployment, release its API/worker
from the tested commit and complete the synthetic candidate journey in
[CI_CD.md](CI_CD.md). A deferred Product API check is not a pass.
