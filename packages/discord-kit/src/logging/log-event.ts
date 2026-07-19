// packages/discord-kit/src/logging/log-event.ts
import { prisma } from '@dave/database';
import { REST, Routes } from 'discord.js';
import { env } from '@dave/config';

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

/**
 * Função utilitária transversal de log (Seção 25)
 * Dispara uma notificação formatada para o canal cadastrado da feature correspondente.
 */
export async function logFeatureEvent(
  guildId: string,
  feature: 'INVENTORY' | 'CENTRAL' | 'REGISTRATION',
  payload: Record<string, any>
): Promise<void> {
  try {
    // Busca a configuração de log
    const logConfig = await prisma.featureLogConfig.findUnique({
      where: {
        guildId_feature: {
          guildId,
          feature,
        },
      },
    });

    if (!logConfig || !logConfig.channelId) {
      // No-op silencioso se não configurado
      return;
    }

    console.log(`[logFeatureEvent] Enviando log de ${feature} na guilda ${guildId} para o canal ${logConfig.channelId}`);

    // Envia o payload (que deve ser embeds/components aceitos pelo REST API do Discord)
    await rest.post(Routes.channelMessages(logConfig.channelId), {
      body: payload,
    });
  } catch (err) {
    console.error(`[logFeatureEvent] Falha ao enviar log de ${feature} para a guilda ${guildId}:`, err);
  }
}
