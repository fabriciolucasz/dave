import { ApplicationCommandType } from "discord.js";
import { createCommand } from "../../../utils/index.js"

createCommand({
    name: "ping",
    description: "Verifica a latência do bot",
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        const ping = interaction.client.ws.ping;
        await interaction.reply({
            content: `🏓 Pong! Latência: **${ping}ms**`,
            flags: ["Ephemeral"]
        });
    }
});
