import {
  SlashCommandBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} from 'discord.js';
import { defineCommand, createResponder, infoEmbed, successEmbed, errorEmbed } from '@dave/discord-kit';
import { prisma } from '@dave/database';
import { env } from '@dave/config';

// ---------------------------------------------------------------------------
// commands/assinar.ts — Comando /assinar
//
// Exibe os planos disponíveis e gera links de checkout interativos
// para assinatura do bot usando Mercado Pago.
// ---------------------------------------------------------------------------

export const assinarCommand = defineCommand({
  type: 'slash',
  name: 'assinar',
  description: 'Exibe os planos disponíveis e inicia o fluxo de assinatura.',
  build: (builder) =>
    builder.setDMPermission(false),

  async execute(interaction) {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: 'asc' },
    });

    if (plans.length === 0) {
      const responder = createResponder(interaction);
      await responder.sendEphemeral({
        embeds: [errorEmbed('Nenhum Plano', 'Não existem planos de assinatura configurados no momento.')],
      });
      return;
    }

    const embed = infoEmbed(
      'Planos de Assinatura — Dave',
      'Escolha um dos planos abaixo para liberar todas as funcionalidades premium no seu servidor:\n\n' +
        plans
          .map(
            (plan) =>
              `🔹 **${plan.name}**\n` +
              `Preço: **R$ ${(plan.priceCents / 100).toFixed(2)} / mês**\n` +
              `Código: \`${plan.code}\`\n` +
              `Recursos: ${JSON.stringify(plan.features)}`
          )
          .join('\n\n')
    );

    // Cria botões para cada plano
    const buttons = plans.map((plan) =>
      new ButtonBuilder()
        .setCustomId(`assinar:checkout:${plan.id}`)
        .setLabel(`Assinar ${plan.name}`)
        .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    const responder = createResponder(interaction);
    await responder.sendEphemeral({
      embeds: [embed],
      components: plans.length > 0 ? [row as any] : [],
    });
  },
});

// ---------------------------------------------------------------------------
// Handlers de interação (componentRouter)
// ---------------------------------------------------------------------------

export const assinarInteractionHandlers = {
  async handleCheckout(interaction: any, [planId]: string[]): Promise<void> {
    const responder = createResponder(interaction);
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    if (!guildId) {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro', 'Este comando só pode ser utilizado dentro de um servidor.')],
      });
      return;
    }

    if (!planId) {
      await responder.sendEphemeral({
        embeds: [errorEmbed('Erro', 'ID do plano não fornecido.')],
      });
      return;
    }

    // Adia a resposta para dar tempo de chamar a API do Mercado Pago (pode demorar mais de 3s)
    await responder.defer(true);

    try {
      const plan = await prisma.plan.findUnique({
        where: { id: planId },
      });

      if (!plan) {
        await responder.send({
          embeds: [errorEmbed('Plano não encontrado', 'O plano selecionado não existe ou foi desativado.')],
        });
        return;
      }

      // Busca o email do usuário no banco ou usa um fallback
      const dbUser = await prisma.user.findUnique({
        where: { discordId: userId },
      });

      const payerEmail = dbUser?.email || 'payer@example.com';

      // Cria a assinatura (preapproval) no Mercado Pago
      const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!accessToken) {
        throw new Error('MERCADO_PAGO_ACCESS_TOKEN não configurado.');
      }

      console.log(`[Assinar] Criando assinatura no Mercado Pago para Guild ${guildId}, User ${userId}, Plan ${plan.id}`);

      const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          back_url: `${env.API_BASE_URL}/subscriptions/callback`,
          reason: `Assinatura Dave - Plano ${plan.name}`,
          external_reference: `${guildId}:${plan.id}:${dbUser?.id || 'unknown'}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: plan.priceCents / 100,
            currency_id: 'BRL',
          },
          payer_email: payerEmail,
          status: 'pending',
        }),
      });

      if (!mpResponse.ok) {
        const errDetails = await mpResponse.text();
        console.error('[Assinar] Erro do Mercado Pago:', errDetails);
        throw new Error(`Mercado Pago retornou status ${mpResponse.status}`);
      }

      const mpData = (await mpResponse.json()) as { init_point: string };

      const checkoutButton = new ButtonBuilder()
        .setLabel('Ir para o Pagamento')
        .setStyle(ButtonStyle.Link)
        .setURL(mpData.init_point);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(checkoutButton);

      await responder.send({
        embeds: [
          successEmbed(
            'Link de Pagamento Gerado!',
            `Sua assinatura para o plano **${plan.name}** está pronta.\n\n` +
              `Clique no botão abaixo para prosseguir com o pagamento de **R$ ${(plan.priceCents / 100).toFixed(2)} / mês** via Mercado Pago.`
          ),
        ],
        components: [row as any],
      });
    } catch (error: any) {
      console.error('[Assinar] Erro ao processar checkout:', error);
      await responder.send({
        embeds: [errorEmbed('Erro no Pagamento', 'Houve uma falha ao gerar o link do Mercado Pago. Tente novamente mais tarde.')],
      });
    }
  },
};
