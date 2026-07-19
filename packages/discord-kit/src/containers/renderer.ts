// packages/discord-kit/src/containers/renderer.ts
import type { ContainerPayload } from './types.js';
import { resolvePlaceholders } from './placeholders.js';
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  FileBuilder,
  ThumbnailBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
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

/** Botão de ação resolvido para um `ContainerPayload.type`, ou `null` se o tipo não tiver botão. */
interface ResolvedActionButton {
  label: string;
  style: number; // ButtonStyle numérico (payload JSON bruto, não instância de discord.js)
  customId: string;
}

/**
 * Resolve o botão de ação (se houver) para o tipo de painel, na forma crua usada
 * pelo payload JSON enviado ao Discord (`type: 2`, `style`, `custom_id`).
 *
 * `custom_id` deve bater exatamente com o namespace/ação registrados em
 * `apps/bot-worker/src/interactions/router.ts` — qualquer divergência quebra o
 * botão silenciosamente em runtime (sem erro de compilação).
 *
 * `welcome`, `rules_panel`, `announcement` e `ranking_panel` não têm botão:
 * o ranking é renderizado ao vivo no corpo do painel (ver container-repost.ts).
 */
function resolveActionButton(payload: ContainerPayload, resolvedButtonLabel: string): ResolvedActionButton | null {
  switch (payload.type) {
    case 'ticket_panel':
      return { label: resolvedButtonLabel || 'Criar Ticket', style: ButtonStyle.Primary, customId: 'ticket:open' };
    case 'verification_panel':
      return { label: resolvedButtonLabel || 'Verificar-se', style: ButtonStyle.Success, customId: 'verify:start' };
    case 'inventory_panel':
      return { label: resolvedButtonLabel || 'Ver Baú', style: ButtonStyle.Secondary, customId: 'inventory:view' };
    case 'illegal_action_panel':
      return { label: resolvedButtonLabel || 'Registrar Ação', style: ButtonStyle.Danger, customId: 'central:register_action' };
    case 'weekly_goal_panel':
      return { label: resolvedButtonLabel || 'Registrar Meta', style: ButtonStyle.Success, customId: 'central:register_goal' };
    case 'registration_panel':
      return { label: resolvedButtonLabel || 'Cadastrar Personagem', style: ButtonStyle.Primary, customId: 'registration:start' };
    default:
      return null;
  }
}

function buildActionRow(button: ResolvedActionButton): Record<string, any> {
  return {
    type: 1, // ActionRow
    components: [
      {
        type: 2, // Button
        style: button.style,
        label: button.label,
        custom_id: button.customId,
      },
    ],
  };
}

/**
 * Converte o ContainerPayload estruturado (da Seção 18 e 20) em um payload JSON compatível
 * com o envio de mensagens do Discord (usado na API de webhooks/reposts).
 *
 * Se context for fornecido, resolve variáveis dinâmicas APENAS no campo de descrição e blocos de texto.
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

    // Se houver blocos estruturados (Seção 20.2), renderiza-os em ordem
    if (payload.blocks && payload.blocks.length > 0) {
      for (const block of payload.blocks) {
        if (block.blockType === 'text') {
          const blockText = context && block.content
            ? resolvePlaceholders(block.content, context)
            : (block.content || '');
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(blockText));
        } else if (block.blockType === 'separator') {
          const separator = new SeparatorBuilder();
          if (block.divider !== undefined) {
            separator.setDivider(block.divider);
          }
          if (block.spacing) {
            // SeparatorSpacingSize.Large = 2, Small = 1
            const spacingVal = block.spacing === 'large' ? 2 : 1;
            separator.setSpacing(spacingVal);
          }
          container.addSeparatorComponents(separator);
        } else if (block.blockType === 'gallery') {
          if (block.items && block.items.length > 0) {
            const gallery = new MediaGalleryBuilder();
            for (const item of block.items) {
              const galleryItem = new MediaGalleryItemBuilder().setURL(item.url);
              if (item.alt) {
                galleryItem.setDescription(item.alt);
              }
              gallery.addItems(galleryItem);
            }
            container.addMediaGalleryComponents(gallery);
          }
        } else if (block.blockType === 'section') {
          const section = new SectionBuilder();
          const sectionText = context && block.text
            ? resolvePlaceholders(block.text, context)
            : (block.text || '');
          section.addTextDisplayComponents(new TextDisplayBuilder().setContent(sectionText));
          if (block.accessory) {
            if (block.accessory.type === 'thumbnail' && block.accessory.url) {
              section.setThumbnailAccessory(new ThumbnailBuilder().setURL(block.accessory.url));
            } else if (block.accessory.type === 'button' && block.accessory.label) {
              section.setButtonAccessory(
                new ButtonBuilder()
                  .setLabel(block.accessory.label)
                  .setCustomId(block.accessory.url || 'section_btn')
                  .setStyle(ButtonStyle.Primary)
              );
            }
          }
          container.addSectionComponents(section);
        } else if (block.blockType === 'file') {
          container.addFileComponents(new FileBuilder().setURL(block.url));
        }
      }
    } else {
      // Fallback para quando não houver blocos (modo legado / markup da Seção 19)
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
    }

    const actionComponents: any[] = [];

    // Componentes específicos para botões e interações
    const actionButton = resolveActionButton(payload, resolvedButtonLabel);
    if (actionButton) {
      actionComponents.push(buildActionRow(actionButton));
    }

    return {
      components: [
        container.toJSON(),
        ...actionComponents,
      ],
      flags: MessageFlags.IsComponentsV2,
    };
  }

  // ---------------------------------------------------------------------------
  // Modo de Renderização 2: Embed Tradicional (Default) - Seção 20.1
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

  // Mapeamento dos campos adicionais do EmbedBuilder (Seção 20.1)
  if (payload.url) {
    embed.url = payload.url;
  }

  if (payload.imageUrl) {
    embed.image = { url: payload.imageUrl };
  } else if (payload.bannerUrl) {
    embed.image = { url: payload.bannerUrl }; // Fallback legado
  }

  if (payload.thumbnailUrl) {
    embed.thumbnail = { url: payload.thumbnailUrl };
  }

  if (payload.authorName) {
    embed.author = {
      name: payload.authorName,
      icon_url: payload.authorIconUrl || undefined,
    };
  }

  if (payload.footerText) {
    embed.footer = {
      text: payload.footerText,
      icon_url: payload.footerIconUrl || undefined,
    };
  }

  if (payload.showTimestamp) {
    embed.timestamp = new Date().toISOString();
  }

  if (payload.fields && payload.fields.length > 0) {
    embed.fields = payload.fields.map(f => ({
      name: f.name,
      value: f.value,
      inline: f.inline || false,
    }));
  }

  const components: any[] = [];

  // Componentes específicos para botões e interações
  const embedActionButton = resolveActionButton(payload, resolvedButtonLabel);
  if (embedActionButton) {
    components.push(buildActionRow(embedActionButton));
  }

  return {
    embeds: [embed],
    components: components.length > 0 ? components : undefined,
  };
}
