// apps/dashboard/src/app/dashboard/[guildId]/central/actions.ts
'use server';

import { apiRequest } from '../../../../lib/api';
import { revalidatePath } from 'next/cache';

export async function saveLogConfig(guildId: string, channelId: string) {
  try {
    await apiRequest(`/guilds/${guildId}/log-configs`, {
      method: 'POST',
      body: JSON.stringify({ feature: 'CENTRAL', channelId }),
    });
    revalidatePath(`/dashboard/${guildId}/central`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao salvar logs' };
  }
}

export async function createIllegalAction(guildId: string, outcome: 'WON' | 'LOST', amount: number, participants: string[]) {
  try {
    const res = await apiRequest<any>(`/guilds/${guildId}/central/actions`, {
      method: 'POST',
      body: JSON.stringify({ outcome, amount, participants }),
    });
    revalidatePath(`/dashboard/${guildId}/central`);
    return { success: true, action: res.action };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao registrar ação' };
  }
}

export async function createWeeklyGoal(guildId: string, discordUserId: string, amountDelivered: number, weekStartDate: string) {
  try {
    const res = await apiRequest<any>(`/guilds/${guildId}/central/goals`, {
      method: 'POST',
      body: JSON.stringify({ discordUserId, amountDelivered, weekStartDate }),
    });
    revalidatePath(`/dashboard/${guildId}/central`);
    return { success: true, goal: res.goal };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao registrar meta' };
  }
}

export async function getRanking(guildId: string, period: 'week' | 'month' | 'all') {
  try {
    const res = await apiRequest<{ ranking: any[] }>(`/guilds/${guildId}/central/ranking?period=${period}`);
    return { success: true, ranking: res.ranking };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao obter ranking' };
  }
}
