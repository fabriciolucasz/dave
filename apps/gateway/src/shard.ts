import {
  Client,
  GatewayIntentBits,
  Partials,
  type Interaction,
  InteractionType,
} from 'discord.js';
import { commandsQueue, interactionsQueue, containerRepostQueue, guildOnboardingQueue } from '@dave/queue';
import { env } from '@dave/config';
import type { CommandJobData, InteractionJobData, ContainerRepostJobData, GuildOnboardingJobData } from '@dave/shared-types';

// ---------------------------------------------------------------------------
// shard.ts — o processo filho (shard) em si.
//
// Cada shard mantém uma conexão WebSocket com o Discord e NÃO executa
// lógica de negócio — apenas serializa eventos e publica na fila (BullMQ).
//
// Princípio (seção 3.1 do PLAN.md): separar recepção de eventos do
// processamento. Um comando pesado ou com bug não afeta o heartbeat do gateway.
// ---------------------------------------------------------------------------

/**
 * Serializa um valor para JSON de forma segura, convertendo BigInt para string.
 *
 * O Discord.js representa permissões (PermissionsBitField) como BigInt.
 * O BullMQ usa JSON.stringify internamente para enfileirar jobs, o que quebra
 * com BigInt. Serializamos para string aqui e o bot-worker faz JSON.parse.
 */
function safeSerialize(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
  rest: {
    // Timeout REST mais curto no gateway — ele não executa comandos,
    // apenas publica na fila. Operações pesadas ficam no bot-worker.
    timeout: 10_000,
  },
});

client.once('clientReady', (c) => {
  console.log(`[Gateway Shard] Conectado como ${c.user.tag} (${c.guilds.cache.size} guilds)`);
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.guildId) return; // ignora DMs por ora

  try {
    if (interaction.isChatInputCommand()) {
      const jobData: CommandJobData = {
        interactionId: interaction.id,
        interactionToken: interaction.token,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        commandName: interaction.commandName,
        // Serializado como string para evitar erro BigInt no JSON.stringify do BullMQ.
        rawInteraction: safeSerialize({
          ...(interaction.toJSON() as Record<string, unknown>),
          memberPermissions: interaction.memberPermissions?.bitfield,
        }),
      };

      await commandsQueue.add(`cmd:${interaction.commandName}`, jobData, {
        // Prioridade menor = mais urgente no BullMQ
        priority: 1,
      });

      return;
    }

    // Interações de componentes: botões, modais, selects
    if (
      interaction.isButton() ||
      interaction.isModalSubmit() ||
      interaction.isAnySelectMenu()
    ) {
      let componentType: InteractionJobData['componentType'];

      if (interaction.isButton()) componentType = 'button';
      else if (interaction.isModalSubmit()) componentType = 'modal';
      else componentType = 'select_menu';

      const jobData: InteractionJobData = {
        interactionId: interaction.id,
        interactionToken: interaction.token,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        customId: interaction.customId,
        componentType,
        // Serializado como string para evitar erro BigInt no JSON.stringify do BullMQ.
        rawInteraction: safeSerialize({
          ...(interaction.toJSON() as Record<string, unknown>),
          memberPermissions: interaction.memberPermissions?.bitfield,
        }),
      };

      await interactionsQueue.add(`interaction:${interaction.customId}`, jobData, {
        priority: 1,
      });
    }
  } catch (error) {
    console.error('[Gateway Shard] Erro ao enfileirar interação:', error);
  }
});

client.on('guildCreate', async (guild) => {
  console.log(`[Gateway Shard] Bot entrou em novo servidor: ${guild.name} (${guild.id})`);
  try {
    const jobData: GuildOnboardingJobData = {
      type: 'guild_onboarding',
      guildId: guild.id,
      ownerDiscordId: guild.ownerId,
      guildName: guild.name,
    };
    await guildOnboardingQueue.add(`onboarding:${guild.id}`, jobData);
  } catch (error) {
    console.error('[Gateway Shard] Erro ao enfileirar onboarding:', error);
  }
});

client.on('guildDelete', async (guild) => {
  console.log(`[Gateway Shard] Bot removido do servidor: ${guild.id}`);
  try {
    const jobData: GuildOnboardingJobData = {
      type: 'guild_offboarding',
      guildId: guild.id,
    };
    await guildOnboardingQueue.add(`offboarding:${guild.id}`, jobData);
  } catch (error) {
    console.error('[Gateway Shard] Erro ao enfileirar offboarding:', error);
  }
});

client.on('messageDelete', async (message) => {
  if (!message.guildId) return;

  try {
    const jobData: ContainerRepostJobData = {
      type: 'container_repost',
      containerId: '', // O bot-worker buscará por messageId no banco
      guildId: message.guildId,
      channelId: message.channelId,
      delaySeconds: 30, // Delay padrão
      messageId: message.id,
    };
    await containerRepostQueue.add(`delete:${message.id}`, jobData);
  } catch (error) {
    console.error('[Gateway Shard] Erro ao enfileirar messageDelete para container:', error);
  }
});

client.on('error', (error) => {
  console.error('[Gateway Shard] Erro do cliente Discord:', error);
});

await client.login(env.DISCORD_TOKEN);
