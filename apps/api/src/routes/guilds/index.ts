import { Hono } from 'hono';
import { prisma, type Prisma } from '@dave/database';
import { authMiddleware } from '../../middlewares/auth.js';

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
