// apps/dashboard/src/app/dashboard/[guildId]/paineis/page.tsx
import { apiRequest } from '../../../../lib/api';
import { env } from '@dave/config';
import { PaineisList } from './PaineisList';

interface Container {
  id: string;
  channelId: string;
  type: string;
  messageId: string | null;
  createdAt: string;
  isActive: boolean;
  payload: any;
}

interface ContainerType {
  type: string;
  name: string;
  icon: string;
  isSticky: boolean;
  description: string;
}

interface PlanFeatures {
  maxActiveContainers: number;
  customWebhookEnabled: boolean;
  queuePriority: boolean;
  maxBillingAdmins: number;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  features: PlanFeatures;
}

interface Subscription {
  id: string;
  status: string;
  plan: Plan;
}

interface GuildDetail {
  id: string;
  discordId: string;
  name: string;
  isActive: boolean;
  subscriptions: Subscription[];
}

export default async function PaineisPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  // 1. Busca os detalhes da guilda (para obter plano de faturamento ativo)
  let guildDetail: GuildDetail | null = null;
  try {
    const resGuild = await apiRequest<{ guild: GuildDetail }>(`/guilds/${guildId}`);
    guildDetail = resGuild.guild;
  } catch (error) {
    console.error('[PaineisPage] Erro ao carregar detalhes da guilda:', error);
  }

  // 2. Busca os containers ativos da guilda na API
  let containers: Container[] = [];
  try {
    const res = await apiRequest<{ containers: Container[] }>(`/guilds/${guildId}/containers`);
    containers = res.containers;
  } catch (error) {
    console.error('[PaineisPage] Erro ao carregar containers:', error);
  }

  // 3. Busca os tipos de painéis disponíveis na API
  let panelTypes: ContainerType[] = [];
  try {
    const resTypes = await apiRequest<{ types: ContainerType[] }>(`/guilds/${guildId}/containers/types`);
    panelTypes = resTypes.types;
  } catch (error) {
    console.error('[PaineisPage] Erro ao carregar tipos de painéis:', error);
  }

  // 4. Busca os canais do Discord para mapear os IDs de canais
  let rawChannels: any[] = [];
  try {
    const resChannels = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    });
    if (resChannels.ok) rawChannels = await resChannels.json();
  } catch (error) {
    console.error('[PaineisPage] Erro ao carregar canais do Discord:', error);
  }

  const channels = rawChannels
    .filter((c: any) => c.type === 0 || c.type === 4 || c.type === 5) // Canais de texto e anúncios
    .map((c: any) => ({ id: c.id, name: c.name }));

  const activeSub = guildDetail?.subscriptions?.[0] || null;
  const currentPlanCode = activeSub?.status === 'ACTIVE' || activeSub?.status === 'TRIALING'
    ? activeSub.plan.code
    : 'free';

  const planFeatures: PlanFeatures = activeSub?.status === 'ACTIVE' || activeSub?.status === 'TRIALING'
    ? activeSub.plan.features
    : {
        maxActiveContainers: 1,
        customWebhookEnabled: false,
        queuePriority: false,
        maxBillingAdmins: 1,
      };

  return (
    <PaineisList
      guildId={guildId}
      panelTypes={panelTypes}
      initialContainers={containers}
      channels={channels}
      currentPlanCode={currentPlanCode}
      planFeatures={planFeatures}
    />
  );
}
