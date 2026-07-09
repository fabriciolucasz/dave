import { Hono } from 'hono';
import { prisma } from '@dave/database';
import { authMiddleware } from '../../middlewares/auth.js';
import { invalidateSubscriptionCache } from '@dave/queue';
import { env } from '@dave/config';

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
 * Inicia o fluxo de pagamento para uma guild, criando a preferência no Mercado Pago.
 *
 * Corpo:
 *   { "planId": "string" }
 */
subscriptionsRoutes.post('/:guildId/checkout', async (c) => {
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

  let body: { planId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const planId = body.planId;
  if (!planId) {
    return c.json({ error: 'Parâmetro planId é obrigatório.' }, 400);
  }

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });

  if (!plan || !plan.isActive) {
    return c.json({ error: 'Plano não encontrado ou inativo.' }, 404);
  }

  // Busca o e-mail do usuário no banco
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
  });
  const payerEmail = dbUser?.email || 'payer@example.com';

  // Cria a assinatura no Mercado Pago
  const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return c.json({ error: 'Configuração do gateway de pagamento pendente.' }, 500);
  }

  try {
    const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        back_url: `${env.API_BASE_URL}/subscriptions/callback`,
        reason: `Assinatura Dave - Plano ${plan.name}`,
        external_reference: `${membership.guild.discordId}:${plan.id}:${user.id}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: plan.priceCents / 100,
          currency_id: 'BRL',
        },
        payer_email: payerEmail,
        status: 'pending',
      }),
    });

    if (!mpResponse.ok) {
      const errDetails = await mpResponse.text();
      console.error('[API Checkout] Erro do Mercado Pago:', errDetails);
      throw new Error(`Mercado Pago retornou status ${mpResponse.status}`);
    }

    const mpData = (await mpResponse.json()) as { init_point: string };

    return c.json({ checkoutUrl: mpData.init_point });
  } catch (error: any) {
    console.error('[API Checkout] Erro ao criar checkout:', error);
    return c.json({ error: 'Erro ao gerar link de pagamento.' }, 500);
  }
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
