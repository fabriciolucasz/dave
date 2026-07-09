import type { Context, Next } from 'hono';
import { prisma } from '@dave/database';

// ---------------------------------------------------------------------------
// middlewares/subscription.ts — Bloqueio de rotas premium
//
// Verifica se a guild informada no parâmetro possui assinatura ativa
// antes de permitir o acesso às rotas sensíveis/premium da API.
// ---------------------------------------------------------------------------

export async function checkSubscriptionMiddleware(c: Context, next: Next): Promise<Response | void> {
  const guildId = c.req.param('id') || c.req.param('guildId');

  if (!guildId) {
    return c.json({ error: 'ID da guild não identificado no caminho da rota.' }, 400);
  }

  // Busca a guild pelo discordId ou pelo uuid interno
  const guild = await prisma.guild.findFirst({
    where: {
      OR: [
        { id: guildId },
        { discordId: guildId },
      ],
    },
  });

  if (!guild) {
    return c.json({ error: 'Servidor não encontrado ou não registrado.' }, 404);
  }

  // Verifica se existe uma assinatura ativa (ACTIVE ou TRIALING)
  const subscription = await prisma.subscription.findFirst({
    where: {
      guildId: guild.id,
      status: { in: ['ACTIVE', 'TRIALING'] },
    },
  });

  if (!subscription) {
    return c.json(
      {
        error: 'Assinatura necessária',
        message: 'Este recurso requer uma assinatura ativa para este servidor.',
        requiresSubscription: true,
      },
      403
    );
  }

  await next();
}
