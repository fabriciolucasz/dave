import { Queue } from 'bullmq';
import type { CommandJobData, InteractionJobData, BillingJobData } from '@dave/shared-types';
import { env } from '@dave/config';

// ---------------------------------------------------------------------------
// Nomes de filas — constantes para evitar typos em múltiplos lugares.
// ---------------------------------------------------------------------------

export const QUEUE_NAMES = {
  COMMANDS: 'commands',
  INTERACTIONS: 'interactions',
  BILLING: 'billing',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ---------------------------------------------------------------------------
// Configuração de conexão Redis para o BullMQ.
//
// O BullMQ gerencia suas próprias conexões ioredis internamente.
// Passamos a URL como string — cada Queue/Worker cria sua própria conexão.
// Isso evita conflito de versões entre o ioredis que instalamos e o que o
// BullMQ usa internamente (que pode diferir na minor version).
// ---------------------------------------------------------------------------

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    ...(parsed.password && { password: parsed.password }),
    ...(parsed.username && parsed.username !== '' && { username: parsed.username }),
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

function makeConnection() {
  return parseRedisUrl(env.REDIS_URL);
}

// ---------------------------------------------------------------------------
// Instâncias de Queue (produtores de jobs).
// ---------------------------------------------------------------------------

/** Fila de slash commands — publicada pelo gateway, consumida pelo bot-worker. */
export const commandsQueue = new Queue<CommandJobData>(QUEUE_NAMES.COMMANDS, {
  connection: makeConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/** Fila de interações de componentes (botões, modais, selects). */
export const interactionsQueue = new Queue<InteractionJobData>(QUEUE_NAMES.INTERACTIONS, {
  connection: makeConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/** Fila de billing — webhooks de pagamento e cron de expiração de assinaturas. */
export const billingQueue = new Queue<BillingJobData>(QUEUE_NAMES.BILLING, {
  connection: makeConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 5000 },
  },
});
