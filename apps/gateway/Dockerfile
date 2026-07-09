# apps/gateway/Dockerfile
FROM oven/sh:1.1-alpine AS base
WORKDIR /usr/src/app

COPY package.json bun.lockb tsconfig.base.json ./
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/config/package.json ./packages/config/
COPY packages/queue/package.json ./packages/queue/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN bun install --frozen-lockfile

COPY packages/config ./packages/config
COPY packages/queue ./packages/queue
COPY packages/shared-types ./packages/shared-types
COPY apps/gateway ./apps/gateway

CMD [ "bun", "run", "--cwd", "apps/gateway", "start" ]
