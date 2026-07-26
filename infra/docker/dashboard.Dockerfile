FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc ./
COPY apps/dashboard/package.json ./apps/dashboard/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/design-tokens/package.json ./packages/design-tokens/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json

RUN pnpm install --frozen-lockfile

COPY apps/dashboard ./apps/dashboard
COPY packages ./packages

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @applyai/dashboard build

FROM node:24-alpine AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app

RUN addgroup --system --gid 1001 appgroup \
  && adduser --system --uid 1001 --ingroup appgroup appuser

COPY --from=builder --chown=appuser:appgroup /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

USER 1001
EXPOSE 3000

CMD ["node", "apps/dashboard/server.js"]
