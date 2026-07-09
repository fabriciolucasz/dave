// apps/dashboard/src/app/account/page.tsx
import { apiRequest } from '../../lib/api';
import Link from 'next/link';

interface User {
  discordId: string;
  username: string;
  globalName: string | null;
  email: string | null;
  avatarHash: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Account Page (Server Component)
//
// Exibe dados pessoais do usuário autenticado coletados diretamente
// via API do Discord e mantidos no banco de dados.
// ---------------------------------------------------------------------------

export default async function AccountPage() {
  let user: User | null = null;

  try {
    const res = await apiRequest<{ user: User }>('/users/me');
    user = res.user;
  } catch (error) {
    console.error('[AccountPage] Erro ao carregar perfil:', error);
  }

  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.card} className="card-glass">
          <h2 style={styles.title}>Erro ao carregar perfil</h2>
          <p style={styles.text}>Não foi possível carregar as informações do seu usuário.</p>
          <Link href="/dashboard" className="btn btn-primary">
            Voltar para o Painel
          </Link>
        </div>
      </div>
    );
  }

  const avatarUrl = user.avatarHash
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatarHash}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.card} className="card-glass">
        <div style={styles.avatarWrapper}>
          <img src={avatarUrl} alt={user.globalName || user.username} style={styles.avatar} />
        </div>

        <div style={styles.profileInfo}>
          <h2 style={styles.globalName}>{user.globalName || user.username}</h2>
          <p style={styles.username}>@{user.username}</p>
        </div>

        <div style={styles.detailsList}>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Discord ID</span>
            <code style={styles.detailValue}>{user.discordId}</code>
          </div>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>E-mail</span>
            <span style={styles.detailValue}>{user.email || 'Não compartilhado'}</span>
          </div>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Membro desde</span>
            <span style={styles.detailValue}>
              {new Date(user.createdAt).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>

        <div style={styles.actions}>
          <Link href="/dashboard" className="btn btn-primary" style={styles.backBtn}>
            Voltar para o Painel
          </Link>
        </div>
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
    gap: '24px',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
    width: '120px',
    height: '120px',
  },
  avatar: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '4px solid rgba(88, 101, 242, 0.2)',
  },
  profileInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  globalName: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#ffffff',
  },
  username: {
    fontSize: '14px',
    color: '#949ba4',
    fontWeight: 600,
  },
  detailsList: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    padding: '20px 0',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
  },
  detailLabel: {
    color: '#6e7681',
    fontWeight: 600,
  },
  detailValue: {
    color: '#ffffff',
    fontWeight: 700,
  },
  actions: {
    width: '100%',
    marginTop: '8px',
  },
  backBtn: {
    width: '100%',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
  },
  text: {
    fontSize: '14px',
    color: '#949ba4',
  },
};
