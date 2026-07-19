// packages/discord-kit/src/features/inventory.ts
import { prisma, type Prisma } from '@dave/database';
import { logFeatureEvent } from '../logging/log-event.js';

/**
 * Ajusta de forma atômica a quantidade de um item do inventário e registra a movimentação.
 * Esta é a única fonte de verdade autorizada a mutar a quantidade de itens no sistema (Seção 22.2.1).
 */
export async function adjustItemQuantity(
  guildId: string,
  itemId: string,
  quantityDelta: number,
  userId: string,
  reason?: string
) {
  return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Atualiza atômica no banco usando increment
    const updatedItem = await tx.inventoryItem.update({
      where: { id: itemId, guildId },
      data: {
        currentQuantity: {
          increment: quantityDelta,
        },
      },
    });

    // 2. Cria a movimentação de auditoria
    const movement = await tx.inventoryMovement.create({
      data: {
        itemId,
        guildId,
        quantityDelta,
        resultingQuantity: updatedItem.currentQuantity,
        performedByUserId: userId,
        reason: reason || null,
      },
    });

    // 3. Dispara log transversal no canal correspondente (Seção 25.3)
    const logPayload = {
      embeds: [
        {
          title: `📦 Movimentação de Inventário: ${updatedItem.name}`,
          description: `A quantidade do item foi ajustada.`,
          color: quantityDelta >= 0 ? 0x248046 : 0xda373c, // Verde para adição, Vermelho para retirada
          fields: [
            { name: 'Ajuste', value: `${quantityDelta >= 0 ? '+' : ''}${quantityDelta}`, inline: true },
            { name: 'Novo Saldo', value: `${updatedItem.currentQuantity}`, inline: true },
            { name: 'Executado por', value: `<@${userId}>`, inline: true },
            { name: 'Motivo', value: reason || 'Nenhum informado', inline: false },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    await logFeatureEvent(guildId, 'INVENTORY', logPayload);

    return { item: updatedItem, movement };
  });
}
