import { apiRequest } from '../../../../lib/api';
import Link from 'next/link';
import { CircleCheck, CircleAlert, Sparkles } from 'lucide-react';

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

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.welcomeCard} className="card-glass">
        <h2 style={styles.welcomeTitle}>Bem-vindo ao painel do {guild.name}!</h2>
        <p style={styles.welcomeText}>
          Aqui você pode gerenciar todas as configurações do bot, monitorar as mensagens persistentes e controlar as informações de assinatura do seu servidor.
        </p>
      </div>

      <div style={styles.grid}>
        {/* Status Card */}
        <div style={styles.card} className="card-glass">
          <h3 style={styles.cardTitle}>Status de Configuração</h3>
          <div style={styles.statusRow}>
            <span className={`badge ${isConfigured ? 'badge-active' : 'badge-inactive'}`}>
              {isConfigured ? (
                <>
                  <CircleCheck size={12} aria-hidden="true" style={{ marginRight: '4px' }} /> Configurado
                </>
              ) : (
                <>
                  <CircleAlert size={12} aria-hidden="true" style={{ marginRight: '4px' }} /> Configuração Pendente
                </>
              )}
            </span>
          </div>
          <p style={styles.cardText}>
            {isConfigured
              ? `Canal padrão: <#${settings.defaultChannelId}>. O bot está pronto para enviar notificações.`
              : 'O bot ainda não tem canal ou cargos definidos. Vá em configurações para ajustar.'}
          </p>
          <Link href={`/dashboard/${guildId}/settings`} className="btn btn-secondary" style={styles.cardBtn}>
            Ir para Configurações
          </Link>
        </div>

        {/* Subscription Card */}
        <div style={styles.card} className="card-glass">
          <h3 style={styles.cardTitle}>Plano & Cobrança</h3>
          <div style={styles.statusRow}>
            {subscription ? (
              <span className="badge badge-active">
                <Sparkles size={12} aria-hidden="true" style={{ marginRight: '4px' }} /> {subscription.plan.name}
              </span>
            ) : (
              <span className="badge badge-inactive">
                <CircleAlert size={12} aria-hidden="true" style={{ marginRight: '4px' }} /> Nenhuma Assinatura
              </span>
            )}
          </div>
          <p style={styles.cardText}>
            {subscription
              ? `Sua assinatura está ativa e vence/renova em ${new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}.`
              : 'Assine um de nossos planos para liberar todos os recursos premium do bot no seu servidor.'}
          </p>
          <Link href={`/dashboard/${guildId}/subscription`} className="btn btn-primary" style={styles.cardBtn}>
            {subscription ? 'Gerenciar Plano' : 'Ver Planos'}
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: '24px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
  },
  statusRow: {
    display: 'flex',
    gap: '8px',
  },
  cardText: {
    fontSize: '14px',
    color: '#949ba4',
    lineHeight: 1.6,
    flex: 1,
  },
  cardBtn: {
    marginTop: '12px',
    alignSelf: 'stretch',
  },
};
