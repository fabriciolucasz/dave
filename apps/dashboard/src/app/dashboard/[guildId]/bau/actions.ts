// apps/dashboard/src/app/dashboard/[guildId]/bau/actions.ts
'use server';

import { apiRequest } from '../../../../lib/api';
import { revalidatePath } from 'next/cache';

export async function saveLogConfig(guildId: string, channelId: string) {
  try {
    await apiRequest(`/guilds/${guildId}/log-configs`, {
      method: 'POST',
      body: JSON.stringify({ feature: 'INVENTORY', channelId }),
    });
    revalidatePath(`/dashboard/${guildId}/bau`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao salvar logs' };
  }
}

export async function createInventoryItem(guildId: string, name: string, description: string, initialQuantity: number) {
  try {
    const res = await apiRequest<any>(`/guilds/${guildId}/inventory/items`, {
      method: 'POST',
      body: JSON.stringify({ name, description, initialQuantity }),
    });
    revalidatePath(`/dashboard/${guildId}/bau`);
    return { success: true, item: res.item };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao criar item' };
  }
}

export async function adjustItemQuantity(guildId: string, itemId: string, quantityDelta: number, reason: string) {
  try {
    const res = await apiRequest<any>(`/guilds/${guildId}/inventory/items/${itemId}/movements`, {
      method: 'POST',
      body: JSON.stringify({ quantityDelta, reason }),
    });
    revalidatePath(`/dashboard/${guildId}/bau`);
    return { success: true, item: res.item, movement: res.movement };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao ajustar quantidade' };
  }
}

export async function getInventoryMovements(guildId: string, itemId: string) {
  try {
    const res = await apiRequest<{ movements: any[] }>(`/guilds/${guildId}/inventory/items/${itemId}/movements`);
    return { success: true, movements: res.movements };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao carregar movimentações' };
  }
}
