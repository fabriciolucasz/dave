// apps/dashboard/src/app/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@dave/config';

// ---------------------------------------------------------------------------
// Home Page / Landing Page
//
// Se o usuário já estiver autenticado (cookie 'discord_access_token' existe),
// redireciona diretamente para o /dashboard.
// Caso contrário, renderiza a página de login/landing com visual premium.
// ---------------------------------------------------------------------------

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('discord_access_token')?.value;

  if (token) {
    redirect('/dashboard');
  }

  const authUrl = `${env.API_BASE_URL}/auth/authorize`;

  return (
    <div style={styles.container} className="animate-fade-in">
      <main style={styles.main}>
        <div style={styles.logoContainer}>
          <span style={styles.logoText}>dave</span>
          <span style={styles.logoDot}>.</span>
        </div>

        <div style={styles.heroSection}>
          <h1 style={styles.title}>
            A plataforma definitiva para gestores de <span style={styles.gradientText}>GTA RP</span>
          </h1>
          <p style={styles.subtitle}>
            Automatize convites, gerencie containers persistentes, configure cargos de acesso e processe assinaturas de forma centralizada e sem esforço.
          </p>
        </div>

        <div style={styles.card} className="card-glass">
          <h3 style={styles.cardTitle}>Acesse o seu Painel</h3>
          <p style={styles.cardText}>
            Faça login com a sua conta do Discord para gerenciar os servidores e configurações de seus bots.
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
            Entrar com o Discord
          </a>
        </div>
      </main>

      <footer style={styles.footer}>
        <p style={styles.footerText}>© {new Date().getFullYear()} Dave Bot. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}

// Estilos Inline Premium para evitar page.module.css e manter layout consistente
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '24px',
    background: 'radial-gradient(circle at top, #161824 0%, #0a0b10 100%)',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    maxWidth: '800px',
    width: '100%',
    textAlign: 'center',
    gap: '40px',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'baseline',
    userSelect: 'none',
  },
  logoText: {
    fontSize: '48px',
    fontWeight: 900,
    letterSpacing: '-2px',
    background: 'linear-gradient(135deg, #ffffff 0%, #a5a6c4 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  logoDot: {
    fontSize: '48px',
    fontWeight: 900,
    color: '#5865f2',
  },
  heroSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  title: {
    fontSize: '40px',
    fontWeight: 800,
    lineHeight: 1.2,
    letterSpacing: '-1px',
    color: '#ffffff',
  },
  gradientText: {
    background: 'linear-gradient(135deg, #5865f2 0%, #8547f2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '18px',
    lineHeight: 1.6,
    color: '#949ba4',
    maxWidth: '640px',
    margin: '0 auto',
  },
  card: {
    maxWidth: '480px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '32px',
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
  },
  cardText: {
    fontSize: '14px',
    lineHeight: 1.5,
    color: '#949ba4',
    marginBottom: '8px',
  },
  loginBtn: {
    width: '100%',
    padding: '14px 28px',
    fontSize: '16px',
  },
  footer: {
    padding: '24px',
    borderTop: '1px solid rgba(255, 255, 255, 0.03)',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: '13px',
    color: '#6e7681',
  },
};
