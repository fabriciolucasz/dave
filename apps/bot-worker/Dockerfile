# apps/bot-worker/Dockerfile
FROM oven/sh:1.1-alpine AS base
WORKDIR /usr/src/app

COPY package.json bun.lockb tsconfig.base.json ./
COPY apps/bot-worker/package.json ./apps/bot-worker/
COPY packages/config/package.json ./packages/config/
COPY packages/database/package.json ./packages/database/
COPY packages/discord-kit/package.json ./packages/discord-kit/
COPY packages/queue/package.json ./packages/queue/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN bun install --frozen-lockfile

COPY packages/config ./packages/config
COPY packages/database ./packages/database
COPY packages/discord-kit ./packages/discord-kit
COPY packages/queue ./packages/queue
COPY packages/shared-types ./packages/shared-types
COPY apps/bot-worker ./apps/bot-worker

RUN bun run db:generate

CMD [ "bun", "run", "--cwd", "apps/bot-worker", "start" ]
