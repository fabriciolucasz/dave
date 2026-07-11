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

export interface ParsedBlock {
  type: 'text' | 'separator' | 'gallery';
  content?: string;
  url?: string;
}

/**
 * Converte a string de descrição em blocos de conteúdo para layout de container.
 * Suporta divisores (---) e galerias ([gallery: http://...]).
 */
export function parseContainerDescription(text: string): ParsedBlock[] {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: ParsedBlock[] = [];
  let currentTextLines: string[] = [];

  const flushText = () => {
    if (currentTextLines.length > 0) {
      blocks.push({
        type: 'text',
        content: currentTextLines.join('\n').trim(),
      });
      currentTextLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '---' || trimmed === '<divider>' || trimmed === '[divider]') {
      flushText();
      blocks.push({ type: 'separator' });
    } else if (trimmed.startsWith('[gallery:') && trimmed.endsWith(']')) {
      flushText();
      const url = trimmed.slice('[gallery:'.length, -1).trim();
      blocks.push({ type: 'gallery', url });
    } else {
      currentTextLines.push(line);
    }
  }
  flushText();
  return blocks;
}

/**
 * Converte o ContainerPayload estruturado (da Seção 18) em um payload JSON compatível
 * com o envio de mensagens do Discord (usado na API de webhooks/reposts).
 * 
 * Se context for fornecido, resolve variáveis dinâmicas APENAS no campo de descrição.
 */
export function buildContainerDiscordPayload(
  payload: ContainerPayload,
  context?: Record<string, string>
): Record<string, any> {
  // As variáveis ${} só podem ser usadas na descrição
  const resolvedTitle = payload.title || '';
  const resolvedDescription = context && payload.description 
    ? resolvePlaceholders(payload.description, context) 
    : (payload.description || '');

  let resolvedButtonLabel = '';
  if ('buttonLabel' in payload && payload.buttonLabel) {
    resolvedButtonLabel = payload.buttonLabel;
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
      const blocks = parseContainerDescription(resolvedDescription);
      for (const block of blocks) {
        if (block.type === 'text' && block.content) {
          container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block.content));
        } else if (block.type === 'separator') {
          container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        } else if (block.type === 'gallery' && block.url) {
          container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
          const gallery = new MediaGalleryBuilder();
          gallery.addItems(new MediaGalleryItemBuilder().setURL(block.url));
          container.addMediaGalleryComponents(gallery);
        }
      }
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
