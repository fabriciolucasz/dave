// apps/dashboard/src/app/dashboard/[guildId]/paineis/actions.ts
'use server';

import { apiRequest } from '../../../../lib/api';
import { revalidatePath } from 'next/cache';

interface ActionResponse {
  success: boolean;
  error?: string;
}

/**
 * Desativa um container/painel pelo ID.
 */
export async function disableContainer(guildId: string, containerId: string): Promise<ActionResponse> {
  try {
    await apiRequest(`/guilds/${guildId}/containers/${containerId}/disable`, {
      method: 'POST',
    });

    revalidatePath(`/dashboard/${guildId}/paineis`);
    return { success: true };
  } catch (err: any) {
    console.error('[PaineisAction] Erro ao desativar painel:', err);
    return { success: false, error: err.message || 'Erro ao desativar o painel.' };
  }
}

/**
 * Cria ou atualiza as configurações de um painel.
 */
export async function saveContainer(
  guildId: string,
  channelId: string,
  type: string,
  payload: any,
  repostDelay?: number
): Promise<ActionResponse> {
  try {
    await apiRequest(`/guilds/${guildId}/containers`, {
      method: 'POST',
      body: JSON.stringify({
        channelId,
        type,
        payload,
        repostDelay: repostDelay ?? 30,
      }),
    });

    revalidatePath(`/dashboard/${guildId}/paineis`);
    return { success: true };
  } catch (err: any) {
    console.error('[PaineisAction] Erro ao salvar painel:', err);
    return { success: false, error: err.message || 'Erro ao salvar o painel.' };
  }
}

/**
 * Gera um preview do payload renderizado em formato do Discord.
 */
export async function getContainerPreview(guildId: string, payload: any) {
  try {
    const res = await apiRequest<{ rendered: any }>(`/guilds/${guildId}/containers/preview`, {
      method: 'POST',
      body: JSON.stringify({ payload }),
    });
    return { success: true, rendered: res.rendered };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao gerar o preview.' };
  }
}
