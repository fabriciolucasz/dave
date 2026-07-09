import { Hono } from 'hono';
import { prisma } from '@dave/database';
import { authMiddleware } from '../../middlewares/auth.js';

// ---------------------------------------------------------------------------
// routes/users/index.ts — Perfil de usuário autenticado
// ---------------------------------------------------------------------------

export const usersRoutes = new Hono();

usersRoutes.use('*', authMiddleware);

/** GET /users/me — Retorna o perfil detalhado do usuário logado */
usersRoutes.get('/me', async (c) => {
  const user = c.get('user');

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      discordId: true,
      username: true,
      globalName: true,
      avatarHash: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!dbUser) {
    return c.json({ error: 'Usuário não encontrado.' }, 404);
  }

  return c.json({ user: dbUser });
});
