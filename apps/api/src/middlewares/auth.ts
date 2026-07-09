import type { Context, Next } from 'hono';
import { prisma } from '@dave/database';

// ---------------------------------------------------------------------------
// middlewares/auth.ts — seção 8.2 do PLAN.md
//
// Valida a sessão do usuário nas rotas protegidas da API.
// A autenticação é via Discord OAuth2 — não existe senha própria.
//
// Estratégia de sessão (simples para bootstrap):
//   - O frontend envia o Discord access_token no header Authorization.
//   - A API valida chamando GET /users/@me na API do Discord.
//   - Em produção, considere JWT com refresh ou sessão serverside (Redis).
//
// O campo `c.set('user', ...)` injeta o usuário no contexto Hono,
// disponível para as rotas via `c.get('user')`.
// ---------------------------------------------------------------------------

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export interface AuthUser {
  id: string;         // UUID interno
  discordId: string;
  username: string;
  accessToken: string;
}

// Extende o tipo de variáveis do contexto Hono
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/**
 * Middleware de autenticação — deve ser usado em rotas protegidas.
 *
 * @example
 * app.use('/api/guilds/*', authMiddleware);
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authorization = c.req.header('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization header ausente ou inválido.' }, 401);
  }

  const accessToken = authorization.slice('Bearer '.length);

  // Valida o token na API do Discord
  let discordUser: { id: string; username: string };

  try {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return c.json({ error: 'Token Discord inválido ou expirado.' }, 401);
    }

    discordUser = (await response.json()) as { id: string; username: string };
  } catch {
    return c.json({ error: 'Erro ao validar token com o Discord.' }, 502);
  }

  // Busca ou cria o usuário no banco
  const user = await prisma.user.upsert({
    where: { discordId: discordUser.id },
    update: {
      username: discordUser.username,
      accessToken,
    },
    create: {
      discordId: discordUser.id,
      username: discordUser.username,
      accessToken,
    },
    select: { id: true, discordId: true, username: true },
  });

  c.set('user', { ...user, accessToken });

  await next();
}
