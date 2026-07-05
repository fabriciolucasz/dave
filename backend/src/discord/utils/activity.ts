import { ActivityOptions, ActivityType, Client } from "discord.js";

export function updateStatus(client: Client<true>) {
    const guildCount = client.guilds.cache.size;
    const activities: ActivityOptions[] = [
        {
            name: `Observando ${guildCount} servidor${guildCount !== 1 ? "s" : ""}`,
            type: ActivityType.Streaming,
            url: "https://www.twitch.tv/f4faz"
        }
    ];

    client.user.setActivity(activities[0]);
}
