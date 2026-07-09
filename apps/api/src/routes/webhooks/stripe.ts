import { Hono } from 'hono';
import { env } from '@dave/config';
import { billingQueue, invalidateSubscriptionCache } from '@dave/queue';

// ---------------------------------------------------------------------------
// routes/webhooks/stripe.ts — recebe webhooks do Stripe
//
// Esta rota é chamada diretamente pelo Stripe (sem autenticação de usuário).
// A segurança é garantida pela verificação da assinatura Stripe-Signature.
//
// Fluxo:
//   1. Stripe envia POST com o evento assinado.
//   2. Validamos a assinatura com STRIPE_WEBHOOK_SECRET via Web Crypto API.
//   3. Enfileiramos o evento bruto no billingQueue para processamento assíncrono.
//   4. Invalidamos o cache de subscription da guild afetada (se identificável).
//   5. Retornamos 200 imediatamente — Stripe não espera pelo processamento.
// ---------------------------------------------------------------------------

export const stripeWebhookRoutes = new Hono();

stripeWebhookRoutes.post('/', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('Stripe-Signature');

  if (!signature) {
    return c.json({ error: 'Header Stripe-Signature ausente.' }, 400);
  }

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (webhookSecret) {
    try {
      // Parse do header: "t=timestamp,v1=hash1,v1=hash2,..."
      const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
        const eqIdx = part.indexOf('=');
        if (eqIdx > -1) {
          const key = part.slice(0, eqIdx);
          const val = part.slice(eqIdx + 1);
          acc[key] = val;
        }
        return acc;
      }, {});

      const timestamp = parts['t'];
      if (!timestamp) {
        return c.json({ error: 'Assinatura Stripe inválida: timestamp ausente.' }, 400);
      }

      // Rejeita webhooks mais antigos que 5 minutos (proteção contra replay)
      const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
      if (parseInt(timestamp, 10) < fiveMinutesAgo) {
        return c.json({ error: 'Webhook expirado (tolerância: 5 minutos).' }, 400);
      }

      // Computa a assinatura esperada usando Web Crypto API (disponível no Bun)
      const signedPayload = `${timestamp}.${rawBody}`;
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

      const computedSig = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      // O Stripe pode enviar múltiplos v1 — basta um bater
      const v1Sigs = signature
        .split(',')
        .filter((p) => p.startsWith('v1='))
        .map((p) => p.slice(3));

      const isValid = v1Sigs.some((sig) => sig === computedSig);

      if (!isValid) {
        console.warn('[Webhook] Assinatura Stripe inválida — requisição rejeitada.');
        return c.json({ error: 'Assinatura Stripe inválida.' }, 400);
      }
    } catch (err) {
      console.error('[Webhook] Erro ao verificar assinatura Stripe:', err);
      return c.json({ error: 'Erro ao verificar assinatura.' }, 500);
    }
  } else {
    // Sem segredo configurado em produção = erro de configuração
    if (env.NODE_ENV === 'production') {
      console.error('[Webhook] STRIPE_WEBHOOK_SECRET não configurado em produção!');
      return c.json({ error: 'Webhook não configurado.' }, 500);
    }
    console.warn(
      '[Webhook] STRIPE_WEBHOOK_SECRET ausente — verificação de assinatura desabilitada (dev only).',
    );
  }

  // Parse do payload
  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return c.json({ error: 'Payload JSON inválido.' }, 400);
  }

  console.log(`[Webhook] Evento Stripe recebido: ${event.type}`);

  // Enfileira o processamento no billing-worker
  await billingQueue.add(
    `stripe:${event.type}`,
    { type: 'webhook', webhookPayload: event },
    { priority: 1 },
  );

  // Invalida o cache de subscription da guild afetada (se identificável via metadata)
  // Convenção: ao criar a assinatura no Stripe, definir metadata.guild_id = discord guild id
  const obj = event.data.object;
  const metadataGuildId = (obj['metadata'] as Record<string, string> | undefined)?.['guild_id'];
  if (metadataGuildId) {
    try {
      await invalidateSubscriptionCache(metadataGuildId);
    } catch (err) {
      console.warn('[Webhook] Erro ao invalidar cache de subscription:', err);
    }
  }

  return c.json({ received: true });
});
