import {
  SlashCommandBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { defineCommand, createResponder, infoEmbed, successEmbed, errorEmbed } from '@dave/discord-kit';
import { prisma } from '@dave/database';

// ---------------------------------------------------------------------------
// commands/setup.ts — Assistente de Configuração do Servidor (/setup)
//
// Permite que administradores configurem o canal padrão e cargos que
// podem gerenciar o bot de forma interativa.
// ---------------------------------------------------------------------------

export const setupCommand = defineCommand({
  type: 'slash',
  name: 'setup',
  description: 'Configura o canal padrão e cargos autorizados do bot.',
  build: (builder) =>
    builder.setDMPermission(false),

  async execute(interaction) {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;

    if (!isAdmin) {
      const responder = createResponder(interaction);
      await responder.sendEphemeral({
        embeds: [errorEmbed('Acesso Negado', 'Somente administradores podem utilizar este comando.')],
      });
      return;
    }

    // Inicia a Etapa 1
    const selectChannel = new ChannelSelectMenuBuilder()
      .setCustomId('setup:channel')
      .setPlaceholder('Selecione o canal padrão para o bot...')
      .addChannelTypes(ChannelType.GuildText);

    const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(selectChannel);

    const responder = createResponder(interaction);
    await responder.sendEphemeral({
      embeds: [
        infoEmbed(
          'Configuração do Dave — Etapa 1 de 3',
          'Por favor, escolha o **canal de texto** que o bot utilizará para enviar as mensagens e notificações padrão.'
        ),
      ],
      components: [row as any],
    });
  },
});

// ---------------------------------------------------------------------------
// Handlers de interação para o assistente de setup (componentRouter)
// ---------------------------------------------------------------------------

export const setupInteractionHandlers = {
  // Etapa 1 -> Etapa 2
  async handleChannelSelect(interaction: any): Promise<void> {
    const selectedChannelId = interaction.values[0];

    const selectRoles = new RoleSelectMenuBuilder()
      .setCustomId(`setup:roles:${selectedChannelId}`)
      .setPlaceholder('Selecione os cargos permitidos...')
      .setMinValues(1)
      .setMaxValues(5);

    const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(selectRoles);

    await interaction.update({
      embeds: [
        infoEmbed(
          'Configuração do Dave — Etapa 2 de 3',
          `Canal selecionado: <#${selectedChannelId}>\n\n` +
            'Agora selecione quais **cargos (roles)** do servidor terão permissão para interagir e gerenciar as funções administrativas do bot.'
        ),
      ],
      components: [row as any],
    });
  },

  // Etapa 2 -> Etapa 3
  async handleRolesSelect(interaction: any, [channelId]: string[]): Promise<void> {
    const selectedRoleIds = interaction.values;
    const rolesPayload = selectedRoleIds.join(',');

    const btnConfirm = new ButtonBuilder()
      .setCustomId(`setup:confirm:${channelId}:${rolesPayload}`)
      .setLabel('Confirmar')
      .setStyle(ButtonStyle.Success);

    const btnRestart = new ButtonBuilder()
      .setCustomId('setup:refazer')
      .setLabel('Refazer')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnConfirm, btnRestart);

    await interaction.update({
      embeds: [
        infoEmbed(
          'Configuração do Dave — Etapa 3 de 3 (Confirmação)',
          'Revise os dados abaixo antes de salvar a configuração:\n\n' +
            `**Canal Padrão:** <#${channelId}>\n` +
            `**Cargos Permitidos:** ${selectedRoleIds.map((id: string) => `<@&${id}>`).join(', ')}`
        ),
      ],
      components: [row as any],
    });
  },

  // Confirmar -> Salva no DB
  async handleConfirm(interaction: any, [channelId, rolesPayload]: string[]): Promise<void> {
    if (!channelId || !rolesPayload) {
      await interaction.update({
        embeds: [errorEmbed('Configuração Inválida', 'Dados da configuração corrompidos. Reinicie o setup.')],
        components: [],
      });
      return;
    }

    const guildDiscordId = interaction.guildId;
    const roleIds = rolesPayload.split(',');

    // Busca a guild no banco
    let guild = await prisma.guild.findUnique({
      where: { discordId: guildDiscordId },
    });

    if (!guild) {
      // Caso não exista por algum motivo (ex: falhou onboarding), cria na hora
      guild = await prisma.guild.create({
        data: {
          discordId: guildDiscordId,
          name: interaction.guildId, // fallback name
          ownerDiscordId: 'unknown',
        },
      });
    }

    // Salva as configurações
    const settings = await prisma.guildSettings.upsert({
      where: { guildId: guild.id },
      update: {
        defaultChannelId: channelId,
        allowedRoleIds: roleIds,
      },
      create: {
        guildId: guild.id,
        defaultChannelId: channelId,
        allowedRoleIds: roleIds,
      },
    });

    // Registra auditoria
    await prisma.auditLog.create({
      data: {
        guildId: guild.id,
        action: 'setup.completed',
        metadata: {
          channelId,
          allowedRoleIds: roleIds,
          updatedBy: interaction.user.id,
        },
      },
    });

    await interaction.update({
      embeds: [
        successEmbed(
          'Configuração Concluída!',
          `O Dave foi configurado com sucesso para este servidor.\n\n` +
            `**Canal de postagens:** <#${channelId}>\n` +
            `**Cargos permitidos:** ${roleIds.map((id) => `<@&${id}>`).join(', ')}\n\n` +
            `*Para assinar e liberar as ferramentas premium do bot, utilize o comando \`/assinar\`.*`
        ),
      ],
      components: [],
    });
  },

  // Refazer -> Reinicia o assistente
  async handleRestart(interaction: any): Promise<void> {
    const selectChannel = new ChannelSelectMenuBuilder()
      .setCustomId('setup:channel')
      .setPlaceholder('Selecione o canal padrão para o bot...')
      .addChannelTypes(ChannelType.GuildText);

    const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(selectChannel);

    await interaction.update({
      embeds: [
        infoEmbed(
          'Configuração do Dave — Etapa 1 de 3',
          'Por favor, escolha o **canal de texto** que o bot utilizará para enviar as mensagens e notificações padrão.'
        ),
      ],
      components: [row as any],
    });
  },
};
