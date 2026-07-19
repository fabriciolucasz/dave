// apps/dashboard/src/app/dashboard/[guildId]/bau/page.tsx
import { apiRequest } from '../../../../lib/api';
import { env } from '@dave/config';
import { InventoryManager } from './InventoryManager';

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  // 1. Busca itens ativos do inventário
  let initialItems: any[] = [];
  try {
    const res = await apiRequest<{ items: any[] }>(`/guilds/${guildId}/inventory/items`);
    initialItems = res.items;
  } catch (error) {
    console.error('[InventoryPage] Erro ao carregar itens:', error);
  }

  // 2. Busca configurações de log
  let logConfigs: any[] = [];
  try {
    const res = await apiRequest<{ configs: any[] }>(`/guilds/${guildId}/log-configs`);
    logConfigs = res.configs;
  } catch (error) {
    console.error('[InventoryPage] Erro ao carregar logs:', error);
  }

  // 3. Busca os canais do Discord
  let channels: any[] = [];
  try {
    const resChannels = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    });
    if (resChannels.ok) {
      channels = await resChannels.json();
    }
  } catch (error) {
    console.error('[InventoryPage] Erro ao carregar canais:', error);
  }

  return (
    <div className="animate-fade-in">
      <InventoryManager
        guildId={guildId}
        initialItems={initialItems}
        channels={channels}
        initialLogConfigs={logConfigs}
      />
    </div>
  );
}
