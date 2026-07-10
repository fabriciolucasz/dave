import { Hono } from 'hono';
import { env } from '@dave/config';
import { prisma } from '@dave/database';
import { authRoutes } from './routes/auth/index.js';
import { guildsRoutes } from './routes/guilds/index.js';
import { subscriptionsRoutes } from './routes/subscriptions/index.js';
import { stripeWebhookRoutes } from './routes/webhooks/stripe.js';
import { mercadoPagoWebhookRoutes } from './routes/webhooks/mercadopago.js';
import { usersRoutes } from './routes/users/index.js';

// ---------------------------------------------------------------------------
// apps/api/src/index.ts — entry point da REST API
//
// Framework: Hono (leve, roda nativamente em Bun)
// Seção 3.4 do PLAN.md: serviço HTTP separado, consumido pelo dashboard.
// ---------------------------------------------------------------------------

const app = new Hono();

// ---------------------------------------------------------------------------
// Middleware global
// ---------------------------------------------------------------------------

// Loga todas as requisições em desenvolvimento
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  if (env.NODE_ENV === 'development') {
    console.log(`[API] ${c.req.method} ${c.req.path} → ${c.res.status} (${duration}ms)`);
  }
});

// ---------------------------------------------------------------------------
// Health check (sem autenticação — usado pelo Docker healthcheck e load balancer)
// ---------------------------------------------------------------------------

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Rotas da API v1
// ---------------------------------------------------------------------------

app.get('/plans', async (c) => {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { priceCents: 'asc' },
  });
  return c.json({ plans });
});

app.route('/auth', authRoutes);
app.route('/guilds', guildsRoutes);
app.route('/subscriptions', subscriptionsRoutes);
app.route('/users', usersRoutes);
// Webhooks não usam autenticação de usuário — segurança via assinatura do provedor
app.route('/webhooks/mercadopago', mercadoPagoWebhookRoutes);
app.route('/webhooks/stripe', stripeWebhookRoutes);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

app.notFound((c) => {
  return c.json({ error: `Rota ${c.req.path} não encontrada.` }, 404);
});

// ---------------------------------------------------------------------------
// Error handler global
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  console.error('[API] Erro não tratado:', err);
  return c.json({ error: 'Erro interno do servidor.' }, 500);
});

// ---------------------------------------------------------------------------
// Inicia o servidor
// ---------------------------------------------------------------------------

const port = env.API_PORT;

export default {
  port,
  fetch: app.fetch,
};

console.log(`[API] Servidor iniciado na porta ${port}`);
