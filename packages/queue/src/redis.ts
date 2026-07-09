import Redis from 'ioredis';
import { env } from '@dave/config';

// ---------------------------------------------------------------------------
// redis.ts — conexões Redis
//
// Dois exports:
//   1. `redis` — instância ioredis de uso geral (cache, pub/sub).
//   2. `createRedisConnection` — factory de opções de conexão para o BullMQ.
//
// O BullMQ gerencia seu próprio pool de conexões internamente.
// Passamos um objeto de opções (não uma instância Redis) para evitar
// conflito de versões entre nosso ioredis e o bundled pelo BullMQ.
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

/** Conexão Redis de uso geral — cache, pub/sub, consultas diretas. */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/**
 * Retorna opções de conexão Redis para o BullMQ.
 * Use ao instanciar Queue, Worker ou QueueEvents — o BullMQ cria a conexão
 * internamente com essas opções, evitando conflito de versões do ioredis.
 *
 * @example
 * const worker = new Worker('commands', handler, { connection: createRedisConnection() });
 */
export function createRedisConnection() {
  return parseRedisUrl(env.REDIS_URL);
}
