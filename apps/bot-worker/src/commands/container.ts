import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  Routes,
} from 'discord.js';
import { defineCommand, createResponder, successEmbed, errorEmbed, warningEmbed } from '@dave/discord-kit';
import { prisma } from '@dave/database';
import { rest } from '../index.js';

// ---------------------------------------------------------------------------
// commands/container.ts — Comando /container
//
// Gerencia mensagens persistentes ("sticky messages") no servidor.
// Subcomandos:
//   - /container create  → Cria e ativa uma mensagem persistente
//   - /container disable → Desativa uma mensagem persistente ativa
// ---------------------------------------------------------------------------

export const containerCommand = defineCommand({
  type: 'slash',
  name: 'container',
  description: 'Gerencia mensagens persistentes (Sticky Messages).',
  build: (builder) =>
    builder
      .addSubcommand((sub) =>
        sub
          .setName('create')
          .setDescription('Cria e envia um container persistente no canal.')
          .addStringOption((opt) =>
            opt
              .setName('type')
              .setDescription('Tipo semântico (ex: regras, boas-vindas, custom)')
              .setRequired(true)
          )
          .addChannelOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Canal onde fixar a mensagem (opcional)')
              .addChannelTypes(ChannelType.GuildText)
          )
          .addStringOption((opt) =>
            opt.setName('content').setDescription('Conteúdo em texto da mensagem (opcional)')
          )
          .addStringOption((opt) =>
            opt.setName('embed_title').setDescription('Título do embed (opcional)')
          )
          .addStringOption((opt) =>
            opt.setName('embed_description').setDescription('Descrição do embed (opcional)')
          )
          .addStringOption((opt) =>
            opt.setName('embed_color').setDescription('Cor hex do embed, ex: #5865F2 (opcional)')
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('disable')
          .setDescription('Desativa e remove um container persistente.')
          .addStringOption((opt) =>
            opt
              .setName('type')
              .setDescription('Tipo do container a desativar')
              .setRequired(true)
          )
          .addChannelOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Canal do container (opcional)')
              .addChannelTypes(ChannelType.GuildText)
          )
      )
      .setDMPermission(false),

  async execute(interaction) {
    const responder = createResponder(interaction);

    // Verifica se o usuário é administrador
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isAdmin) {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Acesso Negado', 'Somente administradores podem utilizar este comando.')],
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const guildDiscordId = interaction.guildId!;

    // Busca a guild no banco
    const dbGuild = await prisma.guild.findUnique({
      where: { discordId: guildDiscordId },
      include: { settings: true },
    });

    if (!dbGuild) {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro', 'Guild não registrada no banco. Execute `/setup` primeiro.')],
      });
      return;
    }

    // ---------------------------------------------------------------------------
    // Subcomando: /container create
    // ---------------------------------------------------------------------------
    if (subcommand === 'create') {
      await responder.defer(true);

      const type = interaction.options.getString('type', true).toLowerCase();
      const channelOption = interaction.options.getChannel('channel');
      const content = interaction.options.getString('content');
      const embedTitle = interaction.options.getString('embed_title');
      const embedDescription = interaction.options.getString('embed_description');
      const embedColor = interaction.options.getString('embed_color');

      // Determina o canal de envio (opção do comando -> config default -> canal atual)
      const channelId = channelOption?.id || dbGuild.settings?.defaultChannelId || interaction.channelId;

      if (!channelId) {
        await responder.send({
          embeds: [errorEmbed('Canal Inválido', 'Não foi possível determinar o canal para postar o container.')],
        });
        return;
      }

      if (!content && !embedTitle && !embedDescription) {
        await responder.send({
          embeds: [
            errorEmbed(
              'Parâmetros Ausentes',
              'Você deve preencher pelo menos um dos campos: `content`, `embed_title` ou `embed_description`.'
            ),
          ],
        });
        return;
      }

      // Constrói o payload para envio REST
      const payload: Record<string, any> = {};
      if (content) {
        payload.content = content;
      }

      if (embedTitle || embedDescription) {
        const embed: Record<string, any> = {};
        if (embedTitle) embed.title = embedTitle;
        if (embedDescription) embed.description = embedDescription;
        if (embedColor) {
          // Converte cor hex para decimal int
          const cleanHex = embedColor.replace('#', '');
          embed.color = parseInt(cleanHex, 16) || 0x5865f2;
        } else if (dbGuild.settings?.embedColor) {
          embed.color = parseInt(dbGuild.settings.embedColor.replace('#', ''), 16);
        } else {
          embed.color = 0x5865f2; // default blurple
        }
        payload.embeds = [embed];
      }

      try {
        // 1. Desativa qualquer container ativo do mesmo tipo no mesmo canal para evitar duplicatas
        await prisma.guildContainer.updateMany({
          where: {
            guildId: dbGuild.id,
            channelId,
            type,
            isActive: true,
          },
          data: { isActive: false },
        });

        // 2. Envia a mensagem no canal via REST
        console.log(`[Container Command] Enviando container type=${type} no canal ${channelId}`);
        const sentMessage = (await rest.post(Routes.channelMessages(channelId), {
          body: payload,
        })) as { id: string };

        // 3. Salva o novo container no banco
        const container = await prisma.guildContainer.create({
          data: {
            guildId: dbGuild.id,
            channelId,
            messageId: sentMessage.id,
            type,
            payload: payload as any,
            isActive: true,
            repostDelay: 30, // 30s default
          },
        });

        // Registra auditoria
        await prisma.auditLog.create({
          data: {
            guildId: dbGuild.id,
            action: 'container.created',
            metadata: {
              containerId: container.id,
              type,
              channelId,
              messageId: sentMessage.id,
            },
          },
        });

        await responder.send({
          embeds: [
            successEmbed(
              'Container Criado com Sucesso!',
              `Mensagem persistente de tipo \`${type}\` foi enviada no canal <#${channelId}>.\n` +
                `Ela será monitorada e reenviada caso seja deletada.`
            ),
          ],
        });
      } catch (err: any) {
        console.error('[Container Command] Falha ao criar container:', err);
        await responder.send({
          embeds: [errorEmbed('Erro na Criação', 'Falha ao enviar mensagem ou salvar no banco de dados.')],
        });
      }
    }

    // ---------------------------------------------------------------------------
    // Subcomando: /container disable
    // ---------------------------------------------------------------------------
    if (subcommand === 'disable') {
      await responder.defer(true);

      const type = interaction.options.getString('type', true).toLowerCase();
      const channelOption = interaction.options.getChannel('channel');

      // Condição de busca
      const whereClause: any = {
        guildId: dbGuild.id,
        type,
        isActive: true,
      };
      if (channelOption) {
        whereClause.channelId = channelOption.id;
      }

      const activeContainers = await prisma.guildContainer.findMany({
        where: whereClause,
      });

      if (activeContainers.length === 0) {
        await responder.send({
          embeds: [warningEmbed('Nenhum Encontrado', `Nenhum container ativo do tipo \`${type}\` foi encontrado.`)],
        });
        return;
      }

      try {
        // Desativa no banco
        await prisma.guildContainer.updateMany({
          where: whereClause,
          data: { isActive: false },
        });

        // Tenta deletar as mensagens existentes do canal para limpar
        for (const container of activeContainers) {
          if (container.messageId) {
            try {
              await rest.delete(Routes.channelMessage(container.channelId, container.messageId));
            } catch (delErr) {
              // Ignora se mensagem já não existia ou sem permissão
              console.warn(`[Container Command] Falha ao deletar mensagem legada ${container.messageId}:`, delErr);
            }
          }
        }

        // Registra auditoria
        await prisma.auditLog.create({
          data: {
            guildId: dbGuild.id,
            action: 'container.disabled',
            metadata: {
              type,
              count: activeContainers.length,
            },
          },
        });

        await responder.send({
          embeds: [
            successEmbed(
              'Container Desativado',
              `Desativados **${activeContainers.length}** container(s) do tipo \`${type}\` com sucesso.`
            ),
          ],
        });
      } catch (err: any) {
        console.error('[Container Command] Falha ao desativar container:', err);
        await responder.send({
          embeds: [errorEmbed('Erro', 'Falha ao desativar container no banco de dados.')],
        });
      }
    }
  },
});
