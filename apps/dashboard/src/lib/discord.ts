// apps/dashboard/src/lib/discord.ts
import { env } from '@dave/config';

/**
 * Builds the Discord OAuth2 bot-invite URL used across the guild list /
 * add-bot empty states. Single source of truth so the URL construction
 * isn't duplicated across pages.
 */
export function getBotInviteUrl(): string {
  return `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;
}
