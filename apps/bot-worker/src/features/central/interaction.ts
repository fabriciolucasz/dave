// apps/bot-worker/src/features/central/interaction.ts
//
// Painel Central — seção 26.2 (Ações Ilegais) e 26.4 (Metas)
//
// Fluxo de Ações Ilegais (multi-etapa com estado no Redis):
//   1. handleRegisterAction  → inicializa sessão Redis, renderiza seleção de cidade
//   2. handleSelectCity      → salva cityId, renderiza seleção de tipo
//   3. handleSelectType      → salva actionTypeId, renderiza seleção de participantes
//   4. handleSelectParticipants → salva participantIds, renderiza resumo + botão para modal
//   5. handleOpenActionModal → abre modal de resultado/valor
//   6. handleSubmitAction    → cria IllegalAction + participantes, invalida ranking, loga
//   7. handleBack            → recua uma etapa na sessão
//   handleCityPage / handleTypePage → paginação das seleções via SelectPaginator
//
// Metas Semanais:
//   handleRegisterGoal / handleSubmitGoal — sem mudança de fluxo
//
// IMPORTANTE: toda troca de etapa usa interaction.update() — reconstrução total.
// Modal não pode ser combinado com update — abre como nova interação.

import {
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  type UserSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { ComponentInteraction } from '@dave/discord-kit';
import { prisma } from '@dave/database';
import { redis } from '@dave/queue';
import {
  infoEmbed,
  successEmbed,
  errorEmbed,
  createResponder,
  logFeatureEvent,
  createSelectPaginator,
} from '@dave/discord-kit';
import { checkSubscription } from '../../middleware/subscription.js';
import { invalidateRankingCache, getWeekStart, formatRankingText, getRankingData } from './ranking.js';

// ---------------------------------------------------------------------------
// Estado de sessão Redis para o fluxo multi-etapa
// ---------------------------------------------------------------------------

const FLOW_TTL_SECONDS = 15 * 60; // 15 minutos

interface IllegalActionFlowState {
  step: 'city' | 'type' | 'participants' | 'confirm';
  cityId?: string;
  cityName?: string;
  actionTypeId?: string;
  actionTypeName?: string;
  maxParticipants?: number;
  participantIds?: string[];
  cityPage?: number;
  typePage?: number;
}

function flowKey(guildId: string, userId: string): string {
  return `illegal-action-flow:${guildId}:${userId}`;
}

async function getFlowState(guildId: string, userId: string): Promise<IllegalActionFlowState | null> {
  const raw = await redis.get(flowKey(guildId, userId));
  return raw ? (JSON.parse(raw) as IllegalActionFlowState) : null;
}

async function setFlowState(
  guildId: string,
  userId: string,
  state: IllegalActionFlowState,
): Promise<void> {
  await redis.setex(flowKey(guildId, userId), FLOW_TTL_SECONDS, JSON.stringify(state));
}

async function clearFlowState(guildId: string, userId: string): Promise<void> {
  await redis.del(flowKey(guildId, userId));
}

// ---------------------------------------------------------------------------
// Helpers de renderização de etapas
// ---------------------------------------------------------------------------

/**
 * Renderiza a etapa de seleção de cidade.
 * Retorna os components a serem incluídos no update da mensagem.
 */
async function buildCitySelectComponents(
  guildId: string,
  pageIndex: number,
): Promise<{ embeds: any[]; components: any[] }> {
  const cities = await prisma.illegalActionCity.findMany({
    where: { guildId, isActive: true },
    orderBy: { name: 'asc' },
  });

  if (cities.length === 0) {
    return {
      embeds: [
        infoEmbed(
          '⚔️ Registro de Ação',
          'Nenhuma cidade cadastrada. Configure as cidades no painel do dashboard antes de registrar ações.',
        ).toJSON(),
      ],
      components: [],
    };
  }

  const { select, navigationRow } = createSelectPaginator(
    {
      namespace: 'central:city',
      items: cities,
      mapToOption: (c) => ({ label: c.name, value: c.id }),
      placeholder: 'Selecione a cidade da ação...',
    },
    pageIndex,
  );

  const components: any[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select).toJSON(),
  ];
  if (navigationRow) components.push(navigationRow.toJSON());

  const cancelBtn = new ButtonBuilder()
    .setCustomId('central:cancel_flow')
    .setLabel('✖ Cancelar')
    .setStyle(ButtonStyle.Secondary);
  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(cancelBtn).toJSON(),
  );

  return {
    embeds: [
      infoEmbed(
        '⚔️ Registro de Ação — Etapa 1/4',
        '**Selecione a cidade** onde a ação ocorreu:',
      ).toJSON(),
    ],
    components,
  };
}

/**
 * Renderiza a etapa de seleção de tipo de ação (filtrado pela cidade).
 */
async function buildTypeSelectComponents(
  cityId: string,
  cityName: string,
  pageIndex: number,
): Promise<{ embeds: any[]; components: any[] }> {
  const types = await prisma.illegalActionType.findMany({
    where: { cityId, isActive: true },
    orderBy: { name: 'asc' },
  });

  if (types.length === 0) {
    return {
      embeds: [
        infoEmbed(
          '⚔️ Registro de Ação',
          `Nenhum tipo de ação cadastrado para **${cityName}**. Configure os tipos no dashboard.`,
        ).toJSON(),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('central:back:type')
              .setLabel('🔙 Voltar')
              .setStyle(ButtonStyle.Secondary),
          )
          .toJSON(),
      ],
    };
  }

  const { select, navigationRow } = createSelectPaginator(
    {
      namespace: 'central:type',
      items: types,
      mapToOption: (t) => ({
        label: t.name,
        value: t.id,
        ...(t.maxParticipants !== null && { description: `Máx. ${t.maxParticipants} participantes` }),
      }),
      placeholder: 'Selecione o tipo de ação...',
    },
    pageIndex,
  );

  const components: any[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select).toJSON(),
  ];
  if (navigationRow) components.push(navigationRow.toJSON());

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('central:back:type')
      .setLabel('🔙 Voltar')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('central:cancel_flow')
      .setLabel('✖ Cancelar')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(navRow.toJSON());

  return {
    embeds: [
      infoEmbed(
        '⚔️ Registro de Ação — Etapa 2/4',
        `**Cidade:** ${cityName}\n\n**Selecione o tipo de ação:**`,
      ).toJSON(),
    ],
    components,
  };
}

/**
 * Renderiza a etapa de seleção de participantes.
 */
function buildParticipantsSelectComponents(
  cityName: string,
  actionTypeName: string,
  maxParticipants: number,
): { embeds: any[]; components: any[] } {
  // UserSelectMenuBuilder — seleciona membros Discord diretamente
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId('central:select_participants')
    .setPlaceholder('Selecione os participantes...')
    .setMinValues(1)
    .setMaxValues(Math.min(maxParticipants, 25)); // Discord limita a 25

  const components: any[] = [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect).toJSON(),
    new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('central:back:participants')
          .setLabel('🔙 Voltar')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('central:cancel_flow')
          .setLabel('✖ Cancelar')
          .setStyle(ButtonStyle.Secondary),
      )
      .toJSON(),
  ];

  return {
    embeds: [
      infoEmbed(
        '⚔️ Registro de Ação — Etapa 3/4',
        `**Cidade:** ${cityName}\n**Tipo:** ${actionTypeName}\n\n` +
        `**Selecione os participantes** (mín. 1, máx. ${maxParticipants}):`,
      ).toJSON(),
    ],
    components,
  };
}

/**
 * Renderiza o resumo pré-registro com botão para abrir o modal.
 */
function buildConfirmComponents(
  cityName: string,
  actionTypeName: string,
  participantIds: string[],
): { embeds: any[]; components: any[] } {
  const participantsList = participantIds.map((id) => `<@${id}>`).join(', ');

  return {
    embeds: [
      infoEmbed(
        '⚔️ Registro de Ação — Etapa 4/4',
        `**Cidade:** ${cityName}\n` +
        `**Tipo:** ${actionTypeName}\n` +
        `**Participantes (${participantIds.length}):** ${participantsList}\n\n` +
        `Clique em **Preencher Resultado** para informar se a ação foi bem-sucedida e o valor total.`,
      ).toJSON(),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('central:open_action_modal')
            .setLabel('📝 Preencher Resultado')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('central:back:confirm')
            .setLabel('🔙 Voltar')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('central:cancel_flow')
            .setLabel('✖ Cancelar')
            .setStyle(ButtonStyle.Secondary),
        )
        .toJSON(),
    ],
  };
}

// ---------------------------------------------------------------------------
// Handlers de interação exportados
// ---------------------------------------------------------------------------

export const centralBotHandlers = {
  // ==========================================================================
  // ETAPA 1 — Seleção de cidade
  // ==========================================================================

  async handleRegisterAction(interaction: ButtonInteraction) {
    const responder = createResponder(interaction);

    // Verificar assinatura
    const sub = await checkSubscription(interaction.guildId!);
    if (!sub.isActive) {
      await responder.sendEphemeral({
        embeds: [
          infoEmbed('Acesso Bloqueado', 'Este servidor não possui assinatura ativa. Use `/assinar`.'),
        ],
      });
      return;
    }

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    // Inicializa sessão
    await setFlowState(guild.discordId, interaction.user.id, { step: 'city', cityPage: 0 });

    const content = await buildCitySelectComponents(guild.id, 0);
    await responder.sendEphemeral(content as any);
  },

  // ==========================================================================
  // ETAPA 1 → Navegação de página de cidades
  // ==========================================================================

  async handleCityPage(interaction: ButtonInteraction, payload: string[]) {
    const [pageStr] = payload;
    const pageIndex = parseInt(pageStr ?? '0', 10);

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    const state = await getFlowState(guild.discordId, interaction.user.id);
    if (!state) {
      await (interaction as any).update({
        embeds: [infoEmbed('Sessão Expirada', 'Sua sessão de registro expirou. Clique em "Registrar Ação" novamente.').toJSON()],
        components: [],
      });
      return;
    }

    await setFlowState(guild.discordId, interaction.user.id, { ...state, cityPage: pageIndex });

    const content = await buildCitySelectComponents(guild.id, pageIndex);
    await (interaction as any).update(content);
  },

  // ==========================================================================
  // ETAPA 2 — Seleção de tipo de ação
  // ==========================================================================

  async handleSelectCity(interaction: StringSelectMenuInteraction) {
    const cityId = interaction.values[0];
    if (!cityId) return;

    const city = await prisma.illegalActionCity.findUnique({ where: { id: cityId } });
    if (!city) return;

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    const state = await getFlowState(guild.discordId, interaction.user.id);
    if (!state) return;

    await setFlowState(guild.discordId, interaction.user.id, {
      ...state,
      step: 'type',
      cityId: city.id,
      cityName: city.name,
      typePage: 0,
    });

    const content = await buildTypeSelectComponents(city.id, city.name, 0);
    await (interaction as any).update(content);
  },

  // ==========================================================================
  // ETAPA 2 → Navegação de página de tipos
  // ==========================================================================

  async handleTypePage(interaction: ButtonInteraction, payload: string[]) {
    const [pageStr] = payload;
    const pageIndex = parseInt(pageStr ?? '0', 10);

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    const state = await getFlowState(guild.discordId, interaction.user.id);
    if (!state?.cityId || !state.cityName) return;

    await setFlowState(guild.discordId, interaction.user.id, { ...state, typePage: pageIndex });

    const content = await buildTypeSelectComponents(state.cityId, state.cityName, pageIndex);
    await (interaction as any).update(content);
  },

  // ==========================================================================
  // ETAPA 3 — Seleção de participantes
  // ==========================================================================

  async handleSelectType(interaction: StringSelectMenuInteraction) {
    const typeId = interaction.values[0];
    if (!typeId) return;

    const actionType = await prisma.illegalActionType.findUnique({ where: { id: typeId } });
    if (!actionType) return;

    const guild = await prisma.guild.findUnique({
      where: { discordId: interaction.guildId! },
      include: { settings: true },
    });
    if (!guild) return;

    const state = await getFlowState(guild.discordId, interaction.user.id);
    if (!state?.cityName) return;

    // maxParticipants: usa o do tipo, ou o padrão do GuildSettings, ou 10
    const defaultMax = (guild.settings?.data as any)?.defaultMaxParticipants ?? 10;
    const maxParticipants = actionType.maxParticipants ?? defaultMax;

    await setFlowState(guild.discordId, interaction.user.id, {
      ...state,
      step: 'participants',
      actionTypeId: actionType.id,
      actionTypeName: actionType.name,
      maxParticipants,
    });

    const content = buildParticipantsSelectComponents(
      state.cityName,
      actionType.name,
      maxParticipants,
    );
    await (interaction as any).update(content);
  },

  // ==========================================================================
  // ETAPA 4 — Resumo e confirmação
  // ==========================================================================

  async handleSelectParticipants(interaction: UserSelectMenuInteraction) {
    const participantIds = interaction.values;
    if (participantIds.length === 0) return;

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    const state = await getFlowState(guild.discordId, interaction.user.id);
    if (!state?.cityName || !state.actionTypeName) return;

    await setFlowState(guild.discordId, interaction.user.id, {
      ...state,
      step: 'confirm',
      participantIds,
    });

    const content = buildConfirmComponents(state.cityName, state.actionTypeName, participantIds);
    await (interaction as any).update(content);
  },

  // ==========================================================================
  // ETAPA 4 → Abre modal de resultado
  // (Opção A: abre modal diretamente — única ação permitida pela API do Discord)
  // ==========================================================================

  async handleOpenActionModal(interaction: ButtonInteraction) {
    // Estado validado no Redis — não precisa de payload no customId
    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    const state = await getFlowState(guild.discordId, interaction.user.id);
    if (!state?.participantIds) {
      const responder = createResponder(interaction);
      await responder.sendEphemeral({
        embeds: [errorEmbed('Sessão Expirada', 'Sua sessão expirou. Inicie o fluxo novamente.')],
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('central:submit_action')
      .setTitle('Registrar Resultado da Ação');

    const outcomeInput = new TextInputBuilder()
      .setCustomId('outcome')
      .setLabel('Resultado (GANHOU ou PERDEU)')
      .setStyle(TextInputStyle.Short)
      .setValue('GANHOU')
      .setRequired(true)
      .setMaxLength(10);

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('Valor Total (somente números)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: 50000')
      .setRequired(true)
      .setMaxLength(12);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(outcomeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput),
    );

    await interaction.showModal(modal);
  },

  // ==========================================================================
  // MODAL SUBMIT — Persiste a ação ilegal
  // ==========================================================================

  async handleSubmitAction(interaction: ModalSubmitInteraction) {
    const responder = createResponder(interaction);

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    const state = await getFlowState(guild.discordId, interaction.user.id);
    if (!state?.cityId || !state.actionTypeId || !state.participantIds?.length) {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Sessão Expirada', 'Sua sessão expirou. Inicie o fluxo novamente.')],
      });
      return;
    }

    const outcomeRaw = interaction.fields.getTextInputValue('outcome').toUpperCase().trim();
    const amountStr = interaction.fields.getTextInputValue('amount').replace(/\D/g, '');

    if (outcomeRaw !== 'GANHOU' && outcomeRaw !== 'PERDEU') {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro de Validação', 'O resultado deve ser **GANHOU** ou **PERDEU**.')],
      });
      return;
    }

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro de Validação', 'Por favor, informe um valor numérico positivo.')],
      });
      return;
    }

    const outcome = outcomeRaw === 'GANHOU' ? 'WON' : 'LOST';
    const { participantIds, cityId, actionTypeId, cityName, actionTypeName } = state;

    try {
      await prisma.$transaction(async (tx) => {
        const act = await tx.illegalAction.create({
          data: {
            guildId: guild.id,
            cityId,
            actionTypeId,
            outcome,
            amount,
            registeredByUserId: interaction.user.id,
          },
        });

        const share = Math.floor(amount / participantIds.length);

        await tx.illegalActionParticipant.createMany({
          data: participantIds.map((discordUserId) => ({
            actionId: act.id,
            discordUserId,
            shareAmount: share,
          })),
        });
      });

      // Invalida cache de ranking
      await invalidateRankingCache(guild.id);

      // Limpa sessão
      await clearFlowState(guild.discordId, interaction.user.id);

      // Log transversal
      const share = Math.floor(amount / participantIds.length);
      await logFeatureEvent(guild.id, 'CENTRAL', {
        embeds: [{
          title: `⚔️ Nova Ação Registrada`,
          description: `Registrada por <@${interaction.user.id}>.`,
          color: outcome === 'WON' ? 0x248046 : 0xda373c,
          fields: [
            { name: 'Cidade', value: cityName ?? 'Não especificada', inline: true },
            { name: 'Tipo', value: actionTypeName ?? 'Não especificado', inline: true },
            { name: 'Resultado', value: outcome === 'WON' ? '✅ Ganhou' : '❌ Perdeu', inline: true },
            { name: 'Valor Total', value: `R$ ${amount.toLocaleString('pt-BR')}`, inline: true },
            { name: `Share (${participantIds.length} participantes)`, value: `R$ ${share.toLocaleString('pt-BR')} cada`, inline: true },
            { name: 'Participantes', value: participantIds.map((p) => `<@${p}>`).join(', '), inline: false },
          ],
          timestamp: new Date().toISOString(),
        }],
      });

      await responder.sendEphemeral({
        embeds: [
          successEmbed(
            '✅ Ação Registrada',
            `A ação foi registrada com sucesso!\n\n` +
            `**Cidade:** ${cityName}\n` +
            `**Tipo:** ${actionTypeName}\n` +
            `**Resultado:** ${outcome === 'WON' ? 'Ganhou' : 'Perdeu'}\n` +
            `**Valor Total:** R$ ${amount.toLocaleString('pt-BR')}\n` +
            `**Participantes:** ${participantIds.map((p) => `<@${p}>`).join(', ')}`,
          ),
        ],
      });
    } catch (err) {
      console.error('[Central] Erro ao registrar ação:', err);
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao registrar a ação. Tente novamente.')],
      });
    }
  },

  // ==========================================================================
  // VOLTAR — recua uma etapa no fluxo
  // ==========================================================================

  async handleBack(interaction: ButtonInteraction, payload: string[]) {
    const [fromStep] = payload;
    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    const state = await getFlowState(guild.discordId, interaction.user.id);

    if (fromStep === 'type') {
      // Voltou da etapa de tipo → vai para cidade
      await setFlowState(guild.discordId, interaction.user.id, {
        step: 'city',
        cityPage: state?.cityPage ?? 0,
      });
      const content = await buildCitySelectComponents(guild.id, state?.cityPage ?? 0);
      await (interaction as any).update(content);
    } else if (fromStep === 'participants') {
      // Voltou da etapa de participantes → vai para tipo
      if (!state?.cityId || !state.cityName) {
        await (interaction as any).update({
          embeds: [infoEmbed('Sessão Expirada', 'Sua sessão expirou. Reinicie o fluxo.').toJSON()],
          components: [],
        });
        return;
      }
      await setFlowState(guild.discordId, interaction.user.id, { ...state, step: 'type' });
      const content = await buildTypeSelectComponents(state.cityId, state.cityName, state.typePage ?? 0);
      await (interaction as any).update(content);
    } else if (fromStep === 'confirm') {
      // Voltou da confirmação → vai para participantes
      if (!state?.cityName || !state.actionTypeName || !state.maxParticipants) {
        await (interaction as any).update({
          embeds: [infoEmbed('Sessão Expirada', 'Sua sessão expirou. Reinicie o fluxo.').toJSON()],
          components: [],
        });
        return;
      }
      await setFlowState(guild.discordId, interaction.user.id, { ...state, step: 'participants' });
      const content = buildParticipantsSelectComponents(
        state.cityName,
        state.actionTypeName,
        state.maxParticipants,
      );
      await (interaction as any).update(content);
    }
  },

  // ==========================================================================
  // CANCELAR fluxo
  // ==========================================================================

  async handleCancelFlow(interaction: ButtonInteraction) {
    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (guild) await clearFlowState(guild.discordId, interaction.user.id);

    await (interaction as any).update({
      embeds: [infoEmbed('Cancelado', 'O registro da ação foi cancelado.')],
      components: [],
    });
  },

  // ==========================================================================
  // METAS SEMANAIS — sem mudança de fluxo (seção 26.4)
  // ==========================================================================

  async handleRegisterGoal(interaction: ButtonInteraction) {
    const sub = await checkSubscription(interaction.guildId!);
    if (!sub.isActive) {
      const responder = createResponder(interaction);
      await responder.sendEphemeral({
        embeds: [infoEmbed('Acesso Bloqueado', 'Assinatura inativa. Use `/assinar`.')],
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('central:submit_goal')
      .setTitle('Registrar Entrega de Meta Semanal');

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('Valor Entregue (somente números)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: 15000')
      .setRequired(true)
      .setMaxLength(12);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
    await interaction.showModal(modal);
  },

  async handleSubmitGoal(interaction: ModalSubmitInteraction) {
    const responder = createResponder(interaction);
    const amountStr = interaction.fields.getTextInputValue('amount').replace(/\D/g, '');
    const amountDelivered = parseInt(amountStr, 10);

    if (isNaN(amountDelivered) || amountDelivered <= 0) {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro de Validação', 'Por favor, informe um valor numérico positivo.')],
      });
      return;
    }

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    const weekStartDate = getWeekStart();

    try {
      await prisma.weeklyGoalSubmission.create({
        data: {
          guildId: guild.id,
          discordUserId: interaction.user.id,
          weekStartDate,
          amountDelivered,
          registeredByUserId: interaction.user.id,
        },
      });

      await logFeatureEvent(guild.id, 'CENTRAL', {
        embeds: [{
          title: `💰 Entrega de Meta Semanal`,
          description: `Entrega registrada por <@${interaction.user.id}>.`,
          color: 0x5865f2,
          fields: [
            { name: 'Membro', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Valor Entregue', value: `R$ ${amountDelivered.toLocaleString('pt-BR')}`, inline: true },
            { name: 'Semana', value: weekStartDate.toLocaleDateString('pt-BR'), inline: true },
          ],
          timestamp: new Date().toISOString(),
        }],
      });

      await responder.sendEphemeral({
        embeds: [
          successEmbed(
            '✅ Entrega Registrada',
            `Sua entrega de **R$ ${amountDelivered.toLocaleString('pt-BR')}** para a semana de **${weekStartDate.toLocaleDateString('pt-BR')}** foi registrada com sucesso!`,
          ),
        ],
      });
    } catch (err) {
      console.error('[Central] Erro ao registrar meta:', err);
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao registrar a entrega da meta.')],
      });
    }
  },

  // ==========================================================================
  // RANKING — atualiza/mostra o ranking (usado pelo painel sticky)
  // ==========================================================================

  async handleShowRanking(interaction: ButtonInteraction) {
    const responder = createResponder(interaction);

    const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guildId! } });
    if (!guild) return;

    const ranking = await getRankingData(guild.id);
    const rankingText = formatRankingText(ranking);
    const weekStart = getWeekStart();

    const embed = rankingText
      ? {
          title: `🏆 Ranking Semanal — ${weekStart.toLocaleDateString('pt-BR')}`,
          description: rankingText,
          color: 0xfaa61a,
          footer: { text: 'Atualizado a cada 5 minutos' },
          timestamp: new Date().toISOString(),
        }
      : {
          title: `🏆 Ranking Semanal — ${weekStart.toLocaleDateString('pt-BR')}`,
          description: '*Nenhuma ação registrada esta semana. Seja o primeiro!*',
          color: 0x4f545c,
          timestamp: new Date().toISOString(),
        };

    await responder.sendEphemeral({ embeds: [embed as any] });
  },
};
