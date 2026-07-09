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

/**
 * Registra todos os handlers de componentes no componentRouter.
 * Chame uma única vez no bootstrap do bot-worker, antes de iniciar os workers.
 *
 * @example
 * // apps/bot-worker/src/index.ts
 * registerInteractionHandlers();
 */
export function registerInteractionHandlers(): void {
  // --- Exemplo: namespace "example" ---
  // Descomente e adapte ao criar módulos reais.
  //
  // componentRouter.register('ticket', {
  //   async close(interaction, [ticketId]) {
  //     const responder = createResponder(interaction);
  //     // lógica de fechar ticket...
  //     await responder.send({ embeds: [successEmbed('Ticket fechado')] });
  //   },
  // });

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
