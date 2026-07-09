// apps/dashboard/src/app/dashboard/[guildId]/containers/page.tsx
import { apiRequest } from '../../../../lib/api';
import { env } from '@dave/config';
import { ContainersTable } from './ContainersTable';

interface Container {
  id: string;
  channelId: string;
  type: string;
  messageId: string | null;
  createdAt: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Containers Page (Server Component)
//
// Busca os containers persistentes da guilda no banco e sincroniza com a lista
// de canais do Discord para traduzir snowflakes de canais para nomes legíveis.
// ---------------------------------------------------------------------------

export default async function ContainersPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  // 1. Busca os containers ativos da guilda na API
  let containers: Container[] = [];
  try {
    const res = await apiRequest<{ containers: Container[] }>(`/guilds/${guildId}/containers`);
    containers = res.containers;
  } catch (error) {
    console.error('[ContainersPage] Erro ao carregar containers:', error);
  }

  // 2. Busca os canais do Discord para resolver os IDs para nomes amigáveis
  let rawChannels: any[] = [];
  try {
    const resChannels = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    });
    if (resChannels.ok) rawChannels = await resChannels.json();
  } catch (error) {
    console.error('[ContainersPage] Erro ao carregar canais do Discord:', error);
  }

  const channelMap = new Map<string, string>(
    rawChannels.map((c: any) => [c.id, c.name])
  );

  const formattedContainers = containers.map((c) => ({
    id: c.id,
    channelId: c.channelId,
    channelName: channelMap.get(c.channelId) || c.channelId,
    type: c.type,
    messageId: c.messageId,
    createdAt: c.createdAt,
  }));

  return (
    <div className="card-glass animate-fade-in">
      <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px', color: '#ffffff' }}>
        Containers Persistentes
      </h2>
      <p style={{ fontSize: '14px', color: '#949ba4', marginBottom: '32px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '16px' }}>
        Mensagens importantes que o bot mantém fixas no Discord. Se deletadas por usuários, o bot reenvia e atualiza automaticamente.
      </p>

      <ContainersTable guildId={guildId} initialContainers={formattedContainers} />
    </div>
  );
}
