import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema de variáveis de ambiente — validado com Zod na inicialização.
// Todos os apps/packages importam `env` daqui, nunca `process.env` direto.
// Se uma variável obrigatória estiver ausente, o processo falha imediatamente
// com uma mensagem clara — melhor do que descobrir em runtime com undefined.
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // --- Postgres ---
  DATABASE_URL: z.string().url('DATABASE_URL deve ser uma URL válida'),

  // --- Redis ---
  REDIS_URL: z.string().url('REDIS_URL deve ser uma URL válida'),

  // --- API ---
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),

  // --- Discord ---
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN é obrigatório'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID é obrigatório'),
  DISCORD_CLIENT_SECRET: z.string().min(1, 'DISCORD_CLIENT_SECRET é obrigatório'),

  // --- Billing ---
  // Opcionais no desenvolvimento, obrigatórios em produção quando billing estiver ativo.

  // Mercado Pago (provedor primário)
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional(),

  // Stripe (provedor secundário / legado)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // --- Node / Bun ---
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Variáveis de ambiente inválidas:');
    if (error instanceof Error && 'issues' in error) {
      const zodError = error as { issues: Array<{ path: string[]; message: string }> };
      for (const issue of zodError.issues) {
        console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// Singleton via módulo — executado uma única vez quando o módulo é importado.
export const env = parseEnv();
