import { buildSlashPayload, buildUserCommandPayload } from './define-command.js';
import type {
  CommandDefinition,
  SlashCommandDefinition,
  UserCommandDefinition,
  PrefixCommandDefinition,
  SlashCommandBuilderResult,
} from './types.js';
import type { ContextMenuCommandBuilder } from 'discord.js';

// ---------------------------------------------------------------------------
// packages/discord-kit/src/commands/registry.ts
//
// CommandRegistry — seção 7.3 do PLAN.md.
//
// Armazena todos os comandos registrados, separados por destino:
//   - slashCommands  → registrados na API do Discord (/comando)
//   - userCommands   → registrados na API do Discord (menu de contexto)
//   - prefixCommands → interpretados internamente pelo bot (por texto)
//
// É uma classe singleton (instanciada e exportada como `commandRegistry`)
// porque guarda estado real (mapa de comandos) que persiste entre chamadas.
// Veja seção 8.2 do PLAN.md para o critério de instanciação.
// ---------------------------------------------------------------------------

export class CommandRegistry {
  /** Slash commands indexados por nome. */
  private readonly slashCommands = new Map<string, SlashCommandDefinition>();
  /** User Application Commands indexados por nome. */
  private readonly userCommands = new Map<string, UserCommandDefinition>();
  /**
   * Prefix commands indexados por nome E por aliases.
   * Se um comando tem aliases: ['p', 'latency'], todas as chaves apontam para o mesmo módulo.
   */
  private readonly prefixCommands = new Map<string, PrefixCommandDefinition>();

  // ---------------------------------------------------------------------------
  // Registro
  // ---------------------------------------------------------------------------

  /**
   * Registra um comando. O tipo é inferido automaticamente pelo discriminador.
   *
   * @throws {Error} Se um comando com o mesmo nome (ou alias) já estiver registrado.
   */
  register(definition: CommandDefinition): this {
    switch (definition.type) {
      case 'slash':
        this.assertNotDuplicate(definition.name, 'slash');
        this.slashCommands.set(definition.name, definition);
        break;

      case 'user':
        this.assertNotDuplicate(definition.name, 'user');
        this.userCommands.set(definition.name, definition);
        break;

      case 'prefix': {
        const allKeys = [definition.name, ...(definition.aliases ?? [])];
        for (const key of allKeys) {
          this.assertNotDuplicate(key, 'prefix');
          this.prefixCommands.set(key, definition);
        }
        break;
      }
    }

    return this; // fluent API: commandRegistry.register(a).register(b)
  }

  // ---------------------------------------------------------------------------
  // Lookup — usados pelo bot-worker para despachar comandos em runtime
  // ---------------------------------------------------------------------------

  /** Busca um slash command pelo nome exato. */
  getSlash(name: string): SlashCommandDefinition | undefined {
    return this.slashCommands.get(name);
  }

  /** Busca um user command pelo nome exato. */
  getUser(name: string): UserCommandDefinition | undefined {
    return this.userCommands.get(name);
  }

  /**
   * Busca um prefix command pelo nome ou alias.
   * Retorna o módulo canônico independente do alias usado para ativar.
   */
  getPrefix(nameOrAlias: string): PrefixCommandDefinition | undefined {
    return this.prefixCommands.get(nameOrAlias);
  }

  // ---------------------------------------------------------------------------
  // Deploy — usados pelo script deploy-commands
  // ---------------------------------------------------------------------------

  /**
   * Retorna todos os payloads prontos para enviar à API do Discord.
   * Inclui slash commands e user commands — prefix commands NUNCA são registrados no Discord.
   */
  getRegisterableCommands(): (SlashCommandBuilderResult | ContextMenuCommandBuilder)[] {
    const slashPayloads = [...this.slashCommands.values()].map(buildSlashPayload);
    const userPayloads = [...this.userCommands.values()].map(buildUserCommandPayload);
    return [...slashPayloads, ...userPayloads];
  }

  // ---------------------------------------------------------------------------
  // Introspection (para logs e debugging)
  // ---------------------------------------------------------------------------

  getRegisteredSlashNames(): string[] {
    return [...this.slashCommands.keys()];
  }

  getRegisteredUserNames(): string[] {
    return [...this.userCommands.keys()];
  }

  getRegisteredPrefixNames(): string[] {
    // Retorna apenas os nomes canônicos (não aliases)
    return [...new Set([...this.prefixCommands.values()].map((d) => d.name))];
  }

  /** Total de comandos registrados (sem contar aliases duplicados). */
  get size(): number {
    return this.slashCommands.size + this.userCommands.size + this.getRegisteredPrefixNames().length;
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private assertNotDuplicate(name: string, type: string): void {
    const alreadyExists =
      this.slashCommands.has(name) ||
      this.userCommands.has(name) ||
      this.prefixCommands.has(name);

    if (alreadyExists) {
      throw new Error(
        `[CommandRegistry] Conflito: comando/alias "${name}" (type: ${type}) já está registrado.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton — uma única instância por processo (seção 8.2 do PLAN.md)
// ---------------------------------------------------------------------------

/**
 * Instância singleton do CommandRegistry.
 * Importe e use diretamente — não instancie CommandRegistry manualmente.
 *
 * @example
 * import { commandRegistry } from '@dave/discord-kit';
 * commandRegistry.register(pingCommand);
 */
export const commandRegistry = new CommandRegistry();
