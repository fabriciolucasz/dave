import { Hono } from 'hono';
import { prisma, type Prisma } from '@dave/database';
import { authMiddleware } from '../../middlewares/auth.js';
import { containerRepostQueue } from '@dave/queue';

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
