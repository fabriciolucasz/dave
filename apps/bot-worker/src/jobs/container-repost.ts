import { prisma } from '@dave/database';
import { Routes } from 'discord.js';
import type { ContainerRepostJobData } from '@dave/shared-types';
import { rest } from '../index.js';
import { containerRepostQueue } from '@dave/queue';

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
    });

    if (!container || !container.isActive) {
      console.log(`[ContainerRepost] Container ${containerId} não existe ou foi desativado no intervalo. Repost cancelado.`);
      return;
    }

    if (container.messageId !== null) {
      console.log(`[ContainerRepost] Container ${containerId} já possui uma mensagem ativa (${container.messageId}). Evitando postagem duplicada.`);
      return;
    }

    // Envia a nova mensagem utilizando o payload armazenado
    try {
      const payload = container.payload as Record<string, unknown>;

      console.log(`[ContainerRepost] Enviando mensagem de container persistente no canal ${channelId}`);
      const sentMessage = (await rest.post(Routes.channelMessages(channelId), {
        body: payload,
      })) as { id: string };

      // Atualiza o id da nova mensagem no banco
      await prisma.guildContainer.update({
        where: { id: container.id },
        data: { messageId: sentMessage.id },
      });

      console.log(`[ContainerRepost] Container ${container.id} repostado com sucesso. Nova MessageID: ${sentMessage.id}`);
    } catch (error) {
      console.error(`[ContainerRepost] Falha ao reenviar mensagem do container ${container.id}:`, error);
      throw error; // BullMQ faz retry
    }
  }
}
