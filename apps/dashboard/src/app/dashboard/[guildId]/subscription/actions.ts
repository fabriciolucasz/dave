// apps/dashboard/src/app/dashboard/[guildId]/subscription/actions.ts
'use server';

import { apiRequest } from '../../../../lib/api';
import { revalidatePath } from 'next/cache';

interface ActionResponse {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
}

/**
 * Cria uma sessão de checkout para assinatura do bot no Mercado Pago.
 */
export async function createCheckoutSession(guildId: string, planId: string): Promise<ActionResponse> {
  try {
    const res = await apiRequest<{ checkoutUrl: string }>(`/subscriptions/${guildId}/checkout`, {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });

    return { success: true, checkoutUrl: res.checkoutUrl };
  } catch (err: any) {
    console.error('[SubscriptionAction] Erro ao criar checkout:', err);
    return { success: false, error: err.message || 'Erro ao gerar link de pagamento.' };
  }
}

/**
 * Cancela a assinatura ativa da guilda.
 */
export async function cancelActiveSubscription(guildId: string): Promise<ActionResponse> {
  try {
    await apiRequest(`/subscriptions/${guildId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Cancelado pelo usuário no painel do dashboard.' }),
    });

    revalidatePath(`/dashboard/${guildId}/subscription`);
    revalidatePath(`/dashboard/${guildId}/overview`);

    return { success: true };
  } catch (err: any) {
    console.error('[SubscriptionAction] Erro ao cancelar assinatura:', err);
    return { success: false, error: err.message || 'Erro ao cancelar assinatura.' };
  }
}
