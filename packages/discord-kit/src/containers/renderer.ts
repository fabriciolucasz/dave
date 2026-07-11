// packages/discord-kit/src/containers/renderer.ts
import type { ContainerPayload } from './types.js';
import { resolvePlaceholders } from './placeholders.js';
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from 'discord.js';

/**
 * Converte o ContainerPayload estruturado (da Seção 18) em um payload JSON compatível
 * com o envio de mensagens do Discord (usado na API de webhooks/reposts).
 * 
 * Se context for fornecido, resolve variáveis dinâmicas nos campos de texto.
 */
export function buildContainerDiscordPayload(
  payload: ContainerPayload,
  context?: Record<string, string>
): Record<string, any> {
  // Resolve placeholders se houver contexto
  const resolvedTitle = context && payload.title 
    ? resolvePlaceholders(payload.title, context) 
    : (payload.title || '');

  const resolvedDescription = context && payload.description 
    ? resolvePlaceholders(payload.description, context) 
    : (payload.description || '');

  let resolvedButtonLabel = '';
  if ('buttonLabel' in payload && payload.buttonLabel) {
    resolvedButtonLabel = context 
      ? resolvePlaceholders(payload.buttonLabel, context) 
      : payload.buttonLabel;
  }

  // ---------------------------------------------------------------------------
  // Modo de Renderização 1: Layout de Container (Components v2)
  // ---------------------------------------------------------------------------
  if (payload.renderMode === 'container') {
    const container = new ContainerBuilder();

    if (resolvedTitle) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${resolvedTitle}`));
    }

    if (resolvedDescription) {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(resolvedDescription));
    }

    if (payload.bannerUrl) {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
      const gallery = new MediaGalleryBuilder();
      gallery.addItems(new MediaGalleryItemBuilder().setURL(payload.bannerUrl));
      container.addMediaGalleryComponents(gallery);
    }

    const actionComponents: any[] = [];

    // Componentes específicos para botões e interações
    if (payload.type === 'ticket_panel') {
      actionComponents.push({
        type: 1, // ActionRow
        components: [
          {
            type: 2, // Button
            style: 1, // Primary
            label: resolvedButtonLabel || 'Criar Ticket',
            custom_id: 'ticket:open',
          },
        ],
      });
    } else if (payload.type === 'verification_panel') {
      actionComponents.push({
        type: 1, // ActionRow
        components: [
          {
            type: 2, // Button
            style: 3, // Success
            label: resolvedButtonLabel || 'Verificar-se',
            custom_id: 'verify:start',
          },
        ],
      });
    }

    return {
      components: [
        container.toJSON(),
        ...actionComponents,
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Modo de Renderização 2: Embed Tradicional (Default)
  // ---------------------------------------------------------------------------
  const colorHex = payload.accentColor || '#5865f2';
  const cleanHex = colorHex.replace('#', '');
  const colorInt = parseInt(cleanHex, 16) || 0x5865f2;

  const embed: Record<string, any> = {
    color: colorInt,
  };

  if (resolvedTitle) {
    embed.title = resolvedTitle;
  }

  if (resolvedDescription) {
    embed.description = resolvedDescription;
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
          label: resolvedButtonLabel || 'Criar Ticket',
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
          label: resolvedButtonLabel || 'Verificar-se',
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
