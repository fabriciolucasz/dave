// apps/dashboard/src/app/dashboard/[guildId]/overview/page.tsx
import { apiRequest } from '../../../../lib/api';
import Link from 'next/link';
import { CircleCheck, CircleAlert, Sparkles, Package, Swords, UserCheck, ShieldAlert, History } from 'lucide-react';

interface GuildSettings {
  defaultChannelId: string | null;
  allowedRoleIds: string[];
  locale: string;
}

interface Subscription {
  status: string;
  plan: {
    name: string;
    code: string;
  };
  currentPeriodEnd: string;
}

interface Guild {
  name: string;
  settings: GuildSettings | null;
  subscriptions: Subscription[];
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { guild } = await apiRequest<{ guild: Guild }>(`/guilds/${guildId}`);

  const settings = guild.settings;
  const subscription = guild.subscriptions[0];
  const isConfigured = !!settings?.defaultChannelId;

  // 1. Busca itens ativos do inventário
  let items: any[] = [];
  try {
    const res = await apiRequest<{ items: any[] }>(`/guilds/${guildId}/inventory/items`);
    items = res.items;
  } catch (_) {}

  // 2. Busca ações da Central
  let actions: any[] = [];
  try {
    const res = await apiRequest<{ actions: any[] }>(`/guilds/${guildId}/central/actions`);
    actions = res.actions;
  } catch (_) {}

  // 3. Busca cadastros
  let registrations: any[] = [];
  try {
    const res = await apiRequest<{ registrations: any[] }>(`/guilds/${guildId}/registrations`);
    registrations = res.registrations;
  } catch (_) {}

  // Calculos de estatísticas
  const totalStockQty = items.reduce((sum, item) => sum + item.currentQuantity, 0);
  const totalWonAmount = actions.filter(a => a.outcome === 'WON').reduce((sum, a) => sum + a.amount, 0);
  const pendingRegsCount = registrations.filter(r => r.status === 'PENDING' || r.status === 'MISMATCH').length;

  // Timeline / Atividade recente unificada
  const timelineEvents: Array<{ type: string; title: string; text: string; date: Date }> = [];
  
  items.slice(0, 3).forEach(item => {
    timelineEvents.push({
      type: 'inventory',
      title: 'Estoque Atualizado',
      text: `Item "${item.name}" possui ${item.currentQuantity} unidades em estoque.`,
      date: new Date(item.createdAt),
    });
  });

  actions.slice(0, 3).forEach(act => {
    timelineEvents.push({
      type: 'central',
      title: 'Ação de RP Registrada',
      text: `Resultado: ${act.outcome}. Valor total: R$ ${act.amount.toLocaleString('pt-BR')}.`,
      date: new Date(act.createdAt),
    });
  });

  registrations.slice(0, 3).forEach(reg => {
    timelineEvents.push({
      type: 'registration',
      title: 'Novo Cadastro de Personagem',
      text: `Membro: ${reg.characterName} (ID: #${reg.characterServerId}) com status "${reg.status}".`,
      date: new Date(reg.createdAt),
    });
  });

  const sortedTimeline = timelineEvents
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);

  return (
    <div style={styles.container} className="animate-fade-in">
      {/* Banner de Boas-vindas */}
      <div style={styles.welcomeCard} className="card-glass">
        <h2 style={styles.welcomeTitle}>Bem-vindo ao painel do {guild.name}!</h2>
        <p style={styles.welcomeText}>
          Aqui você gerencia todas as configurações do bot, visualiza estatísticas agregadas do servidor e acompanha a atividade recente de inventário, ações e cadastros.
        </p>
      </div>

      {/* Grid de Estatísticas */}
      <div style={styles.statsGrid}>
        {/* Status Card */}
        <div style={styles.card} className="card-glass">
          <h3 style={styles.cardTitle}>Configuração</h3>
          <div style={styles.statusRow}>
            <span className={`badge ${isConfigured ? 'badge-active' : 'badge-inactive'}`}>
              {isConfigured ? <CircleCheck size={12} /> : <CircleAlert size={12} />}
              {isConfigured ? 'Configurado' : 'Pendente'}
            </span>
          </div>
          <p style={styles.cardText}>
            {isConfigured
              ? `Canal padrão: #${settings.defaultChannelId}. O bot está ativo.`
              : 'O bot ainda não tem canal ou cargos autorizados definidos.'}
          </p>
          <Link href={`/dashboard/${guildId}/settings`} className="btn btn-secondary" style={styles.cardBtn}>
            Configurações
          </Link>
        </div>

        {/* Subscription Card */}
        <div style={styles.card} className="card-glass">
          <h3 style={styles.cardTitle}>Assinatura</h3>
          <div style={styles.statusRow}>
            {subscription ? (
              <span className="badge badge-active">
                <Sparkles size={12} /> {subscription.plan.name}
              </span>
            ) : (
              <span className="badge badge-inactive">
                <CircleAlert size={12} /> Sem Plano
              </span>
            )}
          </div>
          <p style={styles.cardText}>
            {subscription
              ? `Vence/renova em ${new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}.`
              : 'Assine o Pro para obter webhooks e logs personalizados.'}
          </p>
          <Link href={`/dashboard/${guildId}/subscription`} className="btn btn-primary" style={styles.cardBtn}>
            Assinaturas
          </Link>
        </div>

        {/* Inventory Stock Card */}
        <div style={styles.card} className="card-glass">
          <h3 style={styles.cardTitle}>Estoque (Baú)</h3>
          <div style={styles.statusRow}>
            <span className="badge badge-active">
              <Package size={12} /> {totalStockQty} unidades
            </span>
          </div>
          <p style={styles.cardText}>
            Temos {items.length} itens distintos cadastrados no inventário compartilhado do servidor.
          </p>
          <Link href={`/dashboard/${guildId}/bau`} className="btn btn-secondary" style={styles.cardBtn}>
            Ver Estoque
          </Link>
        </div>

        {/* Central Earnings Card */}
        <div style={styles.card} className="card-glass">
          <h3 style={styles.cardTitle}>Central (RP)</h3>
          <div style={styles.statusRow}>
            <span className="badge badge-active">
              <Swords size={12} /> R$ {totalWonAmount.toLocaleString('pt-BR')}
            </span>
          </div>
          <p style={styles.cardText}>
            Acumulado total de ganhos com ações registradas no servidor.
          </p>
          <Link href={`/dashboard/${guildId}/central`} className="btn btn-secondary" style={styles.cardBtn}>
            Ver Central
          </Link>
        </div>
      </div>

      {/* Grid Secundária: Atividade Recente e Avisos */}
      <div style={styles.row}>
        {/* Atividade Recente */}
        <div style={{ ...styles.card, flex: 2 }} className="card-glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <History size={16} />
            <h3 style={styles.cardTitle}>Atividade Recente</h3>
          </div>
          <div style={styles.timeline}>
            {sortedTimeline.map((ev, idx) => (
              <div key={idx} style={styles.timelineItem}>
                <div style={styles.timelinePoint} />
                <div style={{ flex: 1 }}>
                  <div style={styles.timelineHeader}>
                    <span style={styles.timelineTitle}>{ev.title}</span>
                    <span style={styles.timelineDate}>{ev.date.toLocaleString('pt-BR')}</span>
                  </div>
                  <p style={styles.timelineText}>{ev.text}</p>
                </div>
              </div>
            ))}
            {sortedTimeline.length === 0 && (
              <p style={{ color: '#949ba4', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>Nenhuma atividade registrada ainda.</p>
            )}
          </div>
        </div>

        {/* Cadastro Revisões Card */}
        <div style={{ ...styles.card, flex: 1 }} className="card-glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <UserCheck size={16} />
            <h3 style={styles.cardTitle}>Revisão de Cadastro</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', gap: '12px' }}>
            {pendingRegsCount > 0 ? (
              <>
                <ShieldAlert size={48} style={{ color: '#ffc44f' }} />
                <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700 }}>Atenção Staff</h4>
                <p style={{ color: '#949ba4', fontSize: '12px' }}>Existem <strong>{pendingRegsCount}</strong> cadastros aguardando moderação manual devido a divergência no apelido.</p>
                <Link href={`/dashboard/${guildId}/cadastros`} className="btn btn-primary" style={{ width: '100%' }}>Moderar Cadastros</Link>
              </>
            ) : (
              <>
                <CircleCheck size={48} style={{ color: '#248046' }} />
                <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700 }}>Tudo limpo!</h4>
                <p style={{ color: '#949ba4', fontSize: '12px' }}>Nenhum cadastro pendente de moderação no momento.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  welcomeCard: {
    padding: '32px',
    background: 'linear-gradient(135deg, rgba(88, 101, 242, 0.1) 0%, rgba(21, 23, 35, 0.6) 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  welcomeTitle: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#ffffff',
  },
  welcomeText: {
    fontSize: '15px',
    color: '#949ba4',
    lineHeight: 1.6,
    maxWidth: '700px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
  },
  row: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    alignItems: 'flex-start',
    padding: '24px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#ffffff',
  },
  statusRow: {
    display: 'flex',
    gap: '8px',
  },
  cardText: {
    fontSize: '13px',
    color: '#949ba4',
    lineHeight: 1.6,
    flex: 1,
  },
  cardBtn: {
    marginTop: '12px',
    alignSelf: 'stretch',
    fontSize: '13px',
    padding: '8px',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
  },
  timelineItem: {
    display: 'flex',
    gap: '12px',
    position: 'relative',
  },
  timelinePoint: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: '#5865f2',
    marginTop: '6px',
  },
  timelineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    fontWeight: 700,
  },
  timelineTitle: {
    color: '#ffffff',
  },
  timelineDate: {
    color: '#949ba4',
  },
  timelineText: {
    fontSize: '12px',
    color: '#dbdee1',
    marginTop: '4px',
  },
};
