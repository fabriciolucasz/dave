// apps/dashboard/src/app/login/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@dave/config';

// ---------------------------------------------------------------------------
// Login Page (/login)
//
// Se o usuário já possuir sessão ativa, envia direto para o /dashboard.
// Se não, renderiza o card de entrada integrado ao Discord OAuth2.
// ---------------------------------------------------------------------------

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('discord_access_token')?.value;

  if (token) {
    redirect('/dashboard');
  }

  const authUrl = `${env.API_BASE_URL}/auth/authorize`;

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.card} className="card-glass">
        <div style={styles.logoContainer}>
          <span style={styles.logoText}>dave</span>
          <span style={styles.logoDot}>.</span>
        </div>
        <h2 style={styles.title}>Entrar na Plataforma</h2>
        <p style={styles.text}>
          Para gerenciar seus servidores e assinaturas premium, conecte-se utilizando sua conta oficial do Discord.
        </p>
        <a href={authUrl} className="btn btn-primary" style={styles.loginBtn}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 127.14 96.36"
            fill="currentColor"
            style={{ marginRight: '8px' }}
          >
            <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.8.69,1.63,1.38,2.51,2a68.43,68.43,0,0,1-10.5,5A77.7,77.7,0,0,0,102,96.36a105.73,105.73,0,0,0,31-18.83C135,50.06,128.9,27.24,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
          </svg>
          Conectar com o Discord
        </a>
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
    maxWidth: '440px',
    width: '100%',
    textAlign: 'center',
    padding: '48px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    alignItems: 'center',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'baseline',
    userSelect: 'none',
  },
  logoText: {
    fontSize: '36px',
    fontWeight: 900,
    letterSpacing: '-1.5px',
    background: 'linear-gradient(135deg, #ffffff 0%, #a5a6c4 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  logoDot: {
    fontSize: '36px',
    fontWeight: 900,
    color: '#5865f2',
  },
  title: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#ffffff',
  },
  text: {
    fontSize: '14px',
    color: '#949ba4',
    lineHeight: 1.6,
  },
  loginBtn: {
    width: '100%',
    padding: '14px 28px',
    fontSize: '15px',
    marginTop: '8px',
  },
};
