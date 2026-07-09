import {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} from 'discord.js';
import type {
  CommandDefinition,
  SlashCommandDefinition,
  UserCommandDefinition,
  PrefixCommandDefinition,
  SlashCommandBuilderResult,
} from './types.js';

// ---------------------------------------------------------------------------
// packages/discord-kit/src/commands/define-command.ts
//
// Factory function `defineCommand()` — seção 7.2 do PLAN.md.
//
// Entrada: uma definição de comando com discriminador `type`.
// Saída: o mesmo objeto (type-checked), pronto para ser registrado no
//        CommandRegistry.
//
// Por que usar defineCommand() em vez de um objeto literal simples?
//   1. Inferência de tipo: o TypeScript resolve o discriminador `type` e
//      garante que apenas os campos corretos estejam presentes.
//   2. Ponto central para adicionar defaults ou validação futura (ex: prefixo
//      padrão, sanitização do nome do comando).
//   3. Consistência: todos os arquivos de comando usam o mesmo padrão.
// ---------------------------------------------------------------------------

/** Cria um Slash Command. TypeScript garante que `description` e `execute` estão presentes. */
export function defineCommand(definition: SlashCommandDefinition): SlashCommandDefinition;
/** Cria um User Application Command. TypeScript garante que `description` está AUSENTE. */
export function defineCommand(definition: UserCommandDefinition): UserCommandDefinition;
/** Cria um Prefix Command. TypeScript garante que `aliases` é válido e que o comando não será registrado no Discord. */
export function defineCommand(definition: PrefixCommandDefinition): PrefixCommandDefinition;
/** Overload genérico — não use diretamente; prefira os overloads específicos. */
export function defineCommand(definition: CommandDefinition): CommandDefinition {
  return definition;
}

// ---------------------------------------------------------------------------
// Builders de payload para registro na API do Discord
// (usados pelo deploy-commands, não pelos handlers em runtime)
// ---------------------------------------------------------------------------

/**
 * Constrói o payload de um SlashCommandDefinition para a API do Discord.
 * Retorna um SlashCommandBuilder configurado com nome, descrição e opções.
 */
export function buildSlashPayload(def: SlashCommandDefinition): SlashCommandBuilderResult {
  const builder = new SlashCommandBuilder()
    .setName(def.name)
    .setDescription(def.description);

  return def.build ? def.build(builder) : builder;
}

/**
 * Constrói o payload de um UserCommandDefinition para a API do Discord.
 * User Commands não têm description — o Discord não aceita.
 */
export function buildUserCommandPayload(def: UserCommandDefinition): ContextMenuCommandBuilder {
  return new ContextMenuCommandBuilder()
    .setName(def.name)
    .setType(ApplicationCommandType.User);
}
