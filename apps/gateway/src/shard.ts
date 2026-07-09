import {
  Client,
  GatewayIntentBits,
  type Interaction,
  InteractionType,
} from 'discord.js';
import { commandsQueue, interactionsQueue } from '@dave/queue';
import { env } from '@dave/config';
import type { CommandJobData, InteractionJobData } from '@dave/shared-types';

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
        // O bot-worker recupera com JSON.parse(rawInteraction as string).
        rawInteraction: safeSerialize(interaction.toJSON()),
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
        rawInteraction: safeSerialize(interaction.toJSON()),
      };

      await interactionsQueue.add(`interaction:${interaction.customId}`, jobData, {
        priority: 1,
      });
    }
  } catch (error) {
    console.error('[Gateway Shard] Erro ao enfileirar interação:', error);
  }
});

client.on('error', (error) => {
  console.error('[Gateway Shard] Erro do cliente Discord:', error);
});

await client.login(env.DISCORD_TOKEN);
