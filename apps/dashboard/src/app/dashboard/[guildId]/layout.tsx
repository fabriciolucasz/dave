// apps/dashboard/src/app/dashboard/[guildId]/layout.tsx
import { redirect } from 'next/navigation';
import { apiRequest } from '../../../lib/api';
import { GuildSwitcher } from '../../../components/GuildSwitcher';
import { clearAuthSession } from '../../auth/actions';
import Link from 'next/link';

interface Guild {
  id: string;
  discordId: string;
  name: string;
  iconHash: string | null;
  isActive: boolean;
}

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  let guilds: Guild[] = [];

  try {
    const res = await apiRequest<{ guilds: Guild[] }>('/guilds');
    guilds = res.guilds;
  } catch (error) {
    console.error('[GuildLayout] Erro ao carregar servidores:', error);
    redirect('/login');
  }

  const currentGuild = guilds.find((g) => g.discordId === guildId);

  if (!currentGuild) {
    // Guilda não pertence ao usuário ou não existe
    redirect('/dashboard');
  }

  let activeSubscription = null;
  try {
    const resGuild = await apiRequest<{ guild: any }>(`/guilds/${guildId}`);
    activeSubscription = resGuild.guild.subscriptions[0] || null;
  } catch (err) {
    console.warn('[GuildLayout] Erro ao buscar assinatura:', err);
  }

  const isExpired =
    !activeSubscription ||
    activeSubscription.status === 'EXPIRED' ||
    activeSubscription.status === 'PAST_DUE';

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.logoContainer}>
          <Link href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline' }}>
            <span style={styles.logoText}>dave</span>
            <span style={styles.logoDot}>.</span>
          </Link>
        </div>

        <div style={styles.switcherContainer}>
          <GuildSwitcher guilds={guilds} currentGuildId={guildId} />
        </div>

        <nav style={styles.nav}>
          <Link href={`/dashboard/${guildId}/overview`} style={styles.navLink}>
            📊 Visão Geral
          </Link>
          <Link href={`/dashboard/${guildId}/settings`} style={styles.navLink}>
            ⚙️ Configurações
          </Link>
          <Link href={`/dashboard/${guildId}/containers`} style={styles.navLink}>
            📦 Containers
          </Link>
          <Link href={`/dashboard/${guildId}/subscription`} style={styles.navLink}>
            💳 Assinatura
          </Link>
        </nav>

        <div style={styles.sidebarFooter}>
          <Link href="/account" style={styles.accountLink}>
            👤 Minha Conta
          </Link>
          <form action={clearAuthSession} style={{ width: '100%' }}>
            <button type="submit" className="btn btn-secondary" style={styles.logoutBtn}>
              Sair
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={styles.main}>
        <div style={styles.topbar}>
          <div style={styles.topbarLeft}>
            <h2 style={styles.topbarTitle}>{currentGuild.name}</h2>
            <span className={`badge ${currentGuild.isActive ? 'badge-active' : 'badge-inactive'}`}>
              {currentGuild.isActive ? 'Ativo' : 'Pendente'}
            </span>
          </div>
        </div>

        {isExpired && (
          <div style={styles.expiredBanner} className="animate-fade-in">
            ⚠️ Este servidor não possui uma assinatura Pro ativa. Alguns recursos premium podem estar bloqueados ou limitados.
            <Link href={`/dashboard/${guildId}/subscription`} style={styles.bannerLink}>
              Assinar Pro
            </Link>
          </div>
        )}

        <div style={styles.content}>{children}</div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    background: '#0a0b10',
  },
  sidebar: {
    width: '280px',
    background: '#11131c',
    borderRight: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
  },
  logoContainer: {
    padding: '24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  },
  logoText: {
    fontSize: '24px',
    fontWeight: 900,
    letterSpacing: '-1px',
    background: 'linear-gradient(135deg, #ffffff 0%, #a5a6c4 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  logoDot: {
    fontSize: '24px',
    color: '#5865f2',
  },
  switcherContainer: {
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  },
  nav: {
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1,
  },
  navLink: {
    color: '#949ba4',
    textDecoration: 'none',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  sidebarFooter: {
    padding: '24px 16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.03)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  accountLink: {
    color: '#f2f3f5',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 600,
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoutBtn: {
    width: '100%',
    padding: '8px',
    fontSize: '13px',
  },
  main: {
    flex: 1,
    marginLeft: '280px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  topbar: {
    height: '72px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 40px',
    background: 'rgba(10, 11, 16, 0.5)',
    backdropFilter: 'blur(8px)',
    position: 'sticky',
    top: 0,
    zIndex: 90,
  },
  topbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  topbarTitle: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#ffffff',
  },
  content: {
    padding: '40px',
    flex: 1,
  },
  expiredBanner: {
    background: 'rgba(218, 55, 60, 0.12)',
    borderBottom: '1px solid rgba(218, 55, 60, 0.25)',
    color: '#f25c60',
    padding: '12px 40px',
    fontSize: '14px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  bannerLink: {
    color: '#ffffff',
    textDecoration: 'underline',
    marginLeft: '6px',
    fontWeight: 700,
  },
};
