import { redis } from './redis.js';

// ---------------------------------------------------------------------------
// cache.ts — helpers de cache de subscription
//
// Isolado aqui (em vez de no bot-worker) para que tanto a API (rota de webhook)
// quanto o bot-worker possam invalidar o cache sem dependência cruzada entre apps.
// ---------------------------------------------------------------------------

const SUBSCRIPTION_CACHE_PREFIX = 'subscription:check:';
const SUBSCRIPTION_CACHE_TTL = 60; // segundos

/**
 * Invalida o cache de verificação de assinatura de uma guild.
 * Chame após qualquer mudança de assinatura (ativação, cancelamento, webhook).
 *
 * @param guildId - Discord ID ou ID interno da guild.
 */
export async function invalidateSubscriptionCache(guildId: string): Promise<void> {
  await redis.del(`${SUBSCRIPTION_CACHE_PREFIX}${guildId}`);
}

/**
 * Chave e TTL padrão do cache de subscription — exportados para o bot-worker
 * reutilizar ao setar o cache após consulta ao banco.
 */
export const subscriptionCacheConfig = {
  prefix: SUBSCRIPTION_CACHE_PREFIX,
  ttlSeconds: SUBSCRIPTION_CACHE_TTL,
} as const;
