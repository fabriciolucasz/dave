// packages/discord-kit/src/browser.ts
//
// Browser-safe subpath export (`@dave/discord-kit/browser`).
//
// The main barrel (`./index.ts` / `@dave/discord-kit`) re-exports builders
// that transitively import `discord.js` and `@dave/database` — fine for
// Node-only consumers (bot-worker, api), but unusable from a Next.js
// client bundle (dashboard forms): webpack has to structurally resolve
// every `export ... from` in a barrel file, which drags in discord.js's
// full dependency tree (including optional native deps like zlib-sync)
// even for exports that are never actually called.
//
// This subpath re-exports only the pure, dependency-free pieces the
// dashboard actually needs client-side: the placeholder registry/resolver,
// the container payload types, and the default payloads. Keep it that way —
// don't re-export anything here that imports discord.js or @dave/database.
export { getAvailablePlaceholders, resolvePlaceholders } from './containers/placeholders.js';
export { DEFAULT_CONTAINER_PAYLOADS } from './containers/defaults.js';
export type {
  ContainerType,
  BaseContainerPayload,
  WelcomeContainerPayload,
  TicketPanelContainerPayload,
  RulesPanelContainerPayload,
  VerificationPanelContainerPayload,
  AnnouncementContainerPayload,
  InventoryPanelPayload,
  IllegalActionPanelPayload,
  RankingPanelPayload,
  WeeklyGoalPanelPayload,
  RegistrationPanelPayload,
  ContainerPayload,
} from './containers/types.js';
export type {
  ContainerBlock,
  ContainerBlockType,
  TextBlock,
  SeparatorBlock,
  GalleryItem,
  GalleryBlock,
  SectionBlock,
  FileBlock,
} from './containers/blocks.js';
