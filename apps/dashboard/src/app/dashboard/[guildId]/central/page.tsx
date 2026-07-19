// apps/dashboard/src/app/dashboard/[guildId]/central/page.tsx
import { apiRequest } from '../../../../lib/api';
import { env } from '@dave/config';
import { CentralManager } from './CentralManager';

export default async function CentralPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  // 1. Busca ações ilegais
  let initialActions: any[] = [];
  try {
    const res = await apiRequest<{ actions: any[] }>(`/guilds/${guildId}/central/actions`);
    initialActions = res.actions;
  } catch (error) {
    console.error('[CentralPage] Erro ao carregar ações:', error);
  }

  // 2. Busca entregas de meta
  let initialGoals: any[] = [];
  try {
    const res = await apiRequest<{ submissions: any[] }>(`/guilds/${guildId}/central/goals`);
    initialGoals = res.submissions;
  } catch (error) {
    console.error('[CentralPage] Erro ao carregar metas:', error);
  }

  // 3. Busca configurações de log
  let logConfigs: any[] = [];
  try {
    const res = await apiRequest<{ configs: any[] }>(`/guilds/${guildId}/log-configs`);
    logConfigs = res.configs;
  } catch (error) {
    console.error('[CentralPage] Erro ao carregar logs:', error);
  }

  // 4. Busca os canais do Discord
  let channels: any[] = [];
  try {
    const resChannels = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    });
    if (resChannels.ok) {
      channels = await resChannels.json();
    }
  } catch (error) {
    console.error('[CentralPage] Erro ao carregar canais:', error);
  }

  return (
    <div className="animate-fade-in">
      <CentralManager
        guildId={guildId}
        initialActions={initialActions}
        initialGoals={initialGoals}
        channels={channels}
        initialLogConfigs={logConfigs}
      />
    </div>
  );
}
