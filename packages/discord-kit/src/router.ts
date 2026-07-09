import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  RoleSelectMenuInteraction,
  MentionableSelectMenuInteraction,
  ChannelSelectMenuInteraction,
} from 'discord.js';

// ---------------------------------------------------------------------------
// router.ts — seção 6.4 do PLAN.md (Router de customId)
//
// Problema que resolve: em um bot multi-tenant com dezenas de módulos,
// usar if/else para despachar interações por customId não escala.
//
// Solução: customId no formato `namespace:action:...payload`
//   - namespace → identifica o módulo (ex: "ticket", "economy", "moderation")
//   - action    → identifica o handler dentro do módulo (ex: "close", "transfer")
//   - payload   → dados adicionais opcionais (ex: "123" para o ID do ticket)
//
// PADRÃO (seção 7.2): Classe singleton exportada via módulo.
// Motivo: o mapa de handlers é estado que precisa persistir entre chamadas —
// diferente dos builders, aqui faz sentido manter estado.
// ---------------------------------------------------------------------------

/** Tipos de interação de componente suportados pelo router. */
export type ComponentInteraction =
  | ButtonInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | RoleSelectMenuInteraction
  | MentionableSelectMenuInteraction
  | ChannelSelectMenuInteraction;

/**
 * Handler de um namespace.
 * Cada namespace registra um objeto onde as chaves são as actions.
 *
 * @example
 * componentRouter.register('ticket', {
 *   async close(interaction, payload) {
 *     const [ticketId] = payload;
 *     // fecha o ticket...
 *   },
 * });
 */
export type ComponentHandler = Record<
  string,
  (interaction: ComponentInteraction, payload: string[]) => Promise<void>
>;

// ---------------------------------------------------------------------------
// Classe
// ---------------------------------------------------------------------------

class ComponentRouter {
  private readonly handlers = new Map<string, ComponentHandler>();

  /**
   * Registra um handler de namespace.
   * Chame no bootstrap de cada módulo/plugin.
   *
   * @param namespace - Deve ser único por módulo. Ex: "ticket", "economy".
   * @param handler - Objeto com as actions do namespace como métodos.
   *
   * @example
   * componentRouter.register('ticket', {
   *   async close(interaction, [ticketId]) { ... },
   *   async transfer(interaction, [ticketId, targetUserId]) { ... },
   * });
   */
  register(namespace: string, handler: ComponentHandler): void {
    if (this.handlers.has(namespace)) {
      console.warn(
        `[ComponentRouter] namespace "${namespace}" já registrado — sobrescrevendo.`,
      );
    }
    this.handlers.set(namespace, handler);
  }

  /**
   * Despacha uma interação de componente para o handler correto.
   * Faz o parse do customId e chama o método correspondente.
   *
   * Se o namespace ou a action não existirem, loga um aviso e retorna sem erro —
   * interações desconhecidas não devem derrubar o worker.
   *
   * @example
   * // customId: "ticket:close:42"
   * // → chama handlers.get('ticket').close(interaction, ['42'])
   */
  async dispatch(interaction: ComponentInteraction): Promise<void> {
    const parts = interaction.customId.split(':');
    const namespace = parts[0];
    const action = parts[1];
    const payload = parts.slice(2);

    if (!namespace || !action) {
      console.warn(
        `[ComponentRouter] customId inválido: "${interaction.customId}". ` +
          'Formato esperado: namespace:action[:payload...]',
      );
      return;
    }

    const handler = this.handlers.get(namespace);

    if (!handler) {
      console.warn(
        `[ComponentRouter] Nenhum handler registrado para o namespace "${namespace}".`,
      );
      return;
    }

    const actionFn = handler[action];

    if (typeof actionFn !== 'function') {
      console.warn(
        `[ComponentRouter] Namespace "${namespace}" não possui a action "${action}".`,
      );
      return;
    }

    await actionFn(interaction, payload);
  }

  /**
   * Lista todos os namespaces registrados.
   * Útil para logs de bootstrap e debugging.
   */
  getRegisteredNamespaces(): string[] {
    return [...this.handlers.keys()];
  }
}

// ---------------------------------------------------------------------------
// Singleton (padrão seção 7.2) — uma única instância no processo todo.
// ---------------------------------------------------------------------------

/** Router singleton de interações de componentes. Use `componentRouter.register()` para registrar handlers. */
export const componentRouter = new ComponentRouter();
