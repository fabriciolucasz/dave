// apps/dashboard/src/app/auth/actions.ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Define o cookie de sessão 'discord_access_token' de forma segura (httpOnly)
 * e redireciona o usuário para o dashboard.
 */
export async function setAuthSession(token: string, expiresAt: string): Promise<never> {
  const cookieStore = await cookies();

  cookieStore.set('discord_access_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/',
  });

  redirect('/dashboard');
}

/**
 * Remove o cookie de sessão para efetuar logout e redireciona para a home.
 */
export async function clearAuthSession(): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.delete('discord_access_token');
  redirect('/');
}
