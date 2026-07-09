// ---------------------------------------------------------------------------
// container.builder.ts — seção 6.2 do PLAN.md
//
// Camada de abstração sobre o sistema de Components v2 do Discord.
// O objetivo NÃO é reescrever os builders do discord.js, mas encapsulá-los
// em factories nomeadas que:
//   1. Deixam o código dos handlers legível (intenção clara vs. construtores brutos).
//   2. Centralizam os imports de Components v2 — se a API mudar, atualiza aqui.
//   3. Aplicam convenções do projeto (separadores, espaçamentos padrão).
//
// PADRÃO (seção 7.3): funções puras, instância nova a cada chamada.
//
// Nota: Components v2 (ContainerBuilder, SectionBuilder, etc.) estão disponíveis
// no discord.js v14.16+ com a flag IS_COMPONENTS_V2 no send options.
// Documentação: https://discord.com/developers/docs/components/reference
// ---------------------------------------------------------------------------

import {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  FileBuilder,
  type EmbedBuilder,
} from 'discord.js';

// ---------------------------------------------------------------------------
// Re-exports dos builders do discord.js — consumidores importam daqui.
// ---------------------------------------------------------------------------
export {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  FileBuilder,
};

// ---------------------------------------------------------------------------
// Factories de conveniência
// ---------------------------------------------------------------------------

/**
 * Cria um ContainerBuilder vazio, pronto para receber componentes via `.addXxxComponents()`.
 *
 * @example
 * const container = createContainer()
 *   .addTextDisplayComponents(createText('Olá, mundo!'))
 *   .addSeparatorComponents(createSeparator());
 */
export function createContainer(): ContainerBuilder {
  return new ContainerBuilder();
}

/**
 * Cria um TextDisplayBuilder com o conteúdo fornecido.
 * Suporta markdown do Discord (bold, italic, mentions, etc).
 *
 * @example
 * const text = createText(`**Usuário:** ${user.tag}`);
 */
export function createText(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

/**
 * Cria um SectionBuilder.
 * Sections agrupam um TextDisplay (conteúdo principal) com um accessory opcional
 * (thumbnail, botão, etc.) à direita.
 *
 * @example
 * const section = createSection()
 *   .addTextDisplayComponents(createText('Detalhes do usuário'))
 *   .setThumbnailAccessory({ media: { url: user.avatarURL() ?? '' } });
 */
export function createSection(): SectionBuilder {
  return new SectionBuilder();
}

/**
 * Cria um separador horizontal.
 *
 * @param spacing - 'small' ou 'large'. Padrão: 'small'.
 * @param withDivider - Se true, renderiza uma linha divisória visual. Padrão: true.
 */
export function createSeparator(
  spacing: 'small' | 'large' = 'small',
  withDivider = true,
): SeparatorBuilder {
  return new SeparatorBuilder()
    .setSpacing(
      spacing === 'large' ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small,
    )
    .setDivider(withDivider);
}

/**
 * Cria uma MediaGallery para exibir uma ou mais imagens em grade.
 *
 * @example
 * const gallery = createGallery([
 *   { url: 'https://example.com/image1.png', description: 'Imagem 1' },
 * ]);
 */
export function createGallery(
  items: Array<{ url: string; description?: string; spoiler?: boolean }>,
): MediaGalleryBuilder {
  const gallery = new MediaGalleryBuilder();

  for (const item of items) {
    const galleryItem = new MediaGalleryItemBuilder().setURL(item.url);
    if (item.description) galleryItem.setDescription(item.description);
    if (item.spoiler) galleryItem.setSpoiler(item.spoiler);
    gallery.addItems(galleryItem);
  }

  return gallery;
}

/**
 * Atalho para criar um Container com título e descrição em texto,
 * com separador entre eles. Padrão de uso mais comum.
 *
 * @example
 * const container = createSimpleContainer('Título', 'Descrição aqui');
 */
export function createSimpleContainer(title: string, description?: string): ContainerBuilder {
  const container = createContainer();
  container.addTextDisplayComponents(createText(`## ${title}`));

  if (description) {
    container.addSeparatorComponents(createSeparator());
    container.addTextDisplayComponents(createText(description));
  }

  return container;
}

/**
 * Converte um EmbedBuilder em um Container equivalente (migração incremental).
 * Útil quando um comando já usa embeds e quer migrar gradualmente para Components v2.
 *
 * Campos suportados: title, description, fields.
 * Campos NÃO suportados nesta versão: image, thumbnail, author, footer com ícone.
 */
export function embedToContainer(embed: EmbedBuilder): ContainerBuilder {
  const data = embed.toJSON();
  const container = createContainer();

  if (data.title) {
    container.addTextDisplayComponents(createText(`## ${data.title}`));
  }

  if (data.description) {
    container.addSeparatorComponents(createSeparator());
    container.addTextDisplayComponents(createText(data.description));
  }

  if (data.fields && data.fields.length > 0) {
    container.addSeparatorComponents(createSeparator('large'));
    for (const field of data.fields) {
      container.addTextDisplayComponents(
        createText(`**${field.name}**\n${field.value}`),
      );
    }
  }

  return container;
}
