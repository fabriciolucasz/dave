// ---------------------------------------------------------------------------
// @dave/discord-kit — barrel export
//
// Tudo que um handler de comando/interação precisa vem daqui.
// Nunca importar de discord.js diretamente nos handlers — sempre via este pacote.
// ---------------------------------------------------------------------------

// Embed builders
export {
  successEmbed,
  errorEmbed,
  warningEmbed,
  infoEmbed,
  loadingEmbed,
  withGuildBranding,
} from './embed.builder.js';
export type { GuildBranding } from './embed.builder.js';

// Container builders (Components v2)
export {
  createContainer,
  createText,
  createSection,
  createSeparator,
  createGallery,
  createSimpleContainer,
  embedToContainer,
  // Re-exports dos builders do discord.js para acesso centralizado
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  FileBuilder,
} from './container.builder.js';

// Responder
export { createResponder } from './responder.js';
export type { ResponderPayload, AnyInteraction } from './responder.js';

// Router de customId
export { componentRouter } from './router.js';
export type { ComponentHandler, ComponentInteraction } from './router.js';

// Pagination
export { Paginator, PaginationSessionExpiredError } from './pagination/index.js';
export type { PagerOptions, PaginationResult } from './pagination/index.js';

// Sistema de comandos (seção 7 do PLAN.md)
export { defineCommand, buildSlashPayload, buildUserCommandPayload, CommandRegistry, commandRegistry } from './commands/index.js';
export type {
  CommandDefinition,
  CommandModule,
  SlashCommandDefinition,
  UserCommandDefinition,
  PrefixCommandDefinition,
  SlashCommandBuilderResult,
  CommandCommon,
} from './commands/index.js';
