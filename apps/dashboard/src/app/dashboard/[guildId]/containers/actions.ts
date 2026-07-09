// apps/dashboard/src/app/dashboard/[guildId]/containers/actions.ts
'use server';

import { apiRequest } from '../../../../lib/api';
import { revalidatePath } from 'next/cache';

interface ActionResponse {
  success: boolean;
  error?: string;
}

/**
 * Desativa um container persistente pelo ID.
 * Revalida a rota de containers para atualizar a tabela na UI.
 */
export async function disableContainer(guildId: string, containerId: string): Promise<ActionResponse> {
  try {
    await apiRequest(`/guilds/${guildId}/containers/${containerId}/disable`, {
      method: 'POST',
    });

    revalidatePath(`/dashboard/${guildId}/containers`);
    return { success: true };
  } catch (err: any) {
    console.error('[ContainersAction] Erro ao desativar container:', err);
    return { success: false, error: err.message || 'Erro ao desativar o container.' };
  }
}
