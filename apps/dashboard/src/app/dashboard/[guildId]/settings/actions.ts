// apps/dashboard/src/app/dashboard/[guildId]/settings/actions.ts
'use server';

import { apiRequest } from '../../../../lib/api';
import { revalidatePath } from 'next/cache';

interface SaveSettingsResult {
  success: boolean;
  error?: string;
}

/**
 * Salva as configurações de canal padrão e cargos autorizados no banco.
 * Revalida as páginas do dashboard da guilda correspondente.
 */
export async function saveGuildSettings(
  guildId: string,
  data: { defaultChannelId: string; allowedRoleIds: string[] }
): Promise<SaveSettingsResult> {
  try {
    await apiRequest(`/guilds/${guildId}/setup`, {
      method: 'POST',
      body: JSON.stringify({
        defaultChannelId: data.defaultChannelId,
        allowedRoleIds: data.allowedRoleIds,
      }),
    });

    revalidatePath(`/dashboard/${guildId}/settings`);
    revalidatePath(`/dashboard/${guildId}/overview`);

    return { success: true };
  } catch (err: any) {
    console.error('[SettingsAction] Falha ao salvar configurações:', err);
    return { success: false, error: err.message || 'Erro interno ao salvar configurações.' };
  }
}
