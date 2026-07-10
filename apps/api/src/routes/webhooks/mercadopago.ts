import { Hono } from 'hono';
import { env } from '@dave/config';
import { billingQueue, invalidateSubscriptionCache } from '@dave/queue';

// ---------------------------------------------------------------------------
// routes/webhooks/mercadopago.ts — recebe notificações do Mercado Pago
//
// Documentação MP: https://www.mercadopago.com.br/developers/pt/docs/notifications/webhooks
//
// O MP envia uma notificação com o ID do recurso (ex: preapproval ID).
// O billing-worker é quem consulta a API do MP para obter o status atual.
// Aqui apenas validamos, enfileiramos e retornamos 200 rapidamente.
//
// Validação da assinatura:
//   - Header: x-signature: ts=<timestamp>,v1=<hash>
//   - Payload assinado: id=<data.id>&request-id=<x-request-id>&ts=<timestamp>
//   - HMAC-SHA256 com MERCADO_PAGO_WEBHOOK_SECRET
// ---------------------------------------------------------------------------

export const mercadoPagoWebhookRoutes = new Hono();

mercadoPagoWebhookRoutes.post('/', async (c) => {
  const signature = c.req.header('x-signature');
  const requestId = c.req.header('x-request-id') ?? '';

  let body: {
    type: string;
    action?: string;
    data?: { id: string };
    user_id?: number;
    id?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Payload JSON inválido.' }, 400);
  }

  const dataId = body.data?.id ?? body.id ?? '';

  const webhookSecret = env.MERCADO_PAGO_WEBHOOK_SECRET;

  // Valida assinatura apenas quando o segredo está configurado
  if (webhookSecret && signature) {
    try {
      // Parse do header x-signature: "ts=<timestamp>,v1=<hash>"
      const sigParts: Record<string, string> = {};
      for (const part of signature.split(',')) {
        const eqIdx = part.indexOf('=');
        if (eqIdx > -1) {
          sigParts[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
        }
      }

      const ts = sigParts['ts'];
      const v1 = sigParts['v1'];

      if (!ts || !v1) {
        return c.json({ error: 'Header x-signature malformado.' }, 400);
      }

      // Rejeita notificações mais antigas que 5 minutos
      const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
      if (parseInt(ts, 10) < fiveMinutesAgo) {
        return c.json({ error: 'Notificação expirada.' }, 400);
      }

      // Payload assinado pelo MP: "id=<dataId>&request-id=<requestId>&ts=<ts>"
      const signedPayload = `id=${dataId}&request-id=${requestId}&ts=${ts}`;
      const encoder = new TextEncoder();

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );

      const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        encoder.encode(signedPayload),
      );

      const computedHash = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      if (computedHash !== v1) {
        console.warn('[Webhook MP] Assinatura inválida — requisição rejeitada.');
        return c.json({ error: 'Assinatura inválida.' }, 400);
      }
    } catch (err) {
      console.error('[Webhook MP] Erro ao verificar assinatura:', err);
      return c.json({ error: 'Erro ao verificar assinatura.' }, 500);
    }
  } else if (!webhookSecret) {
    if (env.NODE_ENV === 'production') {
      console.error('[Webhook MP] MERCADO_PAGO_WEBHOOK_SECRET não configurado em produção!');
      return c.json({ error: 'Webhook não configurado.' }, 500);
    }
    console.warn('[Webhook MP] MERCADO_PAGO_WEBHOOK_SECRET ausente — verificação desabilitada (dev only).');
  }

  console.log(`[Webhook MP] Notificação recebida: type=${body.type}, data.id=${dataId}`);

  // Só processa tipos relevantes para assinaturas
  // 'subscription_preapproval' = assinatura recorrente
  // 'payment' = pagamento avulso (para plans one-time, se houver)
  const relevantTypes = new Set([
    'subscription_preapproval',
    'subscription_authorized_payment',
    'payment',
  ]);

  if (!relevantTypes.has(body.type)) {
    console.log(`[Webhook MP] Tipo ignorado: ${body.type}`);
    return c.json({ received: true });
  }

  // Enfileira processamento assíncrono no billing-worker
  await billingQueue.add(
    `mp:${body.type}:${dataId}`,
    {
      type: 'webhook',
      provider: 'mercado_pago',
      webhookPayload: { ...body, requestId },
    },
    { priority: 1 },
  );

  // Tenta invalidar cache de subscription (metadata.guild_id deve ser definido ao criar a assinatura no MP)
  // O campo fica em preapproval.external_reference que usamos como guild_id (Discord ID)
  // A invalidação completa acontece no billing-worker após consultar a API do MP
  // Aqui fazemos uma pré-invalidação se possível
  if (dataId) {
    try {
      // Busca o external_reference associado a este preapproval via API MP
      // Não fazemos a chamada aqui para manter o webhook rápido — o worker fará isso
      // Se tiver o guildId no corpo (alguns eventos incluem), invalida agora
      const externalRef = (body as Record<string, unknown>)['external_reference'] as string | undefined;
      if (externalRef) {
        const guildId = externalRef.split(':')[0];
        if (guildId) {
          await invalidateSubscriptionCache(guildId);
        }
      }
    } catch (err) {
      console.warn('[Webhook MP] Erro ao pré-invalidar cache:', err);
    }
  }

  return c.json({ received: true });
});
