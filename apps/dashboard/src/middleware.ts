// apps/dashboard/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Next.js Middleware
//
// Protege rotas sensíveis do painel (sob /dashboard e /account) garantindo que
// o cookie de sessão 'discord_access_token' esteja presente.
// Caso contrário, redireciona o usuário para a página de /login.
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const token = request.cookies.get('discord_access_token')?.value;
  const url = request.nextUrl.clone();

  // Verifica se a rota requer login e não há token na requisição
  if (!token && (url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/account'))) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Configura em quais rotas o middleware será executado
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/account/:path*',
  ],
};
