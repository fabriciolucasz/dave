# apps/api/Dockerfile
FROM oven/sh:1.1-alpine AS base
WORKDIR /usr/src/app

# Copia os arquivos de configuração do monorepo
COPY package.json bun.lockb tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/database/package.json ./packages/database/
COPY packages/shared-types/package.json ./packages/shared-types/

# Instala dependências
RUN bun install --frozen-lockfile

# Copia o código fonte necessário
COPY packages/config ./packages/config
COPY packages/database ./packages/database
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api

# Gera o Prisma Client
RUN bun run db:generate

# Roda
EXPOSE 3000
CMD [ "bun", "run", "--cwd", "apps/api", "start" ]
