import type { ComponentInteraction } from '@dave/discord-kit';
import { componentRouter } from '@dave/discord-kit';

// ---------------------------------------------------------------------------
// interactions/router.ts — despacha interações de componente para o componentRouter.
//
// O componentRouter (singleton em @dave/discord-kit) deve ter seus handlers
// registrados antes que qualquer interação chegue. O registro acontece neste
// arquivo, na função registerInteractionHandlers(), chamada no bootstrap.
//
// Padrão de customId: namespace:action:...payload
// ---------------------------------------------------------------------------

import { setupInteractionHandlers } from '../commands/setup.js';
import { assinarInteractionHandlers } from '../commands/assinar.js';

/**
 * Registra todos os handlers de componentes no componentRouter.
 * Chame uma única vez no bootstrap do bot-worker, antes de iniciar os workers.
 *
 * @example
 * // apps/bot-worker/src/index.ts
 * registerInteractionHandlers();
 */
export function registerInteractionHandlers(): void {
  // Registra as interações do assistente de configuração (/setup)
  componentRouter.register('setup', {
    async channel(interaction) {
      await setupInteractionHandlers.handleChannelSelect(interaction);
    },
    async roles(interaction, payload) {
      await setupInteractionHandlers.handleRolesSelect(interaction, payload);
    },
    async confirm(interaction, payload) {
      await setupInteractionHandlers.handleConfirm(interaction, payload);
    },
    async refazer(interaction) {
      await setupInteractionHandlers.handleRestart(interaction);
    },
  });

  // Registra as interações do comando /assinar
  componentRouter.register('assinar', {
    async checkout(interaction, payload) {
      await assinarInteractionHandlers.handleCheckout(interaction, payload);
    },
  });

  console.log(
    `[InteractionRouter] Handlers registrados: [${componentRouter.getRegisteredNamespaces().join(', ') || 'nenhum ainda'}]`,
  );
}

/**
 * Despacha uma interação de componente para o handler correto via componentRouter.
 */
export async function dispatchInteraction(interaction: ComponentInteraction): Promise<void> {
  await componentRouter.dispatch(interaction);
}
