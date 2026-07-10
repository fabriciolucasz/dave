// packages/discord-kit/src/containers/renderer.ts
import type { ContainerPayload } from './types.js';

/**
 * Converte o ContainerPayload estruturado (da Seção 18) em um payload JSON compatível
 * com o envio de mensagens do Discord (usado na API de webhooks/reposts).
 */
export function buildContainerDiscordPayload(payload: ContainerPayload): Record<string, any> {
  const colorHex = payload.accentColor || '#5865f2';
  const cleanHex = colorHex.replace('#', '');
  const colorInt = parseInt(cleanHex, 16) || 0x5865f2;

  const embed: Record<string, any> = {
    color: colorInt,
  };

  if (payload.title) {
    embed.title = payload.title;
  }

  if (payload.description) {
    embed.description = payload.description;
  }

  if (payload.bannerUrl) {
    embed.image = { url: payload.bannerUrl };
  }

  const components: any[] = [];

  // Componentes específicos para botões e interações
  if (payload.type === 'ticket_panel') {
    components.push({
      type: 1, // ActionRow
      components: [
        {
          type: 2, // Button
          style: 1, // Primary
          label: payload.buttonLabel || 'Criar Ticket',
          custom_id: 'ticket:open',
        },
      ],
    });
  } else if (payload.type === 'verification_panel') {
    components.push({
      type: 1, // ActionRow
      components: [
        {
          type: 2, // Button
          style: 3, // Success
          label: payload.buttonLabel || 'Verificar-se',
          custom_id: 'verify:start',
        },
      ],
    });
  }

  return {
    embeds: [embed],
    components: components.length > 0 ? components : undefined,
  };
}
