import { prisma } from '@dave/database';
import { infoEmbed } from '@dave/discord-kit';
import { Routes } from 'discord.js';
import type { GuildOnboardingJobData } from '@dave/shared-types';
import { rest } from '../index.js';

// ---------------------------------------------------------------------------
// jobs/guild-onboarding.ts — Onboarding de novas guilds
//
// Executado quando o bot entra em um novo servidor (evento guildCreate).
// Registra a guild no DB, cria configurações padrão, e envia as boas-vindas.
// ---------------------------------------------------------------------------

export async function handleGuildOnboarding(data: GuildOnboardingJobData): Promise<void> {
  const { guildId, ownerDiscordId, guildName } = data;

  console.log(`[Onboarding] Iniciando onboarding para a guild: ${guildName} (${guildId})`);

  // 1. Registra a guild e as configurações padrão no banco
  let guild = await prisma.guild.findUnique({
    where: { discordId: guildId },
  });

  if (!guild) {
    guild = await prisma.guild.create({
      data: {
        discordId: guildId,
        name: guildName,
        ownerDiscordId,
        isActive: true,
      },
    });
  } else {
    // Se a guild existia (talvez desativada), reativa-la
    await prisma.guild.update({
      where: { id: guild.id },
      data: { isActive: true, name: guildName, ownerDiscordId },
    });
  }

  // Garante GuildSettings
  await prisma.guildSettings.upsert({
    where: { guildId: guild.id },
    update: {},
    create: {
      guildId: guild.id,
      locale: 'pt-BR',
    },
  });

  // 1.1 Garante que o User correspondente ao dono do servidor existe para vincular a assinatura
  const ownerUser = await prisma.user.upsert({
    where: { discordId: ownerDiscordId },
    update: {},
    create: {
      discordId: ownerDiscordId,
      username: `owner_${ownerDiscordId}`,
    },
  });

  // Vincula o ownerUserId na guilda recém-criada/atualizada se não estiver preenchido
  if (!guild.ownerUserId) {
    guild = await prisma.guild.update({
      where: { id: guild.id },
      data: { ownerUserId: ownerUser.id },
    });
  }

  // 1.2 Ativa trial automático de 7 dias do plano Pro caso a guilda nunca tenha tido assinaturas
  const existingSub = await prisma.subscription.findFirst({
    where: { guildId: guild.id },
  });

  if (!existingSub) {
    const proPlan = await prisma.plan.findFirst({
      where: { code: 'pro' },
    });

    if (proPlan) {
      await prisma.subscription.create({
        data: {
          guildId: guild.id,
          planId: proPlan.id,
          createdByUserId: ownerUser.id,
          status: 'TRIALING',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias de trial
          provider: 'MERCADO_PAGO',
        },
      });
      console.log(`[Onboarding] Trial automático de 7 dias do plano Pro ativado para a guild: ${guildName}`);
    }
  }

  // 2. Tenta enviar DM ao dono com embed de boas-vindas
  const embed = infoEmbed(
    'Olá! O Dave foi adicionado ao seu servidor.',
    `O bot **${guildName}** foi adicionado com sucesso e está pronto para ser configurado.\n\n` +
      `🔗 **[Acessar Painel Web / Dashboard](http://localhost:3001)**\n\n` +
      `Ou, se preferir, execute o comando de configuração diretamente no seu servidor:\n` +
      `**\`/setup\`**\n\n` +
      `*A configuração inicial de canal de texto padrão e cargos autorizados é necessária para habilitar todas as funções do bot.*`
  );

  let dmSent = false;
  try {
    // Cria o canal DM
    const dmChannel = (await rest.post(Routes.userChannels(), {
      body: { recipient_id: ownerDiscordId },
    })) as { id: string };

    // Envia o embed
    await rest.post(Routes.channelMessages(dmChannel.id), {
      body: { embeds: [embed.toJSON()] },
    });
    dmSent = true;
    console.log(`[Onboarding] DM enviada com sucesso para o dono: ${ownerDiscordId}`);
  } catch (dmError) {
    console.warn(`[Onboarding] Falha ao enviar DM para o dono ${ownerDiscordId}:`, dmError);
  }

  // 3. Se a DM falhar, tenta enviar no canal de texto disponível
  if (!dmSent) {
    try {
      const discordGuild = (await rest.get(Routes.guild(guildId))) as { system_channel_id?: string | null };
      let targetChannelId = discordGuild.system_channel_id;

      if (!targetChannelId) {
        // Busca canais da guild e filtra por texto
        const channels = (await rest.get(Routes.guildChannels(guildId))) as { id: string; type: number; name: string }[];
        const textChannel = channels.find((c) => c.type === 0); // 0 = GuildText
        if (textChannel) {
          targetChannelId = textChannel.id;
        }
      }

      if (targetChannelId) {
        await rest.post(Routes.channelMessages(targetChannelId), {
          body: {
            content: `<@${ownerDiscordId}>`,
            embeds: [embed.toJSON()],
          },
        });
        console.log(`[Onboarding] Postou mensagem de onboarding no canal ${targetChannelId}`);
      } else {
        console.warn(`[Onboarding] Nenhum canal de texto encontrado para postar onboarding na guild ${guildId}`);
      }
    } catch (fallbackError) {
      console.error(`[Onboarding] Falha ao postar no canal de texto alternativo na guild ${guildId}:`, fallbackError);
    }
  }

  // 4. Cria log de auditoria
  await prisma.auditLog.create({
    data: {
      guildId: guild.id,
      action: 'bot.joined',
      metadata: {
        guildName,
        ownerDiscordId,
        dmSent,
      },
    },
  });
}
