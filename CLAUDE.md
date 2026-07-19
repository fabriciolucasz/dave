# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Dave** — a multi-tenant Discord bot (discord.js v14) that is becoming a mini-SaaS for GTA RP (roleplay) server managers. One bot instance serves many Discord guilds ("organizations"), each with its own subscription. Bun workspaces monorepo, TypeScript throughout, PostgreSQL (Prisma) + Redis (BullMQ).

The living architecture/design doc is **`PLAN.md`** (Portuguese) — it is the source of truth for *why* things are built the way they are, including decisions still being worked through (monetization, panel types, feature specs). Section 13 lists what's actually implemented vs. proposed. Read the relevant section before making non-trivial architectural changes. `IMPROVE.md` holds a specific, still-in-progress dashboard UI improvement brief (references PLAN.md §16-18).

## Commands

Run from repo root (Bun workspaces, no Turborepo despite what PLAN.md's folder sketch shows):

```bash
bun run dev                    # all apps concurrently (api, bot-worker, gateway, billing-worker, dashboard)
bun run dev:api                # single app, e.g. dev:gateway / dev:bot-worker / dev:billing-worker / dev:dashboard
bun run typecheck              # tsc --noEmit across every workspace (bun run --filter='*' typecheck)

bun run db:generate            # prisma generate
bun run db:migrate:dev         # prisma migrate dev (local)
bun run db:migrate             # prisma migrate deploy (prod)
bun run db:studio              # prisma studio

bun run deploy-commands        # register Discord slash/user commands globally
GUILD_ID=xxx bun run --cwd apps/bot-worker deploy-commands:guild   # register to one guild (fast iteration)
```

Per-package: `bun run --cwd packages/discord-kit test` runs its Bun test suite (currently the only package with a `test` script; no test files exist yet). `bun run --cwd apps/dashboard lint` runs ESLint; `bun run --cwd apps/dashboard build` runs `next build`.

Every app script is launched with `bun --env-file=../../.env`, so **there is one `.env` at repo root** — apps never load their own.

Local infra: `docker compose up` (postgres, redis, plus adminer on :8081 and redis-commander on :8082). Copy `.env.example` → `.env` first.

## Architecture

Event flow (PLAN.md §3): a **Gateway** service holds the only Discord WebSocket connection and contains zero business logic — it just publishes jobs to a Redis/BullMQ queue. **bot-worker** consumes that queue and runs all command/interaction logic, so a slow or crashing command never risks the gateway heartbeat and can be scaled horizontally independent of the socket connection. A separate **api** app (Hono) serves the dashboard over REST. **billing-worker** handles payment webhooks and subscription-expiry cron jobs. All of these share the same Postgres (via `@dave/database`) and Redis (via `@dave/queue`).

```
apps/
  gateway/        discord.js ShardingManager only — publishes jobs, no logic
  bot-worker/     consumes queue, runs commands/interactions via @dave/discord-kit
  api/            Hono REST API consumed by the dashboard
  billing-worker/ Mercado Pago (primary) + Stripe (secondary) webhooks, expiry cron
  dashboard/      Next.js 15 App Router, shadcn/ui, Discord OAuth2 session
packages/
  database/       Prisma schema + client singleton (canonical schema lives here)
  queue/          BullMQ queue defs + Redis client singleton
  config/         zod-validated `env` singleton — every app imports this, never process.env directly
  discord-kit/    all Discord-facing builders/routers/commands — see below
  shared-types/   cross-app TS types
```

**Two `schema.prisma` files exist**: `packages/database/prisma/schema.prisma` is the real one (used by every `db:*` script and `@dave/database`). The root-level `schema.prisma` is a stale earlier draft explicitly marked in its own header as "not yet incorporated" — don't edit it, don't treat it as current; it's kept around from an earlier proposal pass and should generally be ignored or removed if you notice it drifting further from the real schema.

### `@dave/discord-kit` — the mandatory Discord abstraction layer

Handlers in `bot-worker` must never call `discord.js` directly or use `interaction.reply()`; everything goes through `packages/discord-kit`'s barrel export (`src/index.ts`). Core pieces:

- **`embed.builder.ts` / `container.builder.ts`**: fluent wrappers over discord.js `EmbedBuilder` and Components v2 (`ContainerBuilder`, `SectionBuilder`, etc). Container payloads are built from an ordered array of typed blocks (`containers/blocks.ts`), each mapping 1:1 to a real discord.js component — never markdown-like custom syntax.
- **`responder.ts`**: decides `reply`/`update`/`deferReply`/`showModal` based on interaction state; the single place that talks to the Discord API for responses.
- **`router.ts`** (`componentRouter`, class singleton): dispatches component interactions by parsing `customId` as `namespace:action:payload` (e.g. `inventory:adjust:<itemId>:+`). Handlers are registered per namespace in `apps/bot-worker/src/interactions/router.ts`'s `registerInteractionHandlers()`, called once at bootstrap.
- **`commands/` (`defineCommand`, `CommandRegistry`)**: a discriminated union (`type: 'slash' | 'prefix' | 'user'`) so TypeScript enforces which fields each command kind may have (e.g. a `user` command can't have a `description`). `commandRegistry.getRegisterableCommands()` is the sole source of truth for `deploy-commands.ts`.
- **`pagination/`**: stateless-by-default. Page index and a small query travel inside the `customId` itself; Redis sessions (short TTL) are used only when the query is too large to fit there. `Paginator` = button-based paging; `SelectPaginator` = paging inside a `StringSelectMenu` (25-option Discord cap), used when a list needs to be *chosen from*, not just browsed.
- **`logging/log-event.ts`** (`logFeatureEvent(guildId, feature, payload)`): every feature handler calls this at the end of its own execution to post to a per-feature configurable log channel (`FeatureLogConfig`). No-op if unconfigured. Not a separate event listener — keeps "what triggers what" traceable per handler.
- **`containers/placeholders.ts`**: each panel `type` exposes a fixed, closed list of `${variable}` placeholders (never free-text/eval) resolved by simple string replace, shared between real rendering and the dashboard preview endpoint.

### Instantiation pattern (PLAN.md §8)

The rule used throughout: is this a costly/shared resource, a value that's naturally fresh per call, or persistent handler state?

| Kind | Approach | Example |
|---|---|---|
| DB/Redis/queue/Discord clients | singleton exported from a module | `prisma`, `redis` |
| Embed/container content | plain function, new instance every call | `successEmbed()` |
| Handler registries (`componentRouter`, `CommandRegistry`) | class singleton | holds real cross-call state |
| Command/interaction handlers | pure async functions | no own state |

### Subscriptions gate the whole bot

There is no free tier (PLAN.md §17.1 — this was a deliberate reversal from an earlier freemium plan). `checkSubscription` middleware runs before every command except `/setup` and `/assinar`; without an `ACTIVE`/`TRIALING` `Subscription`, the entire bot is blocked for that guild, not just "premium" features. New guilds get an automatic 7-day trial on `guildCreate` with no card required. Result is cached in Redis with a short TTL to avoid a Postgres hit per interaction.

### Panels ("containers") aren't a generic embed builder

A panel (internal name: `container`, table `guild_containers`) is visual identity applied to an *existing* bot function (welcome message, ticket panel, etc.) — never freeform content. `type` selects which function is being styled; `payload` holds only visual config (title, description, color, banner, optional `customWebhook`, `renderMode: 'embed' | 'container'`). Business-plan-gated: `customWebhook` (custom sender name/avatar). Feature panels added later (`inventory_panel`, `illegal_action_panel`, `ranking_panel`, `weekly_goal_panel`, `registration_panel`) follow the same payload principle — see PLAN.md §18–26 for the full spec of each, including the "reconstruct the whole container on every step transition" rule (§26.0) for multi-step flows like Illegal Actions.

### Feature modules (`apps/bot-worker/src/features/`)

- **`inventory/`** ("Baú") — shared per-guild inventory. `adjustItemQuantity()` (in `@dave/discord-kit`'s `features/inventory.ts`) is the *only* function permitted to mutate `InventoryItem.currentQuantity`, using an atomic Prisma `increment`/`decrement` inside a transaction that also writes the `InventoryMovement` audit row — this exists specifically to avoid a read-modify-write race when two members adjust the same item concurrently.
- **`central/`** — logs "illegal action" RP events (city + action type + outcome + amount + participants) and weekly goal submissions; ranking is a derived aggregate query (cached in Redis), not its own table.
- **`registration/`** — character registration; validates submitted name/ID against the member's nickname (pattern `#ID Name`) read from a separate reference guild, producing `VERIFIED`/`MISMATCH`/`PENDING` for staff to reconcile.

### Dashboard (`apps/dashboard`)

Next.js 15 App Router, React 19, shadcn/ui (`components.json` present — use `@/components/ui/*`, don't hand-roll native elements or mix component libs), Tailwind, `lucide-react` for icons (no emoji in UI). Auth is Discord OAuth2 end-to-end (no local passwords). Routes live under `src/app/dashboard/[guildId]/` — `overview`, `settings`, `paineis` (panels), `subscription`, plus newer `bau` (inventory), `central`, `cadastros` (registrations) mirroring the bot-worker feature modules above. The dashboard consumes the same REST API (`apps/api`) and is expected to reuse backend validation/rendering (e.g. panel preview calls the same `container.builder.ts` logic) rather than duplicating it client-side.

## Conventions

- Env vars are validated once via Zod in `packages/config/src/index.ts` (`env` singleton) — add new vars to that schema, never read `process.env` directly in app code.
- `tsconfig.base.json` is strict (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`); per-app `tsconfig.json` just extends it with `rootDir`/`outDir`.
- Workspace packages are referenced as `@dave/<name>` via `workspace:*` and imported through each package's barrel `src/index.ts` — avoid deep-importing another package's internal files.
