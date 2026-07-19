// apps/dashboard/src/app/dashboard/[guildId]/cadastros/actions.ts
'use server';

import { apiRequest } from '../../../../lib/api';
import { revalidatePath } from 'next/cache';

export async function saveLogConfig(guildId: string, channelId: string) {
  try {
    await apiRequest(`/guilds/${guildId}/log-configs`, {
      method: 'POST',
      body: JSON.stringify({ feature: 'REGISTRATION', channelId }),
    });
    revalidatePath(`/dashboard/${guildId}/cadastros`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao salvar logs' };
  }
}

export async function reviewRegistration(guildId: string, regId: string, status: 'VERIFIED' | 'REJECTED') {
  try {
    const res = await apiRequest<any>(`/guilds/${guildId}/registrations/${regId}/review`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    revalidatePath(`/dashboard/${guildId}/cadastros`);
    return { success: true, registration: res.registration };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao revisar cadastro' };
  }
}
