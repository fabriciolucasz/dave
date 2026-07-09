// apps/dashboard/src/lib/api.ts
import { cookies } from 'next/headers';
import { env } from '@dave/config';

// ---------------------------------------------------------------------------
// Cliente REST API para o Dashboard (Server-Side)
//
// Encapsula chamadas HTTP para o backend Hono, anexando o token da sessão
// lido automaticamente dos cookies.
// ---------------------------------------------------------------------------

export interface ApiErrorPayload {
  error: string;
  message?: string;
  requiresSubscription?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public payload: ApiErrorPayload
  ) {
    super(payload.message || payload.error);
    this.name = 'ApiError';
  }
}

/**
 * Executa uma chamada para o Hono REST API do lado do servidor.
 */
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get('discord_access_token')?.value;

  // Garante barra no início do path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${env.API_BASE_URL}${normalizedPath}`;

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let payload: ApiErrorPayload;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = { error: 'Erro desconhecido', message: `Status code ${response.status}` };
    }
    throw new ApiError(response.status, payload);
  }

  return (await response.json()) as T;
}
