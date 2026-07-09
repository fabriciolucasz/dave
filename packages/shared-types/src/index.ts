// ---------------------------------------------------------------------------
// Tipos compartilhados entre os serviços do monorepo Dave.
// Qualquer shape de dado que atravessa a fila ou é compartilhado entre
// apps deve ser definido aqui — evita duplicação e desalinhamento de contratos.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Payloads de jobs da fila (BullMQ)
// Cada app que produz jobs usa esses tipos; os workers que consomem também.
// ---------------------------------------------------------------------------

/** Dados publicados na fila quando um slash command é recebido pelo gateway. */
export interface CommandJobData {
  /** ID da interação do Discord — necessário para responder dentro do prazo de 3s. */
  interactionId: string;
  /** Token de interação — necessário para responder via REST sem o WebSocket do gateway. */
  interactionToken: string;
  /** ID do servidor onde o comando foi executado. */
  guildId: string;
  /** ID do usuário que executou o comando. */
  userId: string;
  /** Nome do comando (ex: "ping", "moderation ban"). */
  commandName: string;
  /**
   * Objeto completo da interação serializado como JSON string.
   * O gateway usa safeSerialize() para converter BigInt antes de enfileirar.
   * No bot-worker: `JSON.parse(rawInteraction as string)` para recuperar.
   */
  rawInteraction: string;
}

/** Dados publicados na fila quando uma interação de componente é recebida (botão, modal, select). */
export interface InteractionJobData {
  interactionId: string;
  interactionToken: string;
  guildId: string;
  userId: string;
  /** customId no formato `namespace:action:...payload` */
  customId: string;
  /** Tipo da interação: 'button' | 'modal' | 'select_menu' */
  componentType: 'button' | 'modal' | 'select_menu';
  /**
   * Objeto completo da interação serializado como JSON string.
   * O gateway usa safeSerialize() para converter BigInt antes de enfileirar.
   * No bot-worker: `JSON.parse(rawInteraction as string)` para recuperar.
   */
  rawInteraction: string;
}

/** Dados de jobs de billing — webhooks de pagamento, cron de expiração e sync de guilds. */
export interface BillingJobData {
  type: 'webhook' | 'expiry_check' | 'guild_sync';
  /**
   * Provedor de pagamento que originou o webhook.
   * Obrigatório quando type = 'webhook'.
   */
  provider?: 'mercado_pago' | 'stripe';
  /** Presente apenas quando type = 'webhook'. Payload bruto do provedor. */
  webhookPayload?: unknown;
  /** Presente apenas quando type = 'expiry_check'. Limita a verificação a uma guild específica. */
  guildId?: string;
  /** Presente apenas quando type = 'guild_sync'. ID do usuário a sincronizar. */
  userId?: string;
}

// ---------------------------------------------------------------------------
// Union types úteis para narrowing nos workers
// ---------------------------------------------------------------------------

export type AnyJobData = CommandJobData | InteractionJobData | BillingJobData;

// ---------------------------------------------------------------------------
// Tipos de domínio compartilhados
// ---------------------------------------------------------------------------

/** Status de assinatura de uma guild — espelha o enum do schema Prisma. */
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | 'TRIALING';

/** Provedor de pagamento — espelha o enum do schema Prisma. */
export type PaymentProvider = 'STRIPE' | 'MERCADO_PAGO';

/** Resultado do check de assinatura, retornado pelo middleware de billing. */
export interface SubscriptionCheckResult {
  isActive: boolean;
  status: SubscriptionStatus;
  planCode: string;
  /** ISO 8601 — quando a assinatura expira (ou expirou). */
  currentPeriodEnd: string;
}
