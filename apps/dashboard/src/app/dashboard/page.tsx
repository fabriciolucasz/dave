// apps/dashboard/src/app/dashboard/page.tsx
import { redirect } from 'next/navigation';
import { apiRequest, ApiError } from '../../lib/api';
import { env } from '@dave/config';
import { clearAuthSession } from '../auth/actions';

// ---------------------------------------------------------------------------
// Dashboard Page (/dashboard)
//
// Roteador de entrada pós-login:
//   - 0 servidores → Tela de convite para adicionar o bot.
//   - 1 servidor → Redireciona direto para overview do servidor.
//   - Múltiplos → Grade de seleção de servidores.
// ---------------------------------------------------------------------------

interface Guild {
  id: string;
  discordId: string;
  name: string;
  iconHash: string | null;
  isActive: boolean;
}

export default async function DashboardPage() {
  let guilds: Guild[] = [];

  try {
    const res = await apiRequest<{ guilds: Guild[] }>('/guilds');
    guilds = res.guilds;
  } catch (error) {
    console.error('[DashboardRouter] Erro ao carregar servidores:', error);
    if (error instanceof ApiError && error.status === 401) {
      // Token inválido/expirado, limpa sessão e envia para home
      await clearAuthSession();
    }
    // Fallback de erro geral
    redirect('/');
  }

  // Cenário 1: 0 servidores onde o bot está presente
  if (guilds.length === 0) {
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;

    return (
      <div style={styles.container} className="animate-fade-in">
        <div style={styles.card} className="card-glass">
          <h2 style={styles.title}>Nenhum servidor encontrado</h2>
          <p style={styles.text}>
            Você é administrador de servidores, mas o bot do **Dave** ainda não foi adicionado a nenhum deles.
          </p>
          <a href={inviteUrl} className="btn btn-primary" target="_blank" rel="noopener noreferrer" style={styles.btn}>
            Adicionar Bot ao Servidor
          </a>
        </div>
      </div>
    );
  }

  // Cenário 2: 1 único servidor cadastrado
  if (guilds.length === 1) {
    redirect(`/dashboard/${guilds[0].discordId}/overview`);
  }

  // Cenário 3: Múltiplos servidores
  return (
    <div style={styles.multiContainer} className="animate-fade-in">
      <header style={styles.header}>
        <div style={styles.logoContainer}>
          <span style={styles.logoText}>dave</span>
          <span style={styles.logoDot}>.</span>
        </div>
        <h1 style={styles.headerTitle}>Selecione um Servidor</h1>
      </header>

      <div style={styles.grid}>
        {guilds.map((guild) => {
          const iconUrl = guild.iconHash
            ? `https://cdn.discordapp.com/icons/${guild.discordId}/${guild.iconHash}.png`
            : null;

          return (
            <a key={guild.id} href={`/dashboard/${guild.discordId}/overview`} style={styles.guildCard} className="card-glass">
              {iconUrl ? (
                <img src={iconUrl} alt={guild.name} style={styles.guildIcon} />
              ) : (
                <div style={styles.guildIconFallback}>{guild.name.charAt(0)}</div>
              )}
              <h3 style={styles.guildName}>{guild.name}</h3>
              <span className={`badge ${guild.isActive ? 'badge-active' : 'badge-inactive'}`}>
                {guild.isActive ? 'Ativo' : 'Pendente'}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'radial-gradient(circle at top, #161824 0%, #0a0b10 100%)',
    padding: '24px',
  },
  card: {
    maxWidth: '460px',
    width: '100%',
    textAlign: 'center',
    padding: '40px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    alignItems: 'center',
  },
  title: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#ffffff',
  },
  text: {
    fontSize: '15px',
    color: '#949ba4',
    lineHeight: 1.6,
  },
  btn: {
    padding: '12px 24px',
    fontSize: '15px',
    marginTop: '8px',
  },
  multiContainer: {
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    padding: '64px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '48px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'baseline',
    userSelect: 'none',
  },
  logoText: {
    fontSize: '32px',
    fontWeight: 900,
    letterSpacing: '-1.5px',
    background: 'linear-gradient(135deg, #ffffff 0%, #a5a6c4 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  logoDot: {
    fontSize: '32px',
    fontWeight: 900,
    color: '#5865f2',
  },
  headerTitle: {
    fontSize: '28px',
    fontWeight: 800,
    color: '#ffffff',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '24px',
  },
  guildCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    textAlign: 'center',
    padding: '32px 24px',
    textDecoration: 'none',
    color: 'inherit',
  },
  guildIcon: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid rgba(255, 255, 255, 0.1)',
  },
  guildIconFallback: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #2c2f48 0%, #151725 100%)',
    color: '#ffffff',
    fontSize: '32px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid rgba(255, 255, 255, 0.1)',
  },
  guildName: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
  },
};
