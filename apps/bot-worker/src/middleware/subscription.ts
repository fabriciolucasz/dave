import { prisma } from '@dave/database';
import { redis, invalidateSubscriptionCache, subscriptionCacheConfig } from '@dave/queue';
import type { SubscriptionCheckResult } from '@dave/shared-types';

// ---------------------------------------------------------------------------
// middleware/subscription.ts — seção 9 do PLAN.md
//
// Verifica se a guild possui uma assinatura ativa antes de executar comandos
// premium. Resultado cacheado no Redis com TTL curto para não bater no
// Postgres a cada interação.
//
// Uso nos handlers:
//   const sub = await checkSubscription(guildId);
//   if (!sub.isActive) { ... return sem executar o comando premium ... }
// ---------------------------------------------------------------------------

// Re-exporta invalidateSubscriptionCache para uso interno do bot-worker
export { invalidateSubscriptionCache };

/**
 * Verifica a assinatura ativa da guild.
 * Resultado cacheado no Redis por {@link subscriptionCacheConfig.ttlSeconds} segundos.
 *
 * @param guildId - Discord ID da guild.
 * @returns Resultado do check com status, plano e data de expiração.
 */
export async function checkSubscription(guildId: string): Promise<SubscriptionCheckResult> {
  const cacheKey = `${subscriptionCacheConfig.prefix}${guildId}`;

  // Tenta o cache primeiro
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as SubscriptionCheckResult;
  }

  // Cache miss — consulta o banco
  const subscription = await prisma.subscription.findFirst({
    where: {
      guild: { discordId: guildId },
      status: { in: ['ACTIVE', 'TRIALING'] },
    },
    include: {
      plan: { select: { code: true } },
    },
    orderBy: { currentPeriodEnd: 'desc' },
  });

  const result: SubscriptionCheckResult = subscription
    ? {
        isActive: true,
        status: subscription.status,
        planCode: subscription.plan.code,
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      }
    : {
        isActive: false,
        status: 'EXPIRED',
        planCode: 'free',
        currentPeriodEnd: new Date(0).toISOString(),
      };

  // Armazena no cache
  await redis.setex(cacheKey, subscriptionCacheConfig.ttlSeconds, JSON.stringify(result));

  return result;
}
