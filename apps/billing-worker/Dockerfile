# apps/billing-worker/Dockerfile
FROM oven/sh:1.1-alpine AS base
WORKDIR /usr/src/app

COPY package.json bun.lockb tsconfig.base.json ./
COPY apps/billing-worker/package.json ./apps/billing-worker/
COPY packages/config/package.json ./packages/config/
COPY packages/database/package.json ./packages/database/
COPY packages/queue/package.json ./packages/queue/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN bun install --frozen-lockfile

COPY packages/config ./packages/config
COPY packages/database ./packages/database
COPY packages/queue ./packages/queue
COPY packages/shared-types ./packages/shared-types
COPY apps/billing-worker ./apps/billing-worker

RUN bun run db:generate

CMD [ "bun", "run", "--cwd", "apps/billing-worker", "start" ]
