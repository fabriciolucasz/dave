import { CommandInteraction } from "discord.js";
import { Dave } from "../core/app.js";
import ck from "chalk";

/**
 * Middleware para validar se a Guild possui uma assinatura ativa.
 */
export async function checkSubscription(interaction: CommandInteraction, block: () => void): Promise<void> {
    const { guildId } = interaction;
    if (!guildId) return;

    const app = Dave.getInstance();

    try {
        const guildData = await app.db.guild.findUnique({
            where: { id: guildId },
            include: { subscription: true }
        });

        if (!guildData || !guildData.isActive) {
            await interaction.reply({
                content: "❌ Este servidor não possui uma assinatura ativa. Entre em contato com o administrador.",
                ephemeral: true
            });
            return block();
        }

        // Verifica expiração
        if (guildData.expiresAt && new Date() > guildData.expiresAt) {
            // Atualiza status para inativo se expirou
            await app.db.guild.update({
                where: { id: guildId },
                data: { isActive: false }
            });

            await interaction.reply({
                content: "❌ A assinatura deste servidor expirou.",
                ephemeral: true
            });
            return block();
        }
    } catch (error) {
        console.error(ck.red("Erro ao validar assinatura:"), error);
        await interaction.reply({
            content: "❌ Ocorreu um erro ao validar sua assinatura. Tente novamente mais tarde.",
            ephemeral: true
        });
        return block();
    }
}
