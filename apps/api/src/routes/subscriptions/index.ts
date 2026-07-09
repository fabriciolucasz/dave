import { Hono } from 'hono';
import { prisma } from '@dave/database';
import { authMiddleware } from '../../middlewares/auth.js';
import { invalidateSubscriptionCache } from '@dave/queue';

// ---------------------------------------------------------------------------
// routes/subscriptions/index.ts — consulta e gestão de assinaturas
//
// Rotas:
//   GET  /subscriptions/plans/available      → catálogo público de planos
//   GET  /subscriptions/:guildId             → assinatura ativa da guild
//   GET  /subscriptions/:guildId/history     → histórico de assinaturas
//   POST /subscriptions/:guildId/cancel      → cancela a assinatura ativa
//
// Regra de cancelamento (seção 9.1 do PLAN.md):
//   Somente o criador da assinatura (Subscription.createdByUserId) ou
//   o dono do servidor (Guild.ownerUserId) pode cancelar.
//   Outros admins podem ver, mas não cancelar.
// ---------------------------------------------------------------------------

export const subscriptionsRoutes = new Hono();

subscriptionsRoutes.use('*', authMiddleware);

/** Lista todos os planos disponíveis (catálogo público). */
// IMPORTANTE: esta rota deve vir ANTES de /:guildId para não ser capturada pelo parâmetro dinâmico
subscriptionsRoutes.get('/plans/available', async (c) => {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { priceCents: 'asc' },
  });

  return c.json({ plans });
});

/** Assinatura ativa de uma guild. */
subscriptionsRoutes.get('/:guildId', async (c) => {
  const user = c.get('user');
  const discordGuildId = c.req.param('guildId');

  // Verifica se o usuário tem acesso à guild
  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: discordGuildId },
      isAdmin: true,
    },
    include: { guild: true },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      guildId: membership.guildId,
      status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
    },
    include: {
      plan: true,
      createdBy: {
        select: { id: true, username: true, discordId: true },
      },
    },
    orderBy: { currentPeriodEnd: 'desc' },
  });

  if (!subscription) {
    return c.json({ subscription: null, message: 'Nenhuma assinatura ativa.' });
  }

  return c.json({ subscription });
});

/** Histórico completo de assinaturas de uma guild. */
subscriptionsRoutes.get('/:guildId/history', async (c) => {
  const user = c.get('user');
  const discordGuildId = c.req.param('guildId');

  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: discordGuildId },
      isAdmin: true,
    },
    include: { guild: true },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  const subscriptions = await prisma.subscription.findMany({
    where: { guildId: membership.guildId },
    include: {
      plan: { select: { code: true, name: true, priceCents: true, currency: true } },
      createdBy: { select: { id: true, username: true, discordId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json({ subscriptions });
});

/**
 * Cancela a assinatura ativa de uma guild.
 *
 * Regra de autorização:
 *   - Somente o criador da assinatura OU o dono do servidor pode cancelar.
 *   - Outros admins têm acesso de leitura, mas não podem cancelar.
 *
 * Corpo opcional:
 *   { "reason": "string" } — motivo do cancelamento (registrado no AuditLog).
 *
 * Nota: Este endpoint cancela no nosso banco. Para cancelar no MP/Stripe,
 * chame a API do provedor antes (ou implemente aqui se quiser automatizar).
 */
subscriptionsRoutes.post('/:guildId/cancel', async (c) => {
  const user = c.get('user');
  const discordGuildId = c.req.param('guildId');

  // Verifica acesso à guild (qualquer admin pode ver, mas a trava de cancelamento vem abaixo)
  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: discordGuildId },
      isAdmin: true,
    },
    include: {
      guild: {
        select: { id: true, discordId: true, ownerUserId: true },
      },
    },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  // Busca assinatura ativa
  const subscription = await prisma.subscription.findFirst({
    where: {
      guildId: membership.guildId,
      status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
    },
    include: {
      plan: { select: { code: true, name: true } },
    },
    orderBy: { currentPeriodEnd: 'desc' },
  });

  if (!subscription) {
    return c.json({ error: 'Nenhuma assinatura ativa para cancelar.' }, 404);
  }

  // ---------------------------------------------------------------------------
  // Trava de cancelamento — seção 9.1 do PLAN.md
  // Somente o criador da assinatura ou o dono do servidor pode cancelar.
  // ---------------------------------------------------------------------------
  const isCreator = subscription.createdByUserId === user.id;
  const isGuildOwner = membership.guild.ownerUserId === user.id;

  if (!isCreator && !isGuildOwner) {
    return c.json(
      {
        error: 'Permissão negada.',
        message:
          'Somente quem criou a assinatura ou o dono do servidor pode cancelá-la.',
      },
      403,
    );
  }

  // Lê o motivo do corpo (opcional)
  let cancelReason: string | undefined;
  try {
    const body = await c.req.json() as { reason?: string };
    cancelReason = body.reason;
  } catch {
    // corpo vazio ou inválido é ok — reason é opcional
  }

  // Cancela a assinatura no banco
  const canceled = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'CANCELED',
      canceledAt: new Date(),
      ...(cancelReason !== undefined && { cancelReason }),
    },
    select: {
      id: true,
      status: true,
      canceledAt: true,
      cancelReason: true,
      plan: { select: { code: true, name: true } },
    },
  });

  // Registra no AuditLog
  await prisma.auditLog.create({
    data: {
      guildId: membership.guildId,
      userId: user.id,
      action: 'subscription.canceled',
      metadata: {
        subscriptionId: subscription.id,
        planCode: subscription.plan.code,
        canceledBy: user.discordId,
        reason: cancelReason ?? null,
      },
    },
  });

  // Invalida o cache de subscription imediatamente
  await invalidateSubscriptionCache(discordGuildId);

  return c.json({ subscription: canceled });
});
