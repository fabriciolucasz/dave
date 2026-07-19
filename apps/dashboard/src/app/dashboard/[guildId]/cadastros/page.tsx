// apps/dashboard/src/app/dashboard/[guildId]/cadastros/page.tsx
import { apiRequest } from '../../../../lib/api';
import { env } from '@dave/config';
import { RegistrationManager } from './RegistrationManager';

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  // 1. Busca cadastros
  let initialRegistrations: any[] = [];
  try {
    const res = await apiRequest<{ registrations: any[] }>(`/guilds/${guildId}/registrations`);
    initialRegistrations = res.registrations;
  } catch (error) {
    console.error('[RegistrationsPage] Erro ao carregar cadastros:', error);
  }

  // 2. Busca configurações de log
  let logConfigs: any[] = [];
  try {
    const res = await apiRequest<{ configs: any[] }>(`/guilds/${guildId}/log-configs`);
    logConfigs = res.configs;
  } catch (error) {
    console.error('[RegistrationsPage] Erro ao carregar logs:', error);
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
    console.error('[RegistrationsPage] Erro ao carregar canais:', error);
  }

  return (
    <div className="animate-fade-in">
      <RegistrationManager
        guildId={guildId}
        initialRegistrations={initialRegistrations}
        channels={channels}
        initialLogConfigs={logConfigs}
      />
    </div>
  );
}
