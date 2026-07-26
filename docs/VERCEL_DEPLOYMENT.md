# Vercel deployment

The Vercel project deploys the Next.js dashboard. The NestJS API is a separate
long-running service because it owns PostgreSQL connections, Redis rate limits,
BullMQ queues/workers, file parsing workers, and S3 uploads.

## 1. Deploy the dashboard

Import the Git repository into Vercel with these settings:

| Setting | Value |
|---|---|
| Root Directory | `apps/dashboard` |
| Framework Preset | Next.js |
| Node.js | 24.x |
| Install Command | Defined in `apps/dashboard/vercel.json` |
| Build Command | Defined in `apps/dashboard/vercel.json` |
| Output Directory | Leave empty (Next.js default) |

Vercel reads the root `pnpm-lock.yaml` and workspace through the commands in
`apps/dashboard/vercel.json`.

## 2. Configure the dashboard environment

Add this variable to Production, Preview, and Development as appropriate:

```text
NEXT_PUBLIC_API_URL=https://api.example.com
```

The value must be the public HTTPS origin of the deployed NestJS API, without a
trailing path. It is embedded in the browser bundle at build time, so redeploy
the dashboard after changing it.

The marketing homepage builds without the API, but registration, login,
dashboard data, billing, resume processing, and extension handoff require this
variable to point to a running API.

## 3. Deploy the API separately

Deploy `apps/api` with the repository's production Docker image to a
container-capable host. Provision:

- PostgreSQL with the Prisma migrations applied;
- Redis with TLS for shared rate limits and BullMQ;
- S3-compatible resume storage;
- HTTPS for the API domain;
- the production variables documented in `.env.example`.

At minimum, production validation requires database, auth, MFA encryption,
storage, AI-provider, Stripe, dashboard URL, and cost configuration. Set:

```text
DASHBOARD_URL=https://your-dashboard.vercel.app
CORS_ALLOWED_ORIGINS=https://your-dashboard.vercel.app
STRIPE_SUCCESS_URL=https://your-dashboard.vercel.app/billing?checkout=success
STRIPE_CANCEL_URL=https://your-dashboard.vercel.app/billing?checkout=cancelled
```

Update OAuth callback URLs to the public API domain. Never commit `.env`; add
secrets through the hosting providers.

## 4. Verify a deployment

Before pushing:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com \
  pnpm --filter @applyai/dashboard build
```

After deployment:

1. Open the homepage and check images, navigation, pricing expansion, and the
   company marquee.
2. Confirm `/register` and `/login` load.
3. Confirm the browser calls the HTTPS API origin, not `localhost`.
4. Complete registration, login, token refresh, logout, and one resume upload.
5. Check the API health endpoint before enabling production traffic.
