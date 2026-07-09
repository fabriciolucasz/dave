import type {
  ChatInputCommandInteraction,
  UserContextMenuCommandInteraction,
  Message,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ContextMenuCommandBuilder,
  PermissionResolvable,
} from 'discord.js';

// ---------------------------------------------------------------------------
// packages/discord-kit/src/commands/types.ts
//
// Sistema de criação de comandos — seção 7 do PLAN.md.
//
// União discriminada por `type` garante em tempo de compilação que:
//   - 'slash'  → requer description e build() retornando SlashCommandBuilder
//   - 'user'   → sem description (Discord não permite em User Commands)
//   - 'prefix' → sem registro na API do Discord; aceita aliases
//
// Campos comuns (name, isPremium, requiredPermissions, cooldownSeconds) ficam
// fora do discriminador para evitar repetir lógica de checagem em 3 lugares.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Campos compartilhados por todos os tipos de comando
// ---------------------------------------------------------------------------

export interface CommandCommon {
  /** Nome do comando. Para slash/user: deve ser lowercase sem espaços. */
  name: string;
  /**
   * Se true, requer assinatura ativa na guild antes de executar.
   * O middleware de subscription é aplicado automaticamente pelo CommandRegistry.
   */
  isPremium?: boolean;
  /**
   * Permissões do Discord necessárias para usar o comando.
   * Verificado pelo bot — o Discord também pode bloquear via Permission Overwrites.
   */
  requiredPermissions?: PermissionResolvable[];
  /**
   * Cooldown em segundos por usuário.
   * 0 = sem cooldown (padrão).
   */
  cooldownSeconds?: number;
}

// ---------------------------------------------------------------------------
// Slash Command — /comando [subcomando] [opções]
// ---------------------------------------------------------------------------

export type SlashCommandBuilderResult =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface SlashCommandDefinition extends CommandCommon {
  type: 'slash';
  /** Descrição exibida no menu do Discord (obrigatória para slash commands). */
  description: string;
  /**
   * Função que constrói o SlashCommandBuilder com opções, subcomandos, etc.
   * Separado em função para lazy-build: evita instanciar builders que nunca são registrados.
   *
   * @example
   * build: (b) => b.addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true))
   */
  build?: (builder: SlashCommandBuilder) => SlashCommandBuilderResult;
  /** Handler chamado quando o slash command é executado. */
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// ---------------------------------------------------------------------------
// User Application Command — menu de contexto ao clicar em um usuário
// ---------------------------------------------------------------------------

export interface UserCommandDefinition extends CommandCommon {
  type: 'user';
  // 'description' intencionalmente ausente — Discord não aceita descrição em User Commands
  /** Handler chamado quando o User Context Menu command é executado. */
  execute: (interaction: UserContextMenuCommandInteraction) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Prefix Command — comando ativado por prefixo de texto (ex: !ping, !ban)
// ---------------------------------------------------------------------------

export interface PrefixCommandDefinition extends CommandCommon {
  type: 'prefix';
  /** Aliases adicionais para o mesmo comando (ex: ['p', 'latency'] para um comando 'ping'). */
  aliases?: string[];
  /** Handler chamado quando o comando de texto é detectado. */
  execute: (message: Message, args: string[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// União discriminada
// ---------------------------------------------------------------------------

export type CommandDefinition =
  | SlashCommandDefinition
  | UserCommandDefinition
  | PrefixCommandDefinition;

// ---------------------------------------------------------------------------
// CommandModule — forma normalizada de um comando, independente do tipo.
// É o que o CommandRegistry armazena internamente.
// ---------------------------------------------------------------------------

export type CommandModule = CommandDefinition;
