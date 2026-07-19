import { Worker, type Job } from 'bullmq';
import { prisma } from '@dave/database';
import { createRedisConnection, billingQueue, QUEUE_NAMES, invalidateSubscriptionCache } from '@dave/queue';
import { env } from '@dave/config';
import type { BillingJobData } from '@dave/shared-types';

// ---------------------------------------------------------------------------
// apps/billing-worker/src/index.ts — seção 3.5 do PLAN.md
//
// Responsabilidades:
//   1. Processar webhooks do Mercado Pago (provedor primário) e Stripe (secundário).
//   2. Cron job diário para verificar assinaturas vencidas e aplicar bloqueio.
//   3. Cron semanal para sincronizar GuildMember (permissões do Discord).
//
// Este worker NÃO processa pagamentos diretamente — só reage a eventos
// do provedor e atualiza o banco de dados.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Handlers de webhook por provedor
// ---------------------------------------------------------------------------

/** Mapeia status do Mercado Pago (preapproval) para nosso enum. */
const MP_STATUS_MAP: Record<string, string> = {
  authorized: 'ACTIVE',
  pending: 'TRIALING',
  paused: 'PAST_DUE',
  cancelled: 'CANCELED',
};

/** Mapeia status do Stripe para nosso enum. */
const STRIPE_STATUS_MAP: Record<string, string> = {
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  unpaid: 'PAST_DUE',
  trialing: 'TRIALING',
  incomplete: 'PAST_DUE',
  incomplete_expired: 'EXPIRED',
  paused: 'PAST_DUE',
};

/**
 * Processa uma notificação do Mercado Pago.
 * Consulta a API do MP com o ID do recurso para obter o status atual.
 * Os tipos suportados são: subscription_preapproval, subscription_authorized_payment, payment.
 */
async function handleMercadoPagoWebhook(payload: unknown): Promise<void> {
  const MP_API_BASE = 'https://api.mercadopago.com';

  const notification = payload as {
    type: string;
    data?: { id: string };
    requestId?: string;
  };

  const resourceId = notification.data?.id;
  if (!resourceId) {
    console.warn('[BillingWorker MP] Notificação sem data.id — ignorando.');
    return;
  }

  console.log(`[BillingWorker MP] Processando: type=${notification.type}, id=${resourceId}`);

  const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('[BillingWorker MP] MERCADO_PAGO_ACCESS_TOKEN não configurado!');
    return;
  }

  // Determina o endpoint certo por tipo de evento
  let endpoint: string;
  if (notification.type === 'subscription_preapproval') {
    endpoint = `${MP_API_BASE}/preapproval/${resourceId}`;
  } else if (notification.type === 'subscription_authorized_payment') {
    endpoint = `${MP_API_BASE}/authorized_payments/${resourceId}`;
  } else if (notification.type === 'payment') {
    endpoint = `${MP_API_BASE}/v1/payments/${resourceId}`;
  } else {
    console.log(`[BillingWorker MP] Tipo não suportado: ${notification.type}`);
    return;
  }

  // Consulta a API do MP
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`[BillingWorker MP] Erro ao consultar API MP: ${res.status} ${res.statusText}`);
  }

  const resource = (await res.json()) as Record<string, unknown>;

  // Processa com base no tipo
  if (notification.type === 'subscription_preapproval') {
    const mpStatus = resource['status'] as string;
    const mappedStatus = MP_STATUS_MAP[mpStatus] ?? 'EXPIRED';
    const preapprovalId = resource['id'] as string;
    const externalReference = resource['external_reference'] as string | undefined;

    // next_payment_date e last_modified como period boundaries
    const nextPaymentDate = resource['next_payment_date']
      ? new Date(resource['next_payment_date'] as string)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // fallback: +30 dias

    const lastModified = resource['last_modified']
      ? new Date(resource['last_modified'] as string)
      : new Date();

    const canceledAt = mappedStatus === 'CANCELED' ? new Date() : null;

    // Encontra a assinatura existente ou cria uma nova
    const existing = await prisma.subscription.findUnique({
      where: { providerSubscriptionId: preapprovalId },
    });

    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          status: mappedStatus as never,
          currentPeriodStart: lastModified,
          currentPeriodEnd: nextPaymentDate,
          ...(canceledAt && { canceledAt }),
        },
      });
    } else if (externalReference) {
      const parts = externalReference.split(':');
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const discordGuildId = parts[0];
        const planId = parts[1];
        const userId = parts[2];

        // Encontra a Guild, User e Plan pelo ID
        const dbGuild = await prisma.guild.findUnique({ where: { discordId: discordGuildId } });
        const dbUser = await prisma.user.findUnique({ where: { id: userId } });
        const dbPlan = await prisma.plan.findUnique({ where: { id: planId } });

        if (dbGuild && dbUser && dbPlan) {
          await prisma.subscription.create({
            data: {
              guildId: dbGuild.id,
              planId: dbPlan.id,
              createdByUserId: dbUser.id,
              status: mappedStatus as never,
              currentPeriodStart: lastModified,
              currentPeriodEnd: nextPaymentDate,
              provider: 'MERCADO_PAGO',
              providerSubscriptionId: preapprovalId,
              ...(canceledAt && { canceledAt }),
            },
          });
          console.log(`[BillingWorker MP] Assinatura criada com sucesso para a guild ${discordGuildId}`);
        } else {
          console.error(
            `[BillingWorker MP] Falha ao criar assinatura: Guild (${!!dbGuild}), User (${!!dbUser}) ou Plan (${!!dbPlan}) não encontrado.`
          );
        }
      } else {
        console.warn(`[BillingWorker MP] external_reference com formato inválido: ${externalReference}`);
      }
    }

    // Invalida cache se tiver o external_reference (que deve conter o Discord Guild ID como primeira parte)
    let targetGuildId = '';
    if (externalReference) {
      const parts = externalReference.split(':');
      targetGuildId = parts[0] || '';
      if (targetGuildId) {
        await invalidateSubscriptionCache(targetGuildId);
      }
    }

    console.log(
      `[BillingWorker MP] Preapproval ${preapprovalId} → ${mappedStatus}` +
      (targetGuildId ? ` (guild: ${targetGuildId})` : ''),
    );
  } else if (notification.type === 'subscription_authorized_payment') {
    // Pagamento autorizado dentro de uma assinatura — garante que o status fique ACTIVE
    const preapprovalId = resource['preapproval_id'] as string | undefined;
    if (preapprovalId) {
      await prisma.subscription.updateMany({
        where: { providerSubscriptionId: preapprovalId },
        data: { status: 'ACTIVE' },
      });
      console.log(`[BillingWorker MP] Pagamento autorizado para preapproval ${preapprovalId} → ACTIVE`);
    }
  } else if (notification.type === 'payment') {
    const mpPaymentStatus = resource['status'] as string;
    const subscriptionId = resource['subscription_id'] as string | undefined;

    if (subscriptionId && mpPaymentStatus === 'approved') {
      await prisma.subscription.updateMany({
        where: { providerSubscriptionId: subscriptionId },
        data: { status: 'ACTIVE' },
      });
      console.log(`[BillingWorker MP] Pagamento aprovado para assinatura ${subscriptionId} → ACTIVE`);
    }
  }
}

/**
 * Processa um webhook do Stripe.
 * Atualiza o status da assinatura no banco com base no evento recebido.
 */
async function handleStripeWebhook(payload: unknown): Promise<void> {
  const event = payload as { type: string; data: { object: Record<string, unknown> } };

  console.log(`[BillingWorker Stripe] Processando evento: ${event.type}`);

  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const providerSubscriptionId = sub['id'] as string;
      const status = sub['status'] as string;
      const currentPeriodStart = new Date((sub['current_period_start'] as number) * 1000);
      const currentPeriodEnd = new Date((sub['current_period_end'] as number) * 1000);
      const canceledAt = sub['canceled_at']
        ? new Date((sub['canceled_at'] as number) * 1000)
        : null;

      const mappedStatus = STRIPE_STATUS_MAP[status] ?? 'EXPIRED';

      await prisma.subscription.updateMany({
        where: { providerSubscriptionId },
        data: {
          status: mappedStatus as never,
          currentPeriodStart,
          currentPeriodEnd,
          canceledAt,
        },
      });

      // Invalida cache de subscription via metadata.guild_id
      const metadata = sub['metadata'] as Record<string, string> | undefined;
      if (metadata?.['guild_id']) {
        await invalidateSubscriptionCache(metadata['guild_id']);
      }

      console.log(`[BillingWorker Stripe] ${providerSubscriptionId} → ${mappedStatus}`);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const providerSubscriptionId = invoice['subscription'] as string;

      await prisma.subscription.updateMany({
        where: { providerSubscriptionId },
        data: { status: 'ACTIVE' },
      });

      console.log(`[BillingWorker Stripe] Pagamento confirmado para assinatura ${providerSubscriptionId}.`);
      break;
    }

    default:
      console.log(`[BillingWorker Stripe] Evento ignorado: ${event.type}`);
  }
}

/**
 * Verifica assinaturas vencidas e aplica bloqueio/downgrade.
 * Executado diariamente via cron job BullMQ.
 */
async function handleExpiryCheck(guildId?: string): Promise<void> {
  const where = guildId
    ? { guildId, status: 'ACTIVE' as const, currentPeriodEnd: { lt: new Date() } }
    : { status: 'ACTIVE' as const, currentPeriodEnd: { lt: new Date() } };

  const expired = await prisma.subscription.findMany({
    where,
    include: { guild: { select: { id: true, discordId: true, name: true } } },
  });

  if (expired.length === 0) {
    console.log('[BillingWorker] Nenhuma assinatura vencida encontrada.');
    return;
  }

  console.log(`[BillingWorker] ${expired.length} assinatura(s) vencida(s) encontrada(s).`);

  for (const sub of expired) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'EXPIRED' },
    });

    await prisma.auditLog.create({
      data: {
        guildId: sub.guildId,
        action: 'subscription.expired',
        metadata: {
          subscriptionId: sub.id,
          expiredAt: sub.currentPeriodEnd.toISOString(),
        },
      },
    });

    console.log(
      `[BillingWorker] Assinatura ${sub.id} marcada como EXPIRED (guild: ${sub.guild.name})`,
    );
  }
}

/**
 * Sincroniza GuildMember para um usuário específico ou todos os usuários com token válido.
 * Chama GET /users/@me/guilds na API do Discord e atualiza isAdmin/permissions no banco.
 */
async function handleGuildSync(userId?: string): Promise<void> {
  const DISCORD_API_BASE = 'https://discord.com/api/v10';
  const ADMINISTRATOR = BigInt(0x8);
  const MANAGE_GUILD = BigInt(0x20);

  const where = userId
    ? { id: userId, accessToken: { not: null } }
    : { accessToken: { not: null } };

  const users = await prisma.user.findMany({
    where,
    select: { id: true, discordId: true, accessToken: true, tokenExpiresAt: true },
  });

  let synced = 0;
  let skipped = 0;

  for (const user of users) {
    if (!user.accessToken) { skipped++; continue; }

    // Pula tokens expirados (serão renovados no próximo login do usuário)
    if (user.tokenExpiresAt && user.tokenExpiresAt < new Date()) {
      skipped++;
      continue;
    }

    try {
      const res = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });

      if (!res.ok) {
        console.warn(`[BillingWorker] Falha ao buscar guilds do usuário ${user.id}: ${res.status}`);
        skipped++;
        continue;
      }

      type DiscordGuild = {
        id: string;
        name: string;
        icon?: string;
        owner: boolean;
        permissions: string;
      };

      const discordGuilds = (await res.json()) as DiscordGuild[];

      for (const dg of discordGuilds) {
        const permsBigInt = BigInt(dg.permissions);
        const isAdmin = dg.owner || !!(permsBigInt & ADMINISTRATOR) || !!(permsBigInt & MANAGE_GUILD);

        // Nunca escrever `botPresent` aqui: este sync roda periodicamente a partir
        // dos tokens salvos dos usuários e cria rows de guild "fantasma" para
        // qualquer servidor que o usuário administra no Discord, mesmo que o bot
        // nunca tenha sido adicionado — e mesmo em update não deve reverter um
        // valor real já gravado por handleGuildOnboarding.
        const guild = await prisma.guild.upsert({
          where: { discordId: dg.id },
          update: { name: dg.name, iconHash: dg.icon ?? null },
          create: {
            discordId: dg.id,
            name: dg.name,
            iconHash: dg.icon ?? null,
            ownerDiscordId: dg.owner ? user.discordId : 'unknown',
            ownerUserId: dg.owner ? user.id : null,
          },
        });

        await prisma.guildMember.upsert({
          where: { guildId_userId: { guildId: guild.id, userId: user.id } },
          update: {
            permissions: dg.permissions,
            isOwner: dg.owner,
            isAdmin,
            lastSyncedAt: new Date(),
          },
          create: {
            guildId: guild.id,
            userId: user.id,
            permissions: dg.permissions,
            isOwner: dg.owner,
            isAdmin,
          },
        });
      }

      synced++;
    } catch (err) {
      console.warn(`[BillingWorker] Erro ao sincronizar guilds do usuário ${user.id}:`, err);
      skipped++;
    }
  }

  console.log(`[BillingWorker] Sync de GuildMember concluído: ${synced} sincronizado(s), ${skipped} ignorado(s).`);
}

// ---------------------------------------------------------------------------
// Worker BullMQ
// ---------------------------------------------------------------------------

const billingWorker = new Worker<BillingJobData>(
  QUEUE_NAMES.BILLING,
  async (job) => {
    const { type, webhookPayload, guildId, userId } = job.data;

    switch (type) {
      case 'webhook': {
        const provider = job.data.provider ?? 'stripe'; // fallback para compat retroativa
        if (provider === 'mercado_pago') {
          await handleMercadoPagoWebhook(webhookPayload);
        } else {
          await handleStripeWebhook(webhookPayload);
        }
        break;
      }
      case 'expiry_check':
        await handleExpiryCheck(guildId);
        break;
      case 'guild_sync':
        await handleGuildSync(userId);
        break;
      default:
        console.warn(`[BillingWorker] Tipo de job desconhecido: ${type as string}`);
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
  },
);

// ---------------------------------------------------------------------------
// Cron job diário — verifica assinaturas vencidas (seção 9 do PLAN.md)
// ---------------------------------------------------------------------------

// Cron diário: verifica assinaturas vencidas (03:00 UTC)
await billingQueue.add(
  'daily-expiry-check',
  { type: 'expiry_check' },
  {
    repeat: { pattern: '0 3 * * *' },
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 50 },
  },
);

console.log('[BillingWorker] Cron job de expiração agendado (03:00 UTC diáriamente).');

// Cron semanal: sincroniza GuildMember de todos os usuários (domingos às 04:00 UTC)
await billingQueue.add(
  'weekly-guild-sync',
  { type: 'guild_sync' },
  {
    repeat: { pattern: '0 4 * * 0' },
    removeOnComplete: { count: 5 },
    removeOnFail: { count: 20 },
  },
);

console.log('[BillingWorker] Cron job de sync de GuildMember agendado (04:00 UTC aos domingos).');

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

billingWorker.on('completed', (job: Job<BillingJobData>) => {
  console.log(`[BillingWorker] Job ${job.id} (${job.data.type}) concluído.`);
});

billingWorker.on('failed', (job: Job<BillingJobData> | undefined, err: Error) => {
  console.error(`[BillingWorker] Job ${job?.id} falhou:`, err.message);
});

process.on('SIGTERM', async () => {
  console.log('[BillingWorker] SIGTERM recebido — fechando worker...');
  await billingWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[BillingWorker] SIGINT recebido — fechando worker...');
  await billingWorker.close();
  process.exit(0);
});

console.log('[BillingWorker] Worker iniciado. Aguardando jobs de billing...');
