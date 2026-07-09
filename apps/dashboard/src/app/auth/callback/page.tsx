// apps/dashboard/src/app/auth/callback/page.tsx
'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { setAuthSession } from '../actions';

// ---------------------------------------------------------------------------
// Auth Callback Page (Next.js)
//
// Recebe o access_token e a data de expiração vindos do Hono REST API,
// invoca a Server Action para definir o cookie seguro, e redireciona.
// ---------------------------------------------------------------------------

function CallbackContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const expiresAt = searchParams.get('expiresAt');

  useEffect(() => {
    if (token && expiresAt) {
      setAuthSession(token, expiresAt).catch((err) => {
        console.error('Falha ao definir sessão:', err);
      });
    }
  }, [token, expiresAt]);

  return (
    <div style={styles.card} className="card-glass animate-fade-in">
      <h2 style={styles.title}>⏳ Conectando ao painel...</h2>
      <p style={styles.text}>Aguarde um momento enquanto estabelecemos sua sessão segura.</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div style={styles.container}>
      <Suspense
        fallback={
          <div style={styles.card} className="card-glass">
            <h2 style={styles.title}>⏳ Carregando...</h2>
          </div>
        }
      >
        <CallbackContent />
      </Suspense>
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
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
  },
  text: {
    fontSize: '14px',
    color: '#949ba4',
    lineHeight: 1.5,
  },
};
