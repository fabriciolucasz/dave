// apps/dashboard/src/app/dashboard/[guildId]/settings/page.tsx
import { apiRequest } from '../../../../lib/api';
import { env } from '@dave/config';
import { SettingsForm } from './SettingsForm';

interface GuildSettings {
  defaultChannelId: string | null;
  allowedRoleIds: string[];
  locale: string;
}

interface Guild {
  settings: GuildSettings | null;
}

// ---------------------------------------------------------------------------
// Settings Page (Server Component)
//
// Busca as configurações atuais no backend Hono e a lista de canais/roles
// diretamente na API do Discord usando o token do bot para popular o formulário.
// ---------------------------------------------------------------------------

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  // 1. Busca configurações atuais no Hono
  const { guild } = await apiRequest<{ guild: Guild }>(`/guilds/${guildId}`);

  // 2. Busca canais e roles na API do Discord usando o token do bot
  let rawChannels: any[] = [];
  let rawRoles: any[] = [];

  try {
    const resChannels = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    });
    if (resChannels.ok) rawChannels = await resChannels.json();

    const resRoles = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    });
    if (resRoles.ok) rawRoles = await resRoles.json();
  } catch (err) {
    console.error('[SettingsPage] Falha ao consultar API do Discord:', err);
  }

  // Filtra apenas canais de texto (type = 0)
  const channels = rawChannels
    .filter((c: any) => c.type === 0)
    .map((c: any) => ({ id: c.id, name: c.name }));

  // Filtra e remove o cargo @everyone (id igual ao discordId da guilda)
  const roles = rawRoles
    .filter((r: any) => r.id !== guildId)
    .map((r: any) => ({ id: r.id, name: r.name }));

  return (
    <div className="card-glass animate-fade-in">
      <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px', color: '#ffffff' }}>
        Configurações do Servidor
      </h2>
      <p style={{ fontSize: '14px', color: '#949ba4', marginBottom: '32px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '16px' }}>
        Ajuste as definições de permissão e destino de mensagens padrão do bot do Dave para este servidor.
      </p>
      
      <SettingsForm
        guildId={guildId}
        initialChannelId={guild.settings?.defaultChannelId ?? null}
        initialRoleIds={guild.settings?.allowedRoleIds ?? []}
        channels={channels}
        roles={roles}
      />
    </div>
  );
}
