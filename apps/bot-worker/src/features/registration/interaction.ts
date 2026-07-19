// apps/bot-worker/src/features/registration/interaction.ts
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  type ModalSubmitInteraction,
  type ButtonInteraction,
} from 'discord.js';
import { REST, Routes } from 'discord.js';
import { prisma } from '@dave/database';
import { env } from '@dave/config';
import { successEmbed, errorEmbed, infoEmbed, createResponder, logFeatureEvent } from '@dave/discord-kit';
import { checkSubscription } from '../../middleware/subscription.js';
import { rest } from '../../index.js';

// ---------------------------------------------------------------------------
// features/registration/interaction.ts — Painel de Cadastro (seção 26.5)
//
// Fluxo:
//   1. Membro clica "Realizar Cadastro" → abre modal.
//   2. Modal submit: normaliza telefone, valida apelido no servidor de referência.
//   3. Posta container de aprovação no canal de log (com avatar thumbnail).
//   4. Staff clica "Aprovar"/"Negar" no container de aprovação.
// ---------------------------------------------------------------------------

const restClient = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

/**
 * Normaliza número de telefone para apenas dígitos.
 * Ex: "(11) 91234-5678" → "11912345678"
 */
function normalizePhoneNumber(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Verifica se o número de telefone normalizado é válido (mínimo 8 dígitos).
 */
function isValidPhone(normalized: string): boolean {
  return normalized.length >= 8 && normalized.length <= 15;
}

export const registrationBotHandlers = {
  // 1. Clicou em "Realizar Cadastro" → abre modal
  async handleStart(interaction: ButtonInteraction) {
    // checkSubscription — não executar se assinatura inativa
    const sub = await checkSubscription(interaction.guildId!);
    if (!sub.isActive) {
      const responder = createResponder(interaction);
      await responder.sendEphemeral({
        embeds: [infoEmbed('Acesso Bloqueado', 'Este servidor não possui assinatura ativa. Use `/assinar`.')],
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('registration:submit')
      .setTitle('Cadastro de Personagem');

    const nameInput = new TextInputBuilder()
      .setCustomId('characterName')
      .setLabel('Nome do Personagem (Igual ao do Jogo)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const idInput = new TextInputBuilder()
      .setCustomId('characterServerId')
      .setLabel('Passaporte (ID numérico do servidor de RP)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);

    const phoneInput = new TextInputBuilder()
      .setCustomId('phoneNumber')
      .setLabel('Telefone (Ex: 555-0199 ou 11912345678)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(20);

    const referredInput = new TextInputBuilder()
      .setCustomId('referredBy')
      .setLabel('Quem te indicou? (opcional)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(idInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(phoneInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(referredInput),
    );

    await interaction.showModal(modal);
  },

  // 2. Envio do modal de cadastro
  async handleSubmit(interaction: ModalSubmitInteraction) {
    const responder = createResponder(interaction);
    const characterName = interaction.fields.getTextInputValue('characterName').trim();
    const idStr = interaction.fields.getTextInputValue('characterServerId').trim();
    const phoneRaw = interaction.fields.getTextInputValue('phoneNumber').trim();
    const referredBy = interaction.fields.getTextInputValue('referredBy').trim() || null;

    // Valida ID numérico
    const characterServerId = parseInt(idStr, 10);
    if (isNaN(characterServerId) || characterServerId <= 0) {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro de Validação', 'O passaporte deve ser um número inteiro positivo.')],
      });
      return;
    }

    // Normaliza e valida telefone
    const phoneNumber = normalizePhoneNumber(phoneRaw);
    if (!isValidPhone(phoneNumber)) {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro de Validação', 'Por favor, informe um número de telefone válido (mínimo 8 dígitos).')],
      });
      return;
    }

    const guild = await prisma.guild.findUnique({
      where: { discordId: interaction.guildId! },
    });
    if (!guild) return;

    // Valida apelido no servidor de referência (seção 24.3)
    const referenceGuildId = process.env.SERVER_ID || interaction.guildId!;
    let nicknameAtSubmission = '';
    let status: 'VERIFIED' | 'MISMATCH' | 'PENDING' = 'PENDING';

    try {
      const member = await restClient.get(
        Routes.guildMember(referenceGuildId, interaction.user.id)
      ) as { nick?: string; user: { username: string; avatar?: string } };
      nicknameAtSubmission = member.nick || '';

      if (nicknameAtSubmission) {
        // Regex: #ID Nome (seção 24.3)
        const match = nicknameAtSubmission.match(/^#(\d+)\s+(.+)$/);
        if (match?.[1] && match?.[2]) {
          const parsedId = parseInt(match[1], 10);
          const parsedName = match[2].trim().toLowerCase();
          if (parsedId === characterServerId && parsedName === characterName.toLowerCase()) {
            status = 'VERIFIED';
          } else {
            status = 'MISMATCH';
          }
        }
      }
    } catch (err) {
      console.warn(`[Cadastro] Não foi possível ler apelido do usuário ${interaction.user.id} na guild ${referenceGuildId}:`, err);
    }

    try {
      const registration = await prisma.characterRegistration.create({
        data: {
          guildId: guild.id,
          discordUserId: interaction.user.id,
          characterName,
          characterServerId,
          phoneNumber, // já normalizado
          referredByUserId: referredBy,
          status,
          nicknameAtSubmission,
        },
      });

      // Dispara log transversal — container de aprovação para a staff (seção 26.5)
      const statusColor =
        status === 'VERIFIED' ? 0x248046 : status === 'MISMATCH' ? 0xda373c : 0xffc44f;
      const statusLabel =
        status === 'VERIFIED' ? '✅ VERIFICADO (automático)' :
        status === 'MISMATCH' ? '⚠️ DIVERGÊNCIA — revisão manual necessária' :
        '⏳ PENDENTE — revisão manual necessária';

      // Avatar do usuário para o thumbnail (seção 26.5 — SectionBuilder + thumbnail)
      const avatarUrl = interaction.user.displayAvatarURL({ size: 128 });

      // Monta o payload de log com embed rico + botões de aprovar/negar
      const logPayload: Record<string, unknown> = {
        embeds: [
          {
            title: `📝 Novo Cadastro — ${characterName}`,
            description: `Cadastro submetido por <@${interaction.user.id}>.\n\n**Status:** ${statusLabel}`,
            color: statusColor,
            thumbnail: { url: avatarUrl },
            fields: [
              { name: 'Nome do Personagem', value: characterName, inline: true },
              { name: 'Passaporte (ID RP)', value: `#${characterServerId}`, inline: true },
              { name: 'Telefone', value: phoneNumber, inline: true },
              { name: 'Apelido Lido', value: nicknameAtSubmission || '*Sem apelido no padrão #ID Nome*', inline: true },
              { name: 'Indicado por', value: referredBy || '*Não informado*', inline: true },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: `ID: ${registration.id}` },
          },
        ],
      };

      // Botões de aprovação manual — sempre disponíveis para MISMATCH e PENDING
      if (status !== 'VERIFIED') {
        logPayload.components = [
          {
            type: 1, // ACTION_ROW
            components: [
              {
                type: 2, // BUTTON
                style: 3, // SUCCESS
                label: '✅ Aprovar',
                custom_id: `registration:approve:${registration.id}`,
              },
              {
                type: 2, // BUTTON
                style: 4, // DANGER
                label: '❌ Negar',
                custom_id: `registration:reject:${registration.id}`,
              },
            ],
          },
        ];
      }

      await logFeatureEvent(guild.id, 'REGISTRATION', logPayload);

      // Resposta para o usuário
      if (status === 'VERIFIED') {
        await responder.sendEphemeral({
          embeds: [
            successEmbed(
              '✅ Cadastro Verificado',
              `Seu cadastro foi verificado automaticamente com sucesso!\n\n` +
              `**Nome:** ${characterName}\n` +
              `**Passaporte:** #${characterServerId}\n` +
              `**Telefone:** ${phoneNumber}`,
            ),
          ],
        });
      } else if (status === 'MISMATCH') {
        await responder.sendEphemeral({
          embeds: [
            infoEmbed(
              '⚠️ Cadastro com Divergência',
              `Seu cadastro foi recebido, mas o nome ou passaporte não bate com seu apelido no Discord (\`${nicknameAtSubmission || 'sem apelido no padrão esperado'}\`).\n\n` +
              `Um administrador analisará e aprovará manualmente em breve.`,
            ),
          ],
        });
      } else {
        await responder.sendEphemeral({
          embeds: [
            infoEmbed(
              '⏳ Cadastro Enviado',
              `Seu cadastro foi recebido com sucesso!\n\n` +
              `Como não conseguimos localizar seu apelido automaticamente, um administrador revisará manualmente.`,
            ),
          ],
        });
      }
    } catch (err) {
      console.error('[Cadastro] Erro ao processar cadastro:', err);
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao processar o seu cadastro. Por favor, tente novamente.')],
      });
    }
  },

  // 3. Staff clicou "Aprovar"
  async handleApprove(interaction: ButtonInteraction, payload: string[]) {
    const [registrationId] = payload;
    const responder = createResponder(interaction);

    if (!registrationId) {
      await responder.sendEphemeral({ embeds: [errorEmbed('Erro', 'ID de cadastro inválido.')] });
      return;
    }

    try {
      const registration = await prisma.characterRegistration.update({
        where: { id: registrationId },
        data: { status: 'VERIFIED', updatedAt: new Date() },
      });

      const guild = await prisma.guild.findUnique({ where: { id: registration.guildId } });
      if (guild) {
        await logFeatureEvent(guild.id, 'REGISTRATION', {
          embeds: [{
            title: '✅ Cadastro Aprovado Manualmente',
            description: `Cadastro de **${registration.characterName}** (#${registration.characterServerId}) aprovado por <@${interaction.user.id}>.`,
            color: 0x248046,
            timestamp: new Date().toISOString(),
          }],
        });
      }

      // Desabilita os botões na mensagem original atualizando-a
      await interaction.update({
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: '✅ Aprovado', custom_id: `registration:approve:${registrationId}`, disabled: true },
              { type: 2, style: 2, label: '❌ Negar', custom_id: `registration:reject:${registrationId}`, disabled: true },
            ],
          } as any,
        ],
      });
    } catch (err) {
      console.error('[Cadastro] Erro ao aprovar cadastro:', err);
      await responder.sendEphemeral({ embeds: [errorEmbed('Erro', 'Não foi possível aprovar o cadastro.')] });
    }
  },

  // 4. Staff clicou "Negar"
  async handleReject(interaction: ButtonInteraction, payload: string[]) {
    const [registrationId] = payload;
    const responder = createResponder(interaction);

    if (!registrationId) {
      await responder.sendEphemeral({ embeds: [errorEmbed('Erro', 'ID de cadastro inválido.')] });
      return;
    }

    try {
      const registration = await prisma.characterRegistration.update({
        where: { id: registrationId },
        data: { status: 'REJECTED', updatedAt: new Date() },
      });

      const guild = await prisma.guild.findUnique({ where: { id: registration.guildId } });
      if (guild) {
        await logFeatureEvent(guild.id, 'REGISTRATION', {
          embeds: [{
            title: '❌ Cadastro Negado',
            description: `Cadastro de **${registration.characterName}** (#${registration.characterServerId}) negado por <@${interaction.user.id}>.`,
            color: 0xda373c,
            timestamp: new Date().toISOString(),
          }],
        });
      }

      await interaction.update({
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 2, label: '✅ Aprovar', custom_id: `registration:approve:${registrationId}`, disabled: true },
              { type: 2, style: 4, label: '❌ Negado', custom_id: `registration:reject:${registrationId}`, disabled: true },
            ],
          } as any,
        ],
      });
    } catch (err) {
      console.error('[Cadastro] Erro ao negar cadastro:', err);
      await responder.sendEphemeral({ embeds: [errorEmbed('Erro', 'Não foi possível negar o cadastro.')] });
    }
  },
};
