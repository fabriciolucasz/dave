import { Hono } from 'hono';
import { prisma } from '@dave/database';
import { env } from '@dave/config';

// ---------------------------------------------------------------------------
// routes/auth/index.ts — seção 8.2 do PLAN.md (Discord OAuth2)
//
// Fluxo:
//   1. Frontend redireciona o usuário para o Discord (authorize URL).
//   2. Discord redireciona para GET /auth/callback?code=xxx.
//   3. API troca o code pelo access_token na API do Discord.
//   4. API cria/atualiza o User no banco.
//   5. API retorna o access_token ao frontend (ou seta cookie de sessão).
//
// Escopos necessários: identify, email, guilds
// ---------------------------------------------------------------------------

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';

export const authRoutes = new Hono();

/** Retorna a URL de autorização do Discord para o frontend redirecionar. */
authRoutes.get('/authorize', (c) => {
  const clientId = env.DISCORD_CLIENT_ID;
  const redirectUri = encodeURIComponent(`${env.API_BASE_URL}/auth/callback`);
  const scopes = encodeURIComponent('identify email guilds');

  const url = `${DISCORD_AUTHORIZE_URL}?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}`;

  return c.redirect(url);
});

/** Recebe o callback do Discord e troca o code pelo access_token. */
authRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');

  if (!code) {
    return c.json({ error: 'Parâmetro "code" ausente.' }, 400);
  }

  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const redirectUri = `${env.API_BASE_URL}/auth/callback`;

  // Troca o code pelo token
  const tokenResponse = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    return c.json({ error: 'Erro ao trocar code pelo token Discord.' }, 502);
  }

  type TokenData = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };

  const tokenData = (await tokenResponse.json()) as TokenData;

  // Busca dados do usuário
  const userResponse = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResponse.ok) {
    return c.json({ error: 'Erro ao buscar dados do usuário no Discord.' }, 502);
  }

  type DiscordUser = {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
    email?: string;
    discriminator?: string;
  };

  const discordUser = (await userResponse.json()) as DiscordUser;
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  // Cria ou atualiza o usuário no banco
  const user = await prisma.user.upsert({
    where: { discordId: discordUser.id },
    update: {
      username: discordUser.username,
      globalName: discordUser.global_name ?? null,
      avatarHash: discordUser.avatar ?? null,
      email: discordUser.email ?? null,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: expiresAt,
    },
    create: {
      discordId: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator ?? null,
      globalName: discordUser.global_name ?? null,
      avatarHash: discordUser.avatar ?? null,
      email: discordUser.email ?? null,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: expiresAt,
    },
    select: {
      id: true,
      discordId: true,
      username: true,
      globalName: true,
      avatarHash: true,
    },
  });

  // Sincroniza GuildMember: busca guilds do usuário no Discord e upserta no banco
  try {
    const guildsResponse = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (guildsResponse.ok) {
      type DiscordGuild = {
        id: string;
        name: string;
        icon?: string;
        owner: boolean;
        permissions: string; // bitfield como string (BigInt)
      };

      const ADMINISTRATOR = BigInt(0x8);
      const MANAGE_GUILD = BigInt(0x20);

      const discordGuilds = (await guildsResponse.json()) as DiscordGuild[];

      for (const dg of discordGuilds) {
        const permsBigInt = BigInt(dg.permissions);
        const isAdmin = dg.owner || !!(permsBigInt & ADMINISTRATOR) || !!(permsBigInt & MANAGE_GUILD);

        // Upserta a guild (caso ela ainda não exista no banco)
        const guild = await prisma.guild.upsert({
          where: { discordId: dg.id },
          update: { name: dg.name, iconHash: dg.icon ?? null },
          create: {
            discordId: dg.id,
            name: dg.name,
            iconHash: dg.icon ?? null,
            ownerDiscordId: dg.owner ? discordUser.id : 'unknown',
            ownerUserId: dg.owner ? user.id : null,
          },
        });

        // Upserta o membro (sincroniza permissões e isAdmin)
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
    }
  } catch (syncErr) {
    // Falha no sync de guilds não deve bloquear o login
    console.warn('[Auth] Erro ao sincronizar GuildMember:', syncErr);
  }

  return c.redirect(
    `${env.FRONTEND_URL}/auth/callback?token=${tokenData.access_token}&expiresAt=${expiresAt.toISOString()}`
  );
});

/** Retorna dados do usuário autenticado. */
authRoutes.get('/me', async (c) => {
  const authorization = c.req.header('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Não autenticado.' }, 401);
  }

  const accessToken = authorization.slice('Bearer '.length);

  const user = await prisma.user.findFirst({
    where: { accessToken },
    select: {
      id: true,
      discordId: true,
      username: true,
      globalName: true,
      avatarHash: true,
      createdAt: true,
    },
  });

  if (!user) {
    return c.json({ error: 'Usuário não encontrado.' }, 404);
  }

  return c.json({ user });
});
