import { Worker, type Job } from 'bullmq';
import { REST, Routes, InteractionResponseType, MessageFlags, PermissionsBitField } from 'discord.js';
import { createRedisConnection, QUEUE_NAMES } from '@dave/queue';
import { env } from '@dave/config';
import type { CommandJobData, InteractionJobData, ContainerRepostJobData, GuildOnboardingJobData } from '@dave/shared-types';
import { dispatchCommand, isAlreadyAcknowledged } from './commands/index.js';
import { registerInteractionHandlers, dispatchInteraction } from './interactions/router.js';
import type { ComponentInteraction } from '@dave/discord-kit';
import { handleGuildOnboarding } from './jobs/guild-onboarding.js';
import { handleContainerRepost } from './jobs/container-repost.js';

// ---------------------------------------------------------------------------
// apps/bot-worker/src/index.ts — entry point do bot-worker
//
// Responsabilidades:
//   1. Registrar handlers de interações (componentRouter).
//   2. Iniciar workers BullMQ para as filas de commands e interactions.
//   3. Reconstituir objetos de interação do Discord a partir do payload raw.
//
// NÃO mantém conexão WebSocket com o Discord — isso é responsabilidade do gateway.
// Usa a REST API do discord.js para responder às interações via token.
//
// Nota sobre rawInteraction:
//   O gateway serializa interaction.toJSON() como JSON string (para evitar
//   BigInt no BullMQ). Aqui fazemos JSON.parse para recuperar o objeto.
//   O objeto raw NÃO é uma instância de Interaction do discord.js —
//   é usado como dados de contexto para os handlers.
// ---------------------------------------------------------------------------

// Cliente REST para responder interações sem WebSocket
export const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

// Registra os handlers de componentes antes de iniciar os workers
registerInteractionHandlers();

// ---------------------------------------------------------------------------
// Worker de comandos (slash commands)
// ---------------------------------------------------------------------------

const commandWorker = new Worker<CommandJobData>(
  QUEUE_NAMES.COMMANDS,
  async (job) => {
    const { commandName, interactionId, interactionToken, guildId, rawInteraction } = job.data;

    console.log(`[BotWorker] Processando comando: /${commandName} (job ${job.id})`);

    // rawInteraction chega como JSON string do gateway (safeSerialize no shard.ts).
    const rawData = JSON.parse(rawInteraction) as Record<string, unknown>;

    // Monta um objeto mínimo compatível com a interface esperada pelos handlers.
    // Os handlers usam createResponder(interaction) que chama interaction.reply/editReply,
    // porém neste contexto sem WebSocket, precisamos de um proxy REST.
    const interaction = buildInteractionProxy({
      id: interactionId,
      token: interactionToken,
      guildId,
      commandName,
      rawData,
      type: 'command',
    }) as unknown as Parameters<typeof dispatchCommand>[0];

    try {
      await dispatchCommand(interaction);
    } catch (error) {
      // Erro 40060: "Interaction has already been acknowledged"
      // Acontece quando o BullMQ retenta um job cujo defer já foi enviado ao Discord.
      // Não há nada a fazer — a interação já foi respondida. Não deve retentar.
      if (isAlreadyAcknowledged(error)) {
        console.warn(`[BotWorker] Job ${job.id}: interação já respondida (40060) — ignorando retry.`);
        return; // Retorna sem throw: BullMQ marca como completed
      }
      console.error(`[BotWorker] Erro ao processar comando /${commandName}:`, error);
      throw error; // BullMQ faz retry automaticamente
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 10,
  },
);

// ---------------------------------------------------------------------------
// Worker de interações de componentes (botões, modais, selects)
// ---------------------------------------------------------------------------

const interactionWorker = new Worker<InteractionJobData>(
  QUEUE_NAMES.INTERACTIONS,
  async (job) => {
    const { customId, interactionId, interactionToken, guildId, componentType, rawInteraction } =
      job.data;

    console.log(`[BotWorker] Processando interação: ${customId} (job ${job.id})`);

    const rawData = JSON.parse(rawInteraction) as Record<string, unknown>;

    const interaction = buildInteractionProxy({
      id: interactionId,
      token: interactionToken,
      guildId,
      customId,
      rawData,
      type: componentType,
    }) as unknown as ComponentInteraction;

    try {
      await dispatchInteraction(interaction);
    } catch (error) {
      if (isAlreadyAcknowledged(error)) {
        console.warn(`[BotWorker] Job ${job.id}: interação já respondida (40060) — ignorando retry.`);
        return;
      }
      console.error(`[BotWorker] Erro ao processar interação ${customId}:`, error);
      throw error;
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 20,
  },
);

// ---------------------------------------------------------------------------
// Worker de onboarding de guilds
// ---------------------------------------------------------------------------

const onboardingWorker = new Worker<GuildOnboardingJobData>(
  QUEUE_NAMES.GUILD_ONBOARDING,
  async (job) => {
    console.log(`[BotWorker] Processando onboarding da guild: ${job.data.guildName ?? job.data.guildId} (job ${job.id})`);
    try {
      await handleGuildOnboarding(job.data);
    } catch (error) {
      console.error(`[BotWorker] Erro ao processar onboarding para a guild ${job.data.guildId}:`, error);
      throw error;
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
  },
);

// ---------------------------------------------------------------------------
// Worker de repostagem de containers persistentes ("sticky messages")
// ---------------------------------------------------------------------------

const containerRepostWorker = new Worker<ContainerRepostJobData>(
  QUEUE_NAMES.CONTAINER_REPOST,
  async (job) => {
    console.log(`[BotWorker] Processando repost de container: ${job.data.containerId || job.data.messageId} (job ${job.id})`);
    try {
      await handleContainerRepost(job.data);
    } catch (error) {
      console.error(`[BotWorker] Erro ao processar repost de container:`, error);
      throw error;
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
  },
);

// ---------------------------------------------------------------------------
// buildInteractionProxy — proxy REST para responder interações sem WebSocket
//
// Cria um objeto que imita a interface de Interaction do discord.js,
// mas usa o REST API diretamente para responder (sem o WebSocket do gateway).
//
// Os campos `replied` e `deferred` são rastreados localmente por job.
// ---------------------------------------------------------------------------

interface ProxyOptions {
  id: string;
  token: string;
  guildId: string;
  commandName?: string;
  customId?: string;
  rawData: Record<string, unknown>;
  type: string;
}

function buildInteractionProxy(opts: ProxyOptions) {
  let replied = false;
  let deferred = false;

  async function sendResponse(data: Record<string, unknown>, type: number) {
    await rest.post(Routes.interactionCallback(opts.id, opts.token), { body: { type, data } });
    replied = true;
  }

  async function editResponse(data: Record<string, unknown>) {
    await rest.patch(Routes.webhookMessage(env.DISCORD_CLIENT_ID, opts.token), { body: data });
  }

  return {
    id: opts.id,
    token: opts.token,
    guildId: opts.guildId,
    commandName: opts.commandName,
    customId: opts.customId,
    // Estado de resposta
    get replied() { return replied; },
    get deferred() { return deferred; },
    // Dados brutos do Discord
    user: {
      id: (opts.rawData['member'] as Record<string, unknown>)?.['user']
        ? ((opts.rawData['member'] as Record<string, unknown>)['user'] as Record<string, unknown>)?.['id']
        : opts.rawData['user']
          ? (opts.rawData['user'] as Record<string, unknown>)['id']
          : 'unknown',
    },
    memberPermissions: (() => {
      const perms = opts.rawData['memberPermissions'] ?? (opts.rawData['member'] as Record<string, unknown> | undefined)?.['permissions'];
      if (perms !== undefined && perms !== null) {
        try {
          return new PermissionsBitField(BigInt(perms as string | number | bigint));
        } catch (e) {
          console.warn('[BotWorker] Falha ao converter perms para BigInt:', perms, e);
        }
      }
      return null;
    })(),
    options: (() => {
      const data = opts.rawData['data'] as Record<string, unknown> | undefined;
      const optionsArray = data?.['options'] as any[] | undefined;

      // Encontra se há um subcomando selecionado (type = 1 ou type = 2)
      const subCommandOpt = optionsArray?.find((opt) => opt.type === 1 || opt.type === 2);

      // Se houver subcomando, o array real de opções está aninhado dentro dele
      const activeOptions = subCommandOpt ? (subCommandOpt.options as any[]) : optionsArray;

      return {
        getSubcommand: () => {
          return subCommandOpt?.name ?? null;
        },
        getString: (name: string, required?: boolean) => {
          const opt = activeOptions?.find((o) => o.name === name);
          return (opt?.value as string) ?? null;
        },
        getChannel: (name: string) => {
          const opt = activeOptions?.find((o) => o.name === name);
          if (opt && opt.value) {
            return { id: opt.value as string };
          }
          return null;
        },
        getRole: (name: string) => {
          const opt = activeOptions?.find((o) => o.name === name);
          if (opt && opt.value) {
            return { id: opt.value as string };
          }
          return null;
        },
        getUser: (name: string) => {
          const opt = activeOptions?.find((o) => o.name === name);
          if (opt && opt.value) {
            return { id: opt.value as string };
          }
          return null;
        },
        getInteger: (name: string) => {
          const opt = activeOptions?.find((o) => o.name === name);
          return opt?.value !== undefined ? Number(opt.value) : null;
        },
        getNumber: (name: string) => {
          const opt = activeOptions?.find((o) => o.name === name);
          return opt?.value !== undefined ? Number(opt.value) : null;
        },
        getBoolean: (name: string) => {
          const opt = activeOptions?.find((o) => o.name === name);
          return opt?.value !== undefined ? Boolean(opt.value) : null;
        },
      };
    })(),
    // Métodos de resposta via REST
    async reply(options: Record<string, unknown>) {
      const flags = buildFlags(options);
      await sendResponse({ ...options, flags }, InteractionResponseType.ChannelMessageWithSource);
    },
    async deferReply(options?: { flags?: number }) {
      if (!deferred && !replied) {
        const flags = options?.flags ?? 0;
        await rest.post(Routes.interactionCallback(opts.id, opts.token), {
          body: { type: InteractionResponseType.DeferredChannelMessageWithSource, data: { flags } },
        });
        deferred = true;
      }
    },
    async editReply(options: Record<string, unknown>) {
      await editResponse(options);
    },
    async followUp(options: Record<string, unknown>) {
      const flags = buildFlags(options);
      await rest.post(Routes.webhook(env.DISCORD_CLIENT_ID, opts.token), { body: { ...options, flags } });
    },
    async update(options: Record<string, unknown>) {
      await sendResponse(options, InteractionResponseType.UpdateMessage);
    },
    // Helpers de tipo
    isChatInputCommand: () => opts.type === 'command',
    isButton: () => opts.type === 'button',
    isModalSubmit: () => opts.type === 'modal',
    isAnySelectMenu: () => opts.type === 'select_menu',
    isStringSelectMenu: () => opts.type === 'select_menu',
  };
}

function buildFlags(options: Record<string, unknown>): number {
  let flags = (options['flags'] as number) ?? 0;
  if (options['ephemeral']) flags |= MessageFlags.Ephemeral;
  return flags;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

commandWorker.on('completed', (job: Job<CommandJobData>) => {
  console.log(`[BotWorker] Comando job ${job.id} concluído.`);
});

commandWorker.on('failed', (job: Job<CommandJobData> | undefined, err: Error) => {
  console.error(`[BotWorker] Comando job ${job?.id} falhou:`, err.message);
});

interactionWorker.on('failed', (job: Job<InteractionJobData> | undefined, err: Error) => {
  console.error(`[BotWorker] Interação job ${job?.id} falhou:`, err.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[BotWorker] SIGTERM recebido — fechando workers...');
  await commandWorker.close();
  await interactionWorker.close();
  await onboardingWorker.close();
  await containerRepostWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[BotWorker] SIGINT recebido — fechando workers...');
  await commandWorker.close();
  await interactionWorker.close();
  await onboardingWorker.close();
  await containerRepostWorker.close();
  process.exit(0);
});

console.log('[BotWorker] Workers iniciados. Aguardando jobs...');
