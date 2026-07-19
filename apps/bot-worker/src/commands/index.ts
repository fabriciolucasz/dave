import type { ChatInputCommandInteraction, UserContextMenuCommandInteraction, Message } from 'discord.js';
import { commandRegistry, createResponder, warningEmbed } from '@dave/discord-kit';
import { checkSubscription } from '../middleware/subscription.js';

// ---------------------------------------------------------------------------
// apps/bot-worker/src/commands/index.ts — auto-loader e dispatcher
//
// Registra todos os comandos no commandRegistry (singleton do discord-kit).
// Adicionar um novo comando = criar o arquivo com defineCommand() e importar aqui.
//
// O commandRegistry separa slash/user/prefix internamente —
// getRegisterableCommands() é usado pelo deploy-commands para enviar à API.
// ---------------------------------------------------------------------------

// --- Importa e registra todos os comandos ---
import { pingCommand } from './ping.js';
import { setupCommand } from './setup.js';
import { assinarCommand } from './assinar.js';
import { containerCommand } from './container.js';

commandRegistry.register(pingCommand);
commandRegistry.register(setupCommand);
commandRegistry.register(assinarCommand);
commandRegistry.register(containerCommand);

console.log(
  `[CommandLoader] Registrados: slash=[${commandRegistry.getRegisteredSlashNames().join(', ')}]` +
  ` user=[${commandRegistry.getRegisteredUserNames().join(', ') || 'nenhum'}]` +
  ` prefix=[${commandRegistry.getRegisteredPrefixNames().join(', ') || 'nenhum'}]`,
);

// ---------------------------------------------------------------------------
// Dispatchers — chamados pelos workers BullMQ
// ---------------------------------------------------------------------------

/**
 * Despacha um slash command para o handler correto.
 * Aplica middleware de subscription para comandos marcados com isPremium.
 */
export async function dispatchCommand(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const mod = commandRegistry.getSlash(interaction.commandName);

  if (!mod) {
    console.warn(`[CommandLoader] Slash command desconhecido: "/${interaction.commandName}"`);
    return false;
  }

  // Middleware de subscription: bloqueia o bot inteiro exceto /setup e /assinar
  const isExcludedCommand = ['setup', 'assinar'].includes(interaction.commandName);
  if (!isExcludedCommand && interaction.guildId) {
    const sub = await checkSubscription(interaction.guildId);

    if (!sub.isActive) {
      const responder = createResponder(interaction);
      await responder.sendEphemeral({
        embeds: [
          warningEmbed(
            '⏸️ Assinatura Inativa',
            'Este servidor não possui uma assinatura ativa.\n\n' +
              '**Boa notícia:** toda a configuração já feita (painéis, itens do baú, cidades cadastradas) está preservada e voltará a funcionar assim que a assinatura for reativada.\n\n' +
              'Para reativar, use o comando `/assinar`.',
          ),
        ],
      });
      return false;
    }
  }

  await mod.execute(interaction);
  return true;
}

/**
 * Despacha um User Application Command.
 */
export async function dispatchUserCommand(
  interaction: UserContextMenuCommandInteraction,
): Promise<boolean> {
  const mod = commandRegistry.getUser(interaction.commandName);

  if (!mod) {
    console.warn(`[CommandLoader] User command desconhecido: "${interaction.commandName}"`);
    return false;
  }

  if (interaction.guildId) {
    const sub = await checkSubscription(interaction.guildId);
    if (!sub.isActive) {
      const responder = createResponder(interaction as any);
      await responder.sendEphemeral({
        embeds: [
          warningEmbed(
            '⏸️ Assinatura Inativa',
            'Este servidor não possui uma assinatura ativa.\n\n' +
              '**Boa notícia:** toda a configuração já feita está preservada e voltará a funcionar ao reativar.\n\n' +
              'Para reativar, use o comando `/assinar`.',
          ),
        ],
      });
      return false;
    }
  }

  await mod.execute(interaction);
  return true;
}

/**
 * Despacha um prefix command pelo texto recebido.
 * @param nameOrAlias - O nome ou alias do comando (sem o prefixo)
 * @param message - A mensagem do Discord
 * @param args - Argumentos após o comando
 */
export async function dispatchPrefixCommand(
  nameOrAlias: string,
  message: Message,
  args: string[],
): Promise<boolean> {
  const mod = commandRegistry.getPrefix(nameOrAlias);

  if (!mod) return false;

  const isExcludedCommand = ['setup', 'assinar'].includes(nameOrAlias);
  if (!isExcludedCommand && message.guildId) {
    const sub = await checkSubscription(message.guildId);
    if (!sub.isActive) {
      await message.reply({
        embeds: [
          warningEmbed(
            '⏸️ Assinatura Inativa',
            'Este servidor não possui uma assinatura ativa.\n\n' +
              '**Boa notícia:** toda a configuração está preservada. Reative com `/assinar`.',
          ),
        ],
      });
      return false;
    }
  }

  await mod.execute(message, args);
  return true;
}

/**
 * Retorna true se o erro for "Interaction has already been acknowledged" (código 40060).
 * Nesse caso, o BullMQ não deve retentar o job.
 */
export function isAlreadyAcknowledged(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 40060
  );
}
