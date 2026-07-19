import { Hono } from 'hono';
import { prisma, type Prisma } from '@dave/database';
import { authMiddleware } from '../../middlewares/auth.js';
import { containerRepostQueue, redis } from '@dave/queue';
import { env } from '@dave/config';
import { buildContainerDiscordPayload, adjustItemQuantity, logFeatureEvent } from '@dave/discord-kit';

// ---------------------------------------------------------------------------
// routes/guilds/index.ts — CRUD de guilds e suas configurações
//
// Rotas:
//   GET  /guilds              → lista guilds onde o usuário é admin
//   GET  /guilds/:id          → detalhes de uma guild
//   GET  /guilds/:id/settings → configurações da guild
//   PATCH /guilds/:id/settings → atualiza configurações da guild
//
// Todas as rotas requerem autenticação e que o usuário seja admin da guild.
// ---------------------------------------------------------------------------

export const guildsRoutes = new Hono();

// Aplica autenticação a todas as rotas de guilds
guildsRoutes.use('*', authMiddleware);

/** Lista guilds onde o usuário autenticado é membro admin. */
guildsRoutes.get('/', async (c) => {
  const user = c.get('user');

  const memberships = await prisma.guildMember.findMany({
    where: {
      userId: user.id,
      isAdmin: true,
    },
    include: {
      guild: {
        select: {
          id: true,
          discordId: true,
          name: true,
          iconHash: true,
          isActive: true,
          botPresent: true,
        },
      },
    },
  });

  const guilds = memberships.map((m: typeof memberships[0]) => m.guild);

  return c.json({ guilds });
});

/** Detalhes de uma guild específica. */
guildsRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: guildId },
      isAdmin: true,
    },
    include: {
      guild: {
        include: {
          settings: true,
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'TRIALING'] } },
            include: { plan: true },
            orderBy: { currentPeriodEnd: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  return c.json({ guild: membership.guild });
});

/** Configurações de uma guild. */
guildsRoutes.get('/:id/settings', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: guildId },
      isAdmin: true,
    },
    include: { guild: { include: { settings: true } } },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  return c.json({ settings: membership.guild.settings });
});

/** Atualiza configurações de uma guild. */
guildsRoutes.patch('/:id/settings', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: guildId },
      isAdmin: true,
    },
    include: { guild: true },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  type SettingsBody = {
    locale?: string;
    embedColor?: string;
    logChannelId?: string;
    data?: Record<string, unknown>;
  };

  const body = (await c.req.json()) as SettingsBody;

  const settings = await prisma.guildSettings.upsert({
    where: { guildId: membership.guildId },
    update: {
      ...(body.locale !== undefined && { locale: body.locale }),
      embedColor: body.embedColor ?? null,
      logChannelId: body.logChannelId ?? null,
      ...(body.data !== undefined && { data: body.data as Prisma.InputJsonValue }),
    },
    create: {
      guildId: membership.guildId,
      locale: body.locale ?? 'pt-BR',
      embedColor: body.embedColor ?? null,
      logChannelId: body.logChannelId ?? null,
      data: body.data ? (body.data as Prisma.InputJsonValue) : {},
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      guildId: membership.guildId,
      userId: user.id,
      action: 'settings.updated',
      metadata: body as unknown as Prisma.InputJsonValue,
    },
  });

  return c.json({ settings });
});

/** Salva canal e roles configurados via setup. */
guildsRoutes.post('/:id/setup', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: guildId },
      isAdmin: true,
    },
    include: { guild: true },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  type SetupBody = {
    defaultChannelId?: string;
    allowedRoleIds?: string[];
  };

  let body: SetupBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Corpo inválido.' }, 400);
  }

  const settings = await prisma.guildSettings.upsert({
    where: { guildId: membership.guildId },
    update: {
      defaultChannelId: body.defaultChannelId ?? null,
      allowedRoleIds: body.allowedRoleIds ?? [],
    },
    create: {
      guildId: membership.guildId,
      defaultChannelId: body.defaultChannelId ?? null,
      allowedRoleIds: body.allowedRoleIds ?? [],
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      guildId: membership.guildId,
      userId: user.id,
      action: 'setup.dashboard_completed',
      metadata: body as any,
    },
  });

  return c.json({ settings });
});

/** Lista os containers persistentes da guild. */
guildsRoutes.get('/:id/containers', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: guildId },
      isAdmin: true,
    },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  const containers = await prisma.guildContainer.findMany({
    where: {
      guildId: membership.guildId,
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json({ containers });
});

/** Cria um novo container persistente via API (dashboard). */
guildsRoutes.post('/:id/containers', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: guildId },
      isAdmin: true,
    },
    include: { guild: true },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  type ContainerBody = {
    channelId: string;
    type: string;
    payload: Record<string, any>;
    repostDelay?: number;
  };

  let body: ContainerBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Corpo inválido.' }, 400);
  }

  if (!body.channelId || !body.type || !body.payload) {
    return c.json({ error: 'channelId, type e payload são obrigatórios.' }, 400);
  }

  // Valida o canal com a API do Discord (Seção 20.4)
  try {
    const channelRes = await fetch(`https://discord.com/api/v10/channels/${body.channelId}`, {
      headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    });
    if (!channelRes.ok) {
      return c.json({ error: 'Canal inválido ou não encontrado no Discord.' }, 400);
    }
    const channelData = (await channelRes.json()) as { type: number };
    // Permitir apenas tipo 0 (GuildText) e tipo 5 (GuildAnnouncement)
    if (channelData.type !== 0 && channelData.type !== 5) {
      return c.json({ error: 'O canal selecionado não aceita postagens (categorias ou canais inválidos).' }, 400);
    }
  } catch (err) {
    console.error('[API] Erro ao validar tipo do canal com Discord:', err);
  }

  // Desativa os anteriores do mesmo tipo e canal
  await prisma.guildContainer.updateMany({
    where: {
      guildId: membership.guildId,
      channelId: body.channelId,
      type: body.type,
      isActive: true,
    },
    data: { isActive: false },
  });

  // Salva no DB
  const container = await prisma.guildContainer.create({
    data: {
      guildId: membership.guildId,
      channelId: body.channelId,
      type: body.type,
      payload: body.payload,
      isActive: true,
      repostDelay: body.repostDelay ?? 30,
      messageId: null, // O worker irá postar a mensagem real
    },
  });

  // Registra no AuditLog
  await prisma.auditLog.create({
    data: {
      guildId: membership.guildId,
      userId: user.id,
      action: 'container.api_created',
      metadata: {
        containerId: container.id,
        type: body.type,
        channelId: body.channelId,
      },
    },
  });

  // Enfileira o job de repostagem imediato para enviar o container
  await containerRepostQueue.add(`repost:${container.id}`, {
    type: 'container_repost',
    containerId: container.id,
    guildId: membership.guild.discordId,
    channelId: body.channelId,
    delaySeconds: body.repostDelay ?? 30,
  });

  return c.json({ container });
});

/** Retorna os tipos de containers/painéis disponíveis. */
guildsRoutes.get('/:id/containers/types', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: guildId },
      isAdmin: true,
    },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  const types = [
    {
      type: 'welcome',
      name: 'Boas-vindas',
      icon: 'Hand',
      isSticky: false,
      description: 'Mensagem de boas-vindas exibida quando um membro entra no servidor.',
    },
    {
      type: 'ticket_panel',
      name: 'Abertura de ticket',
      icon: 'Ticket',
      isSticky: true,
      description: 'Painel com botão persistente para membros abrirem canais de suporte.',
    },
    {
      type: 'rules_panel',
      name: 'Regras do servidor',
      icon: 'ScrollText',
      isSticky: true,
      description: 'Mensagem fixa com os termos e regras de convivência da guilda.',
    },
    {
      type: 'verification_panel',
      name: 'Verificação',
      icon: 'ShieldCheck',
      isSticky: true,
      description: 'Painel para verificação inicial de novos membros.',
    },
    {
      type: 'announcement',
      name: 'Anúncio',
      icon: 'Megaphone',
      isSticky: false,
      description: 'Mensagem de anúncio disparada sob demanda pela staff.',
    },
    {
      type: 'inventory_panel',
      name: 'Baú (Inventário)',
      icon: 'Archive',
      isSticky: true,
      description: 'Painel com botão para membros consultarem e movimentarem o inventário compartilhado da guilda.',
    },
    {
      type: 'illegal_action_panel',
      name: 'Ações Ilegais',
      icon: 'Swords',
      isSticky: true,
      description: 'Painel com botão para registrar ações ilegais de RP, incluindo cidade, tipo, participantes e resultado.',
    },
    {
      type: 'ranking_panel',
      name: 'Ranking Semanal',
      icon: 'Trophy',
      isSticky: true,
      description: 'Painel com o ranking semanal de ações concluídas, atualizado automaticamente a cada repostagem.',
    },
    {
      type: 'weekly_goal_panel',
      name: 'Metas Semanais',
      icon: 'Target',
      isSticky: true,
      description: 'Painel com botão para membros registrarem a entrega de suas metas semanais.',
    },
    {
      type: 'registration_panel',
      name: 'Cadastro de Personagem',
      icon: 'UserCheck',
      isSticky: true,
      description: 'Painel com botão para membros realizarem o cadastro/verificação de personagem.',
    },
  ];

  return c.json({ types });
});

/** Retorna a representação do container/painel renderizado em formato Discord (Preview). */
guildsRoutes.post('/:id/containers/preview', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: guildId },
      isAdmin: true,
    },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  let body: { payload?: any };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Corpo inválido.' }, 400);
  }

  if (!body.payload) {
    return c.json({ error: 'payload é obrigatório.' }, 400);
  }

  const mockContext: Record<string, string> = {
    welcomeUser: '@Fulano',
    serverName: 'Nome do Servidor (Preview)',
    memberCount: '1,234',
    authorName: user.username || 'Administrador',
  };

  const rendered = buildContainerDiscordPayload(body.payload, mockContext);
  return c.json({ rendered });
});

/** Desativa um container persistente. */
guildsRoutes.post('/:id/containers/:containerId/disable', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const containerId = c.req.param('containerId');

  const membership = await prisma.guildMember.findFirst({
    where: {
      userId: user.id,
      guild: { discordId: guildId },
      isAdmin: true,
    },
  });

  if (!membership) {
    return c.json({ error: 'Guild não encontrada ou acesso negado.' }, 404);
  }

  const container = await prisma.guildContainer.findUnique({
    where: { id: containerId },
  });

  if (!container || container.guildId !== membership.guildId) {
    return c.json({ error: 'Container não encontrado.' }, 404);
  }

  // Desativa no banco
  await prisma.guildContainer.update({
    where: { id: containerId },
    data: { isActive: false },
  });

  // Tenta apagar a mensagem no Discord via REST (silenciosamente)
  if (container.messageId) {
    try {
      await fetch(`https://discord.com/api/v10/channels/${container.channelId}/messages/${container.messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
      });
    } catch (delErr) {
      console.warn(`[API Container Disable] Falha ao deletar mensagem ${container.messageId}:`, delErr);
    }
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      guildId: membership.guildId,
      userId: user.id,
      action: 'container.api_disabled',
      metadata: { containerId },
    },
  });

  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Endpoints de Configurações de Log por Feature (Seção 25.4)
// ---------------------------------------------------------------------------

guildsRoutes.get('/:id/log-configs', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const configs = await prisma.featureLogConfig.findMany({
    where: { guildId: membership.guildId },
  });
  return c.json({ configs });
});

guildsRoutes.post('/:id/log-configs', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { feature: string; channelId: string };
  if (!body.feature || !body.channelId) return c.json({ error: 'Campos feature e channelId são obrigatórios.' }, 400);

  const config = await prisma.featureLogConfig.upsert({
    where: {
      guildId_feature: {
        guildId: membership.guildId,
        feature: body.feature,
      },
    },
    update: { channelId: body.channelId },
    create: {
      guildId: membership.guildId,
      feature: body.feature,
      channelId: body.channelId,
    },
  });

  return c.json({ config });
});

// ---------------------------------------------------------------------------
// Endpoints de Inventário (Seção 22.4)
// ---------------------------------------------------------------------------

guildsRoutes.get('/:id/inventory/items', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const items = await prisma.inventoryItem.findMany({
    where: { guildId: membership.guildId },
    orderBy: { name: 'asc' },
  });
  return c.json({ items });
});

guildsRoutes.post('/:id/inventory/items', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { name: string; description?: string; iconUrl?: string; initialQuantity?: number };
  if (!body.name) return c.json({ error: 'Nome do item é obrigatório.' }, 400);

  const item = await prisma.inventoryItem.create({
    data: {
      guildId: membership.guildId,
      name: body.name,
      description: body.description || null,
      iconUrl: body.iconUrl || null,
      currentQuantity: body.initialQuantity || 0,
    },
  });

  if (body.initialQuantity && body.initialQuantity !== 0) {
    await prisma.inventoryMovement.create({
      data: {
        itemId: item.id,
        guildId: membership.guildId,
        quantityDelta: body.initialQuantity,
        resultingQuantity: body.initialQuantity,
        performedByUserId: user.discordId,
        reason: 'Saldo inicial do item',
      },
    });
  }

  return c.json({ item });
});

guildsRoutes.patch('/:id/inventory/items/:itemId', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const itemId = c.req.param('itemId');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { name?: string; description?: string; iconUrl?: string; isActive?: boolean };
  const data: Record<string, any> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.iconUrl !== undefined) data.iconUrl = body.iconUrl;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const updated = await prisma.inventoryItem.update({
    where: { id: itemId, guildId: membership.guildId },
    data,
  });
  return c.json({ item: updated });
});

guildsRoutes.post('/:id/inventory/items/:itemId/movements', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const itemId = c.req.param('itemId');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { quantityDelta: number; reason?: string };
  if (body.quantityDelta === undefined) return c.json({ error: 'quantityDelta é obrigatório.' }, 400);

  const result = await adjustItemQuantity(
    membership.guildId,
    itemId,
    body.quantityDelta,
    user.discordId,
    body.reason
  );

  return c.json(result);
});

guildsRoutes.get('/:id/inventory/items/:itemId/movements', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const itemId = c.req.param('itemId');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const movements = await prisma.inventoryMovement.findMany({
    where: { itemId, guildId: membership.guildId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return c.json({ movements });
});

// ---------------------------------------------------------------------------
// Endpoints de Central de Ações & Metas Semanais (Seção 23.5)
// ---------------------------------------------------------------------------

guildsRoutes.get('/:id/central/actions', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const actions = await prisma.illegalAction.findMany({
    where: { guildId: membership.guildId },
    include: { participants: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return c.json({ actions });
});

guildsRoutes.post('/:id/central/actions', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { outcome: 'WON' | 'LOST'; amount: number; participants: string[] };
  if (!body.outcome || body.amount === undefined || !body.participants || body.participants.length === 0) {
    return c.json({ error: 'outcome, amount e participants são obrigatórios.' }, 400);
  }

  const action = await prisma.$transaction(async (tx) => {
    const act = await tx.illegalAction.create({
      data: {
        guildId: membership.guildId,
        outcome: body.outcome,
        amount: body.amount,
        registeredByUserId: user.discordId,
      },
    });

    const share = Math.floor(body.amount / body.participants.length);

    await tx.illegalActionParticipant.createMany({
      data: body.participants.map((discordUserId) => ({
        actionId: act.id,
        discordUserId,
        shareAmount: share,
      })),
    });

    return act;
  });

  // Invalida cache de ranking no Redis
  const cacheKeyPattern = `ranking:${membership.guildId}:*`;
  try {
    const keys = await redis.keys(cacheKeyPattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('Falha ao expirar cache do Redis:', err);
  }

  // Dispara log
  const logPayload = {
    embeds: [
      {
        title: `⚔️ Nova Ação Registrada`,
        description: `Uma ação foi cadastrada pelo dashboard.`,
        color: body.outcome === 'WON' ? 0x248046 : 0xda373c,
        fields: [
          { name: 'Resultado', value: body.outcome === 'WON' ? 'SUCESSO (WON)' : 'FALHA (LOST)', inline: true },
          { name: 'Valor Total', value: `R$ ${body.amount.toLocaleString('pt-BR')}`, inline: true },
          { name: 'Participantes', value: body.participants.map(p => `<@${p}>`).join(', '), inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
  await logFeatureEvent(membership.guildId, 'CENTRAL', logPayload);

  return c.json({ action });
});

guildsRoutes.get('/:id/central/goals', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const submissions = await prisma.weeklyGoalSubmission.findMany({
    where: { guildId: membership.guildId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return c.json({ submissions });
});

guildsRoutes.post('/:id/central/goals', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { discordUserId: string; amountDelivered: number; weekStartDate: string };
  if (!body.discordUserId || body.amountDelivered === undefined || !body.weekStartDate) {
    return c.json({ error: 'discordUserId, amountDelivered e weekStartDate são obrigatórios.' }, 400);
  }

  const goal = await prisma.weeklyGoalSubmission.create({
    data: {
      guildId: membership.guildId,
      discordUserId: body.discordUserId,
      amountDelivered: body.amountDelivered,
      weekStartDate: new Date(body.weekStartDate),
      registeredByUserId: user.discordId,
    },
  });

  // Invalida cache de ranking no Redis
  const cacheKeyPattern = `ranking:${membership.guildId}:*`;
  try {
    const keys = await redis.keys(cacheKeyPattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('Falha ao expirar cache do Redis:', err);
  }

  // Dispara log
  const logPayload = {
    embeds: [
      {
        title: `💰 Entrega de Meta Semanal`,
        description: `Entrega registrada pelo dashboard.`,
        color: 0x5865f2,
        fields: [
          { name: 'Membro', value: `<@${body.discordUserId}>`, inline: true },
          { name: 'Valor Entregue', value: `R$ ${body.amountDelivered.toLocaleString('pt-BR')}`, inline: true },
          { name: 'Semana de Referência', value: new Date(body.weekStartDate).toLocaleDateString('pt-BR'), inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
  await logFeatureEvent(membership.guildId, 'CENTRAL', logPayload);

  return c.json({ goal });
});

guildsRoutes.get('/:id/central/ranking', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const period = c.req.query('period') || 'week';
  const cacheKey = `ranking:${membership.guildId}:${period}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return c.json({ ranking: JSON.parse(cached), cached: true });
    }
  } catch (err) {
    console.error('Falha ao obter cache do Redis:', err);
  }

  let dateLimit = new Date(0);
  const now = new Date();
  if (period === 'week') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    dateLimit = new Date(now.setDate(diff));
    dateLimit.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    dateLimit = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const participantsGroup = await prisma.illegalActionParticipant.groupBy({
    by: ['discordUserId'],
    where: {
      action: {
        guildId: membership.guildId,
        createdAt: { gte: dateLimit },
        outcome: 'WON',
      },
    },
    _sum: {
      shareAmount: true,
    },
  });

  const ranking = participantsGroup
    .map(p => ({
      discordUserId: p.discordUserId,
      totalAmount: p._sum.shareAmount || 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  try {
    await redis.set(cacheKey, JSON.stringify(ranking), 'EX', 300);
  } catch (err) {
    console.error('Falha ao definir cache do Redis:', err);
  }

  return c.json({ ranking, cached: false });
});

// ---------------------------------------------------------------------------
// Endpoints do Sistema de Cadastro de Personagem (Seção 24.4)
// ---------------------------------------------------------------------------

guildsRoutes.get('/:id/registrations', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const registrations = await prisma.characterRegistration.findMany({
    where: { guildId: membership.guildId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return c.json({ registrations });
});

guildsRoutes.post('/:id/registrations/:regId/review', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const regId = c.req.param('regId');
  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { status: 'VERIFIED' | 'REJECTED' };
  if (!body.status || !['VERIFIED', 'REJECTED'].includes(body.status)) {
    return c.json({ error: 'Status inválido. Deve ser VERIFIED ou REJECTED.' }, 400);
  }

  const registration = await prisma.characterRegistration.update({
    where: { id: regId, guildId: membership.guildId },
    data: { status: body.status },
  });

  // Envia log para o canal de log do cadastro
  const logPayload = {
    embeds: [
      {
        title: `📝 Cadastro Revisado Manualmente`,
        description: `O cadastro do personagem de <@${registration.discordUserId}> foi revisado pela Staff no dashboard.`,
        color: body.status === 'VERIFIED' ? 0x248046 : 0xda373c,
        fields: [
          { name: 'Personagem', value: registration.characterName, inline: true },
          { name: 'ID do RP', value: `#${registration.characterServerId}`, inline: true },
          { name: 'Status Final', value: body.status === 'VERIFIED' ? 'APROVADO (VERIFIED)' : 'REJEITADO (REJECTED)', inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
  await logFeatureEvent(membership.guildId, 'REGISTRATION', logPayload);

  return c.json({ registration });
});

// ===========================================================================
// Localizações de Inventário (Baú) — seção 26.1
// ===========================================================================

/** Lista localizações de inventário da guild. */
guildsRoutes.get('/:id/inventory/locations', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const locations = await prisma.inventoryLocation.findMany({
    where: { guildId: membership.guildId },
    include: { _count: { select: { items: true } } },
    orderBy: { name: 'asc' },
  });

  return c.json({ locations });
});

/** Cria uma nova localização de inventário. */
guildsRoutes.post('/:id/inventory/locations', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { name: string; allowedRoleIds?: string[] };
  if (!body.name?.trim()) {
    return c.json({ error: 'Campo name é obrigatório.' }, 400);
  }

  const location = await prisma.inventoryLocation.create({
    data: {
      guildId: membership.guildId,
      name: body.name.trim(),
      allowedRoleIds: body.allowedRoleIds ?? [],
    },
  });

  return c.json({ location }, 201);
});

/** Atualiza uma localização de inventário. */
guildsRoutes.patch('/:id/inventory/locations/:locationId', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const locationId = c.req.param('locationId');

  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { name?: string; allowedRoleIds?: string[]; isActive?: boolean };

  const location = await prisma.inventoryLocation.update({
    where: { id: locationId, guildId: membership.guildId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.allowedRoleIds !== undefined && { allowedRoleIds: body.allowedRoleIds }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });

  return c.json({ location });
});

/** Remove (desativa) uma localização de inventário. */
guildsRoutes.delete('/:id/inventory/locations/:locationId', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const locationId = c.req.param('locationId');

  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const location = await prisma.inventoryLocation.update({
    where: { id: locationId, guildId: membership.guildId },
    data: { isActive: false },
  });

  return c.json({ location });
});

// ===========================================================================
// Cidades de Ações Ilegais — seção 26.2
// ===========================================================================

/** Lista cidades de ações ilegais da guild. */
guildsRoutes.get('/:id/illegal-actions/cities', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const cities = await prisma.illegalActionCity.findMany({
    where: { guildId: membership.guildId },
    include: { _count: { select: { actionTypes: true, actions: true } } },
    orderBy: { name: 'asc' },
  });

  return c.json({ cities });
});

/** Cria uma nova cidade. */
guildsRoutes.post('/:id/illegal-actions/cities', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');

  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { name: string };
  if (!body.name?.trim()) {
    return c.json({ error: 'Campo name é obrigatório.' }, 400);
  }

  const city = await prisma.illegalActionCity.create({
    data: { guildId: membership.guildId, name: body.name.trim() },
  });

  return c.json({ city }, 201);
});

/** Atualiza uma cidade. */
guildsRoutes.patch('/:id/illegal-actions/cities/:cityId', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const cityId = c.req.param('cityId');

  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { name?: string; isActive?: boolean };

  const city = await prisma.illegalActionCity.update({
    where: { id: cityId, guildId: membership.guildId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });

  return c.json({ city });
});

// ===========================================================================
// Tipos de Ações Ilegais (vinculados à cidade) — seção 26.2
// ===========================================================================

/** Lista tipos de ação de uma cidade. */
guildsRoutes.get('/:id/illegal-actions/cities/:cityId/types', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const cityId = c.req.param('cityId');

  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const types = await prisma.illegalActionType.findMany({
    where: { cityId, guildId: membership.guildId },
    include: { _count: { select: { actions: true } } },
    orderBy: { name: 'asc' },
  });

  return c.json({ types });
});

/** Cria um novo tipo de ação para uma cidade. */
guildsRoutes.post('/:id/illegal-actions/cities/:cityId/types', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const cityId = c.req.param('cityId');

  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  // Verifica que a cidade pertence à guild
  const city = await prisma.illegalActionCity.findFirst({
    where: { id: cityId, guildId: membership.guildId },
  });
  if (!city) return c.json({ error: 'Cidade não encontrada.' }, 404);

  const body = await c.req.json() as { name: string; maxParticipants?: number };
  if (!body.name?.trim()) {
    return c.json({ error: 'Campo name é obrigatório.' }, 400);
  }

  const type = await prisma.illegalActionType.create({
    data: {
      cityId,
      guildId: membership.guildId,
      name: body.name.trim(),
      maxParticipants: body.maxParticipants ?? null,
    },
  });

  return c.json({ type }, 201);
});

/** Atualiza um tipo de ação. */
guildsRoutes.patch('/:id/illegal-actions/cities/:cityId/types/:typeId', async (c) => {
  const user = c.get('user');
  const guildId = c.req.param('id');
  const typeId = c.req.param('typeId');

  const membership = await prisma.guildMember.findFirst({
    where: { userId: user.id, guild: { discordId: guildId }, isAdmin: true },
  });
  if (!membership) return c.json({ error: 'Acesso negado.' }, 403);

  const body = await c.req.json() as { name?: string; maxParticipants?: number | null; isActive?: boolean };

  const type = await prisma.illegalActionType.update({
    where: { id: typeId, guildId: membership.guildId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.maxParticipants !== undefined && { maxParticipants: body.maxParticipants }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });

  return c.json({ type });
});
