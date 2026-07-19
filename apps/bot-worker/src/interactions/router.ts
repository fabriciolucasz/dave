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
import { inventoryBotHandlers } from '../features/inventory/interaction.js';
import { centralBotHandlers } from '../features/central/interaction.js';
import { registrationBotHandlers } from '../features/registration/interaction.js';

/**
 * Registra todos os handlers de componentes no componentRouter.
 * Chame uma única vez no bootstrap do bot-worker, antes de iniciar os workers.
 *
 * @example
 * // apps/bot-worker/src/index.ts
 * registerInteractionHandlers();
 */
export function registerInteractionHandlers(): void {
  // ---------------------------------------------------------------------------
  // Setup (/setup wizard)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Assinar (/assinar command)
  // ---------------------------------------------------------------------------
  componentRouter.register('assinar', {
    async checkout(interaction, payload) {
      await assinarInteractionHandlers.handleCheckout(interaction, payload);
    },
  });

  // ---------------------------------------------------------------------------
  // Inventário / Baú (seção 26.1)
  //
  // Namespace: 'inventory'
  //   inventory:view              → abre o baú (ponto de entrada)
  //   inventory:location:select   → localização selecionada no select
  //   inventory:location:page:<n> → navegação de página de localizações
  //   inventory:item:select       → item selecionado no select
  //   inventory:item:page:<n>     → navegação de página de itens (futura)
  //   inventory:select            → alias legacy (retrocompatibilidade)
  //   inventory:adjust:<itemId>:<op> → botão +/- → abre modal
  //   inventory:submit_adjust:<itemId>:<op> → modal submit
  // ---------------------------------------------------------------------------
  componentRouter.register('inventory', {
    // Ponto de entrada
    async view(interaction) {
      await inventoryBotHandlers.handleView(interaction);
    },

    // Seleção de localização
    async location(interaction, payload) {
      const [action, ...rest] = payload;
      if (action === 'select') {
        await inventoryBotHandlers.handleSelectLocation(interaction as any);
      } else if (action === 'page') {
        // navegação de páginas do SelectPaginator de localizações
        // O select recarrega com pageIndex da URL via inventory:view novamente
        await inventoryBotHandlers.handleView(interaction);
      }
    },

    // Seleção de item
    async item(interaction, payload) {
      const [action] = payload;
      if (action === 'select') {
        await inventoryBotHandlers.handleSelectItem(interaction as any);
      }
    },

    // Select legacy (retrocompatibilidade) — ainda usado pelo select de item
    async select(interaction) {
      await inventoryBotHandlers.handleSelect(interaction as any);
    },

    // Botão +/-
    async adjust(interaction, payload) {
      await inventoryBotHandlers.handleAdjust(interaction as any, payload);
    },

    // Modal submit de ajuste
    async submit_adjust(interaction, payload) {
      await inventoryBotHandlers.handleSubmitAdjust(interaction as any, payload);
    },
  });

  // ---------------------------------------------------------------------------
  // Central / Ações Ilegais + Metas (seção 26.2 e 26.4)
  //
  // Namespace: 'central'
  //   central:register_action     → inicia fluxo de registro de ação
  //   central:city:select         → cidade selecionada no select
  //   central:city:page:<n>       → navegação de página de cidades
  //   central:city:info:<n>       → botão info (desabilitado, sem ação)
  //   central:type:select         → tipo selecionado no select
  //   central:type:page:<n>       → navegação de página de tipos
  //   central:type:info:<n>       → botão info (desabilitado, sem ação)
  //   central:select_participants → participantes selecionados (UserSelectMenu)
  //   central:open_action_modal   → abre modal de resultado
  //   central:submit_action       → modal submit de resultado
  //   central:back:<fromStep>     → volta uma etapa no fluxo
  //   central:cancel_flow         → cancela o fluxo inteiro
  //   central:register_goal       → abre modal de meta semanal
  //   central:submit_goal         → modal submit de meta
  //   central:show_ranking        → mostra ranking atual (ephemeral)
  // ---------------------------------------------------------------------------
  componentRouter.register('central', {
    async register_action(interaction) {
      await centralBotHandlers.handleRegisterAction(interaction as any);
    },

    // Namespace 'city' dentro de 'central' — via payload[0] = action
    async city(interaction, payload) {
      const [action, pageStr] = payload;
      if (action === 'select') {
        await centralBotHandlers.handleSelectCity(interaction as any);
      } else if (action === 'page') {
        await centralBotHandlers.handleCityPage(interaction as any, [pageStr ?? '0']);
      }
      // 'info' é botão desabilitado — sem handler necessário
    },

    // Namespace 'type' dentro de 'central'
    async type(interaction, payload) {
      const [action, pageStr] = payload;
      if (action === 'select') {
        await centralBotHandlers.handleSelectType(interaction as any);
      } else if (action === 'page') {
        await centralBotHandlers.handleTypePage(interaction as any, [pageStr ?? '0']);
      }
    },

    async select_participants(interaction) {
      await centralBotHandlers.handleSelectParticipants(interaction as any);
    },

    async open_action_modal(interaction) {
      await centralBotHandlers.handleOpenActionModal(interaction as any);
    },

    async submit_action(interaction) {
      await centralBotHandlers.handleSubmitAction(interaction as any);
    },

    async back(interaction, payload) {
      await centralBotHandlers.handleBack(interaction as any, payload);
    },

    async cancel_flow(interaction) {
      await centralBotHandlers.handleCancelFlow(interaction as any);
    },

    async register_goal(interaction) {
      await centralBotHandlers.handleRegisterGoal(interaction as any);
    },

    async submit_goal(interaction) {
      await centralBotHandlers.handleSubmitGoal(interaction as any);
    },

    async show_ranking(interaction) {
      await centralBotHandlers.handleShowRanking(interaction as any);
    },
  });

  // ---------------------------------------------------------------------------
  // Cadastro de Personagem (seção 26.5)
  //
  // Namespace: 'registration'
  //   registration:start          → abre modal de cadastro
  //   registration:submit         → modal submit do cadastro
  //   registration:approve:<id>   → staff aprova o cadastro
  //   registration:reject:<id>    → staff nega o cadastro
  // ---------------------------------------------------------------------------
  componentRouter.register('registration', {
    async start(interaction) {
      await registrationBotHandlers.handleStart(interaction as any);
    },
    async submit(interaction) {
      await registrationBotHandlers.handleSubmit(interaction as any);
    },
    async approve(interaction, payload) {
      await registrationBotHandlers.handleApprove(interaction as any, payload);
    },
    async reject(interaction, payload) {
      await registrationBotHandlers.handleReject(interaction as any, payload);
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
