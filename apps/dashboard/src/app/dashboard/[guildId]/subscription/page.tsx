// apps/dashboard/src/app/dashboard/[guildId]/subscription/page.tsx
import { apiRequest } from '../../../../lib/api';
import { SubscriptionManager } from './SubscriptionManager';

interface Plan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  features: any;
}

interface Guild {
  id: string;
  discordId: string;
  name: string;
  ownerUserId: string | null;
  subscriptions: any[];
}

interface User {
  id: string;
}

// ---------------------------------------------------------------------------
// Subscription Page (Server Component)
//
// Agrega detalhes da guilda, dados do usuário logado e planos disponíveis
// no catálogo da REST API e repassa para o SubscriptionManager.
// ---------------------------------------------------------------------------

export default async function SubscriptionPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  // 1. Busca detalhes da guilda (inclui assinatura ativa e proprietário)
  const { guild } = await apiRequest<{ guild: Guild }>(`/guilds/${guildId}`);

  // 2. Busca perfil do usuário logado
  const { user } = await apiRequest<{ user: User }>('/users/me');

  // 3. Busca planos ativos no catálogo
  let plans: Plan[] = [];
  try {
    const res = await apiRequest<{ plans: Plan[] }>('/subscriptions/plans/available');
    plans = res.plans;
  } catch (error) {
    console.error('[SubscriptionPage] Erro ao buscar planos no catálogo:', error);
  }

  const activeSubscription = guild.subscriptions[0] || null;
  const isOwner = guild.ownerUserId === user.id;

  return (
    <div className="card-glass animate-fade-in">
      <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px', color: '#ffffff' }}>
        Assinatura do Servidor
      </h2>
      <p style={{ fontSize: '14px', color: '#949ba4', marginBottom: '32px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '16px' }}>
        Controle o faturamento do bot do Dave para o seu servidor. Recursos premium exigem uma assinatura ativa.
      </p>

      <SubscriptionManager
        guildId={guildId}
        userId={user.id}
        isOwner={isOwner}
        activeSubscription={activeSubscription}
        plans={plans}
      />
    </div>
  );
}
