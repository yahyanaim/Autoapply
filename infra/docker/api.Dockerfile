FROM node:24-alpine AS builder

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/design-tokens/package.json ./packages/design-tokens/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages ./packages

RUN pnpm --filter @applyai/api prisma:generate
RUN pnpm --filter @applyai/api build
RUN pnpm --filter @applyai/api deploy --prod /prod/api \
  && cd /prod/api \
  && ./node_modules/.bin/prisma generate --schema src/database/prisma/schema.prisma

FROM node:24-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache openssl \
  && addgroup --system --gid 1001 appgroup \
  && adduser --system --uid 1001 --ingroup appgroup appuser \
  && mkdir -p /app/uploads \
  && chown appuser:appgroup /app/uploads

COPY --from=builder --chown=appuser:appgroup /prod/api ./

USER 1001
EXPOSE 3001

CMD ["node", "dist/main.js"]
