import { prisma } from '@dave/database';
import { Routes } from 'discord.js';
import type { ContainerRepostJobData } from '@dave/shared-types';
import { rest } from '../index.js';
import { containerRepostQueue } from '@dave/queue';
import { buildContainerDiscordPayload, type RankingPanelPayload } from '@dave/discord-kit';
import { env } from '@dave/config';
import { getRankingData, formatRankingText, getWeekStart, getDaysUntilWeekEnd } from '../features/central/ranking.js';

// ---------------------------------------------------------------------------
// injectRankingContent — só para container.type === 'ranking_panel' (seção 26.3)
//
// O ranking é conteúdo vivo (recalculado a cada repost, respeitando o cache
// de Redis de getRankingData) — nunca vem do payload salvo no banco, que só
// guarda identidade visual (título/cor/topN). Isola essa lógica aqui para não
// mexer no resto do fluxo de repost.
// ---------------------------------------------------------------------------
async function injectRankingContent(
  payload: RankingPanelPayload,
  guildInternalId: string,
): Promise<RankingPanelPayload> {
  const topN = payload.topN ?? 10;
  const ranking = await getRankingData(guildInternalId, topN);
  const rankingText = formatRankingText(ranking);
  const weekStart = getWeekStart();
  const daysLeft = getDaysUntilWeekEnd(weekStart);

  const title = payload.title || 'Ranking Semanal de Ações';
  const body = rankingText ?? '*Nenhuma ação registrada ainda essa semana. Seja o primeiro!*';
  const updatedAt = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const footer = `Atualizado em ${updatedAt} • Reset em ${daysLeft} dia${daysLeft !== 1 ? 's' : ''}`;

  if (payload.renderMode === 'container') {
    // Prepende um bloco de texto com o conteúdo vivo, preservando quaisquer
    // blocos de identidade visual configurados pelo admin (banner, etc.).
    const rankingBlock = {
      blockType: 'text' as const,
      content: `## ${title}\n${body}\n\n-# ${footer}`,
    };
    return {
      ...payload,
      blocks: [rankingBlock, ...(payload.blocks ?? [])],
    };
  }

  // Modo embed (default): título/descrição/rodapé do embed.
  return {
    ...payload,
    title,
    description: body,
    footerText: footer,
  };
}

// ---------------------------------------------------------------------------
// jobs/container-repost.ts — Gerencia repostagem de Sticky Messages
//
// Esta fila lida com dois fluxos:
//   1. Entrada imediata (com messageId): disparada por messageDelete no gateway.
//      Verifica se a mensagem deletada era um container ativo. Se sim,
//      seta messageId = null e agenda o repost delayed.
//   2. Entrada agendada (com containerId): executa o repost após o delay,
//      caso o container continue ativo e sem mensagem vinculada.
// ---------------------------------------------------------------------------

export async function handleContainerRepost(data: ContainerRepostJobData): Promise<void> {
  const { messageId, containerId, guildId, channelId, delaySeconds } = data;

  // ---------------------------------------------------------------------------
  // Fluxo 1: Recebido evento de mensagem deletada do Discord (messageId presente)
  // ---------------------------------------------------------------------------
  if (messageId) {
    console.log(`[ContainerRepost] Analisando mensagem deletada: ${messageId} na guild: ${guildId}`);

    const container = await prisma.guildContainer.findFirst({
      where: {
        messageId,
        isActive: true,
      },
    });

    if (!container) {
      // Mensagem deletada comum, não era um container ativo. Ignora.
      return;
    }

    console.log(`[ContainerRepost] Confirmado: Container ${container.id} foi deletado. Agendando repost para daqui a ${container.repostDelay}s...`);

    // Seta messageId = null no banco
    await prisma.guildContainer.update({
      where: { id: container.id },
      data: { messageId: null },
    });

    // Enfileira o job de repost com delay
    const delayedJobData: ContainerRepostJobData = {
      type: 'container_repost',
      containerId: container.id,
      guildId: container.guildId,
      channelId: container.channelId,
      delaySeconds: container.repostDelay,
    };

    await containerRepostQueue.add(`repost:${container.id}`, delayedJobData, {
      delay: container.repostDelay * 1000, // converte segundos para ms
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    return;
  }

  // ---------------------------------------------------------------------------
  // Fluxo 2: Execução agendada de repost (containerId presente)
  // ---------------------------------------------------------------------------
  if (containerId) {
    console.log(`[ContainerRepost] Iniciando processamento de repost agendado para o container: ${containerId}`);

    const container = await prisma.guildContainer.findUnique({
      where: { id: containerId },
      include: { guild: true },
    });

    if (!container || !container.isActive) {
      console.log(`[ContainerRepost] Container ${containerId} não existe ou foi desativado no intervalo. Repost cancelado.`);
      return;
    }

    if (container.messageId !== null) {
      console.log(`[ContainerRepost] Container ${containerId} já possui uma mensagem activa (${container.messageId}). Evitando postagem duplicada.`);
      return;
    }

    // Envia a nova mensagem utilizando o payload armazenado
    try {
      let discordPayload = container.payload as Record<string, any>;
      let sentMessageId: string;

      const isStructured = !discordPayload.content && !discordPayload.embeds;
      let structuredPayload = isStructured ? (container.payload as any) : null;

      if (isStructured) {
        console.log(`[ContainerRepost] Renderizando ContainerPayload estruturado (tipo: ${container.type}) para formato do Discord API`);
        
        // Busca detalhes da Guild do Discord API para resolver as variáveis dinâmicas
        let guildName = container.guild.name;
        let memberCountStr = '0';

        try {
          const guildDetails = (await rest.get(Routes.guild(container.guild.discordId), {
            query: new URLSearchParams({ with_counts: 'true' }),
          })) as { name: string; approximate_member_count?: number };

          guildName = guildDetails.name;
          if (guildDetails.approximate_member_count !== undefined) {
            memberCountStr = guildDetails.approximate_member_count.toLocaleString('pt-BR');
          }
        } catch (guildErr) {
          console.warn(`[ContainerRepost] Falha ao buscar detalhes da Guild ${container.guild.discordId} do Discord API. Usando DB fallback.`, guildErr);
        }

        const placeholdersContext: Record<string, string> = {
          welcomeUser: '@membro',
          serverName: guildName,
          memberCount: memberCountStr,
          authorName: 'Administração',
        };

        // Painel de ranking: injeta o conteúdo vivo (recalculado a cada repost)
        // antes de renderizar — nunca lido do payload salvo no banco.
        if (container.type === 'ranking_panel') {
          console.log(`[ContainerRepost] Painel de ranking detectado — injetando conteúdo vivo do ranking.`);
          structuredPayload = await injectRankingContent(structuredPayload as RankingPanelPayload, container.guildId);
        }

        discordPayload = buildContainerDiscordPayload(structuredPayload, placeholdersContext);
      }

      // Se houver configuração de webhook customizado, tenta enviar via Webhook do Discord
      if (structuredPayload?.customWebhook?.name) {
        try {
          const webhookConfig = structuredPayload.customWebhook;
          
          console.log(`[ContainerRepost] Buscando webhooks no canal ${channelId} para envio com identidade customizada...`);
          // 1. Busca webhooks existentes no canal
          const webhooks = (await rest.get(Routes.channelWebhooks(channelId))) as any[];
          
          // Procura um webhook pertencente ao bot
          let targetWebhook = webhooks.find(
            (wh) => wh.application_id === env.DISCORD_CLIENT_ID || wh.user?.id === env.DISCORD_CLIENT_ID
          );

          // Se não existir, cria um
          if (!targetWebhook) {
            console.log(`[ContainerRepost] Nenhum webhook existente encontrado. Criando novo webhook 'Dave Integration' no canal ${channelId}`);
            targetWebhook = await rest.post(Routes.channelWebhooks(channelId), {
              body: {
                name: 'Dave Integration',
              },
            });
          }

          console.log(`[ContainerRepost] Enviando mensagem via Webhook ${targetWebhook.id} com identidade: ${webhookConfig.name}`);

          const webhookResponse = (await rest.post(
            Routes.webhook(targetWebhook.id, targetWebhook.token),
            {
              query: new URLSearchParams({ wait: 'true' }),
              body: {
                ...discordPayload,
                username: webhookConfig.name,
                avatar_url: webhookConfig.avatarUrl || undefined,
              },
            }
          )) as { id: string };

          sentMessageId = webhookResponse.id;
        } catch (webhookErr) {
          console.warn('[ContainerRepost] Falha ao enviar via webhook customizado. Fallback para envio padrão como Bot.', webhookErr);
          
          // Fallback para envio normal como bot
          const sentMessage = (await rest.post(Routes.channelMessages(channelId), {
            body: discordPayload,
          })) as { id: string };
          sentMessageId = sentMessage.id;
        }
      } else {
        // Envio normal como bot
        console.log(`[ContainerRepost] Enviando mensagem de container persistente no canal ${channelId} via REST Bot`);
        const sentMessage = (await rest.post(Routes.channelMessages(channelId), {
          body: discordPayload,
        })) as { id: string };
        sentMessageId = sentMessage.id;
      }

      // Atualiza o id da nova mensagem no banco
      await prisma.guildContainer.update({
        where: { id: container.id },
        data: { messageId: sentMessageId },
      });

      console.log(`[ContainerRepost] Container ${container.id} repostado com sucesso. Nova MessageID: ${sentMessageId}`);
    } catch (error) {
      console.error(`[ContainerRepost] Falha ao reenviar mensagem do container ${container.id}:`, error);
      throw error; // BullMQ faz retry
    }
  }
}
