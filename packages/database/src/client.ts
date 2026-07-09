import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Singleton via módulo (padrão descrito na seção 7.1 do PLAN.md).
//
// Módulos ES são cacheados pelo runtime — este arquivo só executa uma vez,
// não importa quantos lugares façam `import { prisma } from '@dave/database'`.
// Resultado: uma única conexão com o PostgreSQL por processo, sem cerimônia
// de getInstance() e sem risco de múltiplas conexões abertas acidentalmente.
// ---------------------------------------------------------------------------

export const prisma = new PrismaClient({
  log:
    process.env['NODE_ENV'] === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
});

// Re-exporta os tipos gerados pelo Prisma para que outros packages possam
// importar de '@dave/database' sem precisar depender de '@prisma/client' diretamente.
export * from '@prisma/client';
