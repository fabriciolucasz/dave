// apps/bot-worker/src/features/inventory/interaction.ts
//
// Painel do Baú — seção 26.1 do PLAN.md.
//
// Fluxo:
//   1. handleView:
//      - Sem localizações cadastradas OU apenas 1: vai direto para lista de itens.
//      - Com 2+ localizações: renderiza seleção de localização via SelectPaginator.
//   2. handleSelectLocation: recebe locationId, renderiza lista de itens daquela localização.
//   3. handleSelect: item selecionado do select → botões +/-.
//   4. handleAdjust: botão +/- → modal de quantidade.
//   5. handleSubmitAdjust: modal submit → adjustItemQuantity (transação atômica).
//
// O inventário global (sem filtro de localização) é exibido quando locationId = 'all'.

import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { ComponentInteraction } from '@dave/discord-kit';
import { prisma } from '@dave/database';
import {
  infoEmbed,
  successEmbed,
  errorEmbed,
  createResponder,
  logFeatureEvent,
  createSelectPaginator,
} from '@dave/discord-kit';
import { checkSubscription } from '../../middleware/subscription.js';
import { adjustItemQuantity } from './handlers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renderiza a lista de itens de uma localização (ou do baú geral).
 * Retorna o payload de resposta pronto para enviar/atualizar.
 */
async function buildItemListPayload(
  guildId: string,
  locationId: string | null,
  locationName: string,
): Promise<{ embeds: any[]; components: any[] }> {
  const items = await prisma.inventoryItem.findMany({
    where: {
      guildId,
      isActive: true,
      ...(locationId === 'all' || locationId === null
        ? {} // todos os itens
        : { locationId }),
    },
    orderBy: { name: 'asc' },
  });

  if (items.length === 0) {
    return {
      embeds: [
        infoEmbed(
          `📦 ${locationName}`,
          'Nenhum item cadastrado nesta localização ainda.',
        ).toJSON(),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('inventory:view')
              .setLabel('🔙 Voltar')
              .setStyle(ButtonStyle.Secondary),
          )
          .toJSON(),
      ],
    };
  }

  // Select de itens via SelectPaginator
  const { select, navigationRow } = createSelectPaginator(
    {
      namespace: 'inventory:item',
      items,
      mapToOption: (item) => ({
        label: item.name.slice(0, 100),
        description: `Saldo: ${item.currentQuantity} un.${item.description ? ` — ${item.description.slice(0, 50)}` : ''}`,
        value: item.id,
      }),
      placeholder: 'Selecione um item para ajustar o saldo...',
      maxValues: 1,
    },
    0,
  );

  const components: any[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select).toJSON(),
  ];
  if (navigationRow) components.push(navigationRow.toJSON());

  // Botão de resumo global + botão voltar
  const navButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('inventory:view')
      .setLabel('🔙 Voltar')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(navButtons.toJSON());

  const totalItems = items.reduce((sum, i) => sum + i.currentQuantity, 0);
  const embed = {
    title: `📦 ${locationName}`,
    description: `**${items.length}** item(ns) cadastrado(s) — **${totalItems}** unidades no total.\n\nSelecione um item para ajustar o saldo:`,
    color: 0x5865f2,
    fields: items.slice(0, 15).map((item) => ({
      name: item.name,
      value: `\`${item.currentQuantity}\` un.`,
      inline: true,
    })),
    footer: items.length > 15 ? { text: `+${items.length - 15} itens — use o select para ver todos` } : undefined,
  };

  return { embeds: [embed], components };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const inventoryBotHandlers = {
  // ==========================================================================
  // 1. Abrir o baú — ponto de entrada principal
  // ==========================================================================

  async handleView(interaction: ComponentInteraction) {
    const responder = createResponder(interaction);

    const sub = await checkSubscription(interaction.guildId!);
    if (!sub.isActive) {
      await responder.sendEphemeral({
        embeds: [infoEmbed('Acesso Bloqueado', 'Assinatura inativa. Use `/assinar`.')],
      });
      return;
    }

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    // Busca localizações ativas
    const locations = await prisma.inventoryLocation.findMany({
      where: { guildId: guild.id, isActive: true },
      orderBy: { name: 'asc' },
    });

    if (locations.length <= 1) {
      // 0 ou 1 localização — vai direto para a lista de itens
      const locationId = locations[0]?.id ?? null;
      const locationName = locations[0]?.name ?? 'Baú do Servidor';
      const payload = await buildItemListPayload(guild.id, locationId, locationName);
      await responder.sendEphemeral(payload as any);
      return;
    }

    // 2+ localizações — renderiza seleção via SelectPaginator
    const { select, navigationRow } = createSelectPaginator(
      {
        namespace: 'inventory:location',
        items: locations,
        mapToOption: (loc) => ({
          label: loc.name,
          value: loc.id,
        }),
        placeholder: 'Selecione uma localização...',
        maxValues: 1,
      },
      0,
    );

    const components: any[] = [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select).toJSON(),
    ];
    if (navigationRow) components.push(navigationRow.toJSON());

    await responder.sendEphemeral({
      embeds: [
        infoEmbed(
          '📦 Baú do Servidor',
          `**${locations.length}** localizações disponíveis. Selecione uma para ver os itens:`,
        ).toJSON() as any,
      ],
      components: components as any,
    });
  },

  // ==========================================================================
  // 2. Localização selecionada
  // ==========================================================================

  async handleSelectLocation(interaction: StringSelectMenuInteraction) {
    const locationId = interaction.values[0];
    if (!locationId) return;

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    const location = await prisma.inventoryLocation.findUnique({ where: { id: locationId } });
    const locationName = location?.name ?? 'Localização';

    const payload = await buildItemListPayload(guild.id, locationId, locationName);
    await (interaction as any).update(payload);
  },

  // ==========================================================================
  // 3. Item selecionado do select — mostra detalhes + botões de ajuste
  // ==========================================================================

  async handleSelectItem(interaction: StringSelectMenuInteraction) {
    const itemId = interaction.values[0];
    if (!itemId) return;

    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      include: { location: true },
    });

    if (!item) {
      await (interaction as any).update({
        embeds: [errorEmbed('Erro', 'Item não encontrado.').toJSON()],
        components: [],
      });
      return;
    }

    const embed = {
      title: `📦 ${item.name}`,
      description:
        `${item.description || '*Sem descrição.*'}\n\n` +
        `**Saldo Atual:** \`${item.currentQuantity}\` unidades\n` +
        (item.location ? `**Localização:** ${item.location.name}` : ''),
      color: 0x5865f2,
    };

    const btnAdd = new ButtonBuilder()
      .setCustomId(`inventory:adjust:${item.id}:+`)
      .setLabel('➕ Adicionar')
      .setStyle(ButtonStyle.Success);

    const btnSub = new ButtonBuilder()
      .setCustomId(`inventory:adjust:${item.id}:-`)
      .setLabel('➖ Retirar')
      .setStyle(ButtonStyle.Danger);

    const btnBack = new ButtonBuilder()
      .setCustomId('inventory:view')
      .setLabel('🔙 Voltar ao Baú')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnAdd, btnSub, btnBack);

    await (interaction as any).update({
      embeds: [embed],
      components: [row.toJSON()],
    });
  },

  // Alias para retrocompatibilidade com 'inventory:select' registrado no router
  async handleSelect(interaction: StringSelectMenuInteraction) {
    return inventoryBotHandlers.handleSelectItem(interaction);
  },

  // ==========================================================================
  // 4. Botão +/- → abre modal de quantidade
  // ==========================================================================

  async handleAdjust(interaction: ButtonInteraction, payload: string[]) {
    const [itemId, operation] = payload;
    if (!itemId || !operation) return;

    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });

    if (!item) {
      const responder = createResponder(interaction);
      await responder.sendEphemeral({ embeds: [errorEmbed('Erro', 'Item não encontrado.').toJSON() as any] });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`inventory:submit_adjust:${item.id}:${operation}`)
      .setTitle(`${operation === '+' ? 'Adicionar ao' : 'Retirar do'} Baú: ${item.name}`);

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel('Quantidade (número inteiro positivo)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: 10')
      .setRequired(true)
      .setMaxLength(8);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Motivo do ajuste')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Ex: Recebimento de carga / Uso em ação')
      .setRequired(false)
      .setMaxLength(300);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
    );

    await interaction.showModal(modal);
  },

  // ==========================================================================
  // 5. Modal submit — atualiza saldo via adjustItemQuantity (transação atômica)
  // ==========================================================================

  async handleSubmitAdjust(interaction: ModalSubmitInteraction, payload: string[]) {
    const responder = createResponder(interaction);
    const [itemId, operation] = payload;
    if (!itemId || !operation) return;

    const quantityStr = interaction.fields.getTextInputValue('quantity').replace(/\D/g, '');
    const reason = interaction.fields.getTextInputValue('reason') || undefined;

    const quantity = parseInt(quantityStr, 10);
    if (isNaN(quantity) || quantity <= 0) {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro de Validação', 'Por favor, informe um número inteiro positivo.').toJSON() as any],
      });
      return;
    }

    const delta = operation === '+' ? quantity : -quantity;

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    try {
      const result = await adjustItemQuantity(guild.id, itemId, delta, interaction.user.id, reason);

      // Log transversal
      await logFeatureEvent(guild.id, 'INVENTORY', {
        embeds: [{
          title: `📦 Ajuste de Estoque — ${result.item.name}`,
          description: `Ajuste realizado por <@${interaction.user.id}>.`,
          color: delta >= 0 ? 0x248046 : 0xda373c,
          fields: [
            { name: 'Item', value: result.item.name, inline: true },
            { name: 'Ajuste', value: `${delta >= 0 ? '+' : ''}${delta}`, inline: true },
            { name: 'Novo Saldo', value: `${result.item.currentQuantity} un.`, inline: true },
            ...(reason ? [{ name: 'Motivo', value: reason, inline: false }] : []),
          ],
          timestamp: new Date().toISOString(),
        }],
      });

      await responder.sendEphemeral({
        embeds: [
          successEmbed(
            '✅ Saldo Atualizado',
            `O saldo de **${result.item.name}** foi atualizado!\n\n` +
            `**Ajuste:** \`${delta >= 0 ? '+' : ''}${delta}\`\n` +
            `**Novo Saldo:** \`${result.item.currentQuantity}\` unidades`,
          ).toJSON() as any,
        ],
      });
    } catch (err: any) {
      console.error('[Inventário] Erro ao ajustar saldo:', err);
      // adjustItemQuantity lança erro descritivo para saldo negativo
      const msg = err?.message?.includes('ficaria negativo')
        ? err.message
        : 'Ocorreu um erro ao atualizar o saldo do item.';
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro', msg).toJSON() as any],
      });
    }
  },
};
