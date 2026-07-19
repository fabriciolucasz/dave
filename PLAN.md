# PLAN.md — Dave (bot de Discord multi-tenant / mini SaaS para gestores de GTA RP)

Este documento descreve a arquitetura do projeto. Itens marcados como concluídos na seção 13 refletem trabalho já implementado; o restante do documento descreve tanto decisões já tomadas quanto propostas de design. Serve como referência viva — atualize conforme o código evoluir.

## 1. Contexto e objetivo

- Bot de Discord (discord.js v14+) escrito em TypeScript, rodando em **Bun**.
- Vai atender **muitos servidores com uma única aplicação** (multi-tenant), não uma instância isolada por cliente.
- Objetivo final: um mini SaaS para gestores de servidores de GTA RP, com:
  - Bot funcional com sistema robusto de comandos e interações.
  - API REST que futuramente conversa com um frontend (dashboard de gestão).
  - Gestão de assinaturas (subscriptions), com bloqueio de acesso quando o plano não é renovado.
- Base parcial do bot em desenvolvimento. Foco inicial:
  - Sistema de criação de Embeds (antigo) / Containers (Components v2).
  - Sistema de Responders (resposta padronizada para botão, modal, select menu, etc, de acordo com o tipo de interação).
  - Sistema de criação de comandos (slash, prefix, user application command).

## 2. Decisões já tomadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Runtime | **Bun** | TS nativo, startup rápido, test runner embutido |
| Modelo de deployment | **Multi-tenant** (1 bot, N servidores) | Menor custo operacional, escala melhor com muitos clientes pequenos |
| Banco de dados principal | **PostgreSQL** | Relacional, maduro, ótimo suporte a transações (importante para billing) |
| Filas / mensageria | **Redis + BullMQ** | Equipe já tem experiência; desacopla recepção de eventos do processamento |
| Linguagem | TypeScript | Requisito do projeto |
| Biblioteca do Discord | discord.js v14+ | Requisito do projeto |

## 3. Visão geral da arquitetura

Princípio central: **separar a recepção de eventos do Discord do processamento de comandos/interações**. Isso garante que:

- Um comando pesado ou com bug não trava a conexão com o Discord (heartbeat do gateway continua vivo).
- É possível escalar horizontalmente só a camada que processa comandos, sem duplicar conexões WebSocket.
- Falhas são isoladas por serviço — API, billing e bot não derrubam uns aos outros.

```
Discord
  │  (eventos via WebSocket, sharded)
  ▼
Gateway service  ──────────────► Fila (Redis + BullMQ)
(sem lógica de negócio)                 │
                          ┌──────────────┴───────────────┐
                          ▼                               ▼
                  Command worker                 Interaction worker
              (slash commands, jobs)      (botões, modais, containers)
                          │                               │
                          └───────────────┬───────────────┘
                                          ▼
                      Camada de dados compartilhada
                    (PostgreSQL via Prisma/Drizzle + Redis cache)
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                                ▼
                     REST API                       Billing worker
              (consumida pelo frontend)     (assinaturas, webhooks Stripe)
                          │                                │
                          ▼                                ▼
                 Dashboard (futuro)              Stripe / Mercado Pago
```

### 3.1 Gateway service

- Único responsável por manter a conexão com o Discord.
- Usa `ShardingManager` do discord.js (ou `discord-hybrid-sharding` se precisar de sharding entre múltiplas máquinas no futuro).
- Não executa lógica de negócio: ao receber um evento relevante (comando, interação, mensagem), apenas serializa e publica um job na fila.

### 3.2 Fila (Redis + BullMQ)

- Desacopla o gateway dos workers.
- Permite retry automático de jobs que falharem, prioridade de filas (ex: comandos de billing têm prioridade sobre comandos comuns) e observabilidade (dashboard do BullMQ).

### 3.3 Workers (Command worker / Interaction worker)

- Consomem jobs da fila e executam a lógica real.
- Podem ser escalados horizontalmente (múltiplas réplicas) conforme o volume de servidores crescer.
- Usam o `packages/discord-kit` (builders de embed/container/responder) para toda comunicação com o Discord — nunca chamam a API do discord.js diretamente nos handlers de comando.

### 3.4 REST API

- Serviço HTTP separado (Hono ou Fastify), consumido pelo futuro dashboard/frontend.
- Responsável por: autenticação de gestores, CRUD de configurações do servidor, consulta de status de assinatura, etc.
- Compartilha a mesma camada de dados (Postgres/Redis) dos workers, mas roda como processo independente — pode ser escalado e deployado separadamente.

### 3.5 Billing worker

- Processa webhooks do provedor de pagamento (Mercado Pago primário, Stripe secundário).
- Roda jobs agendados (cron via BullMQ *repeatable jobs*) para verificar assinaturas vencidas e aplicar bloqueio/downgrade automaticamente.

## 4. Stack sugerida

- **Runtime**: Bun
- **Bot**: discord.js v14+, sharding nativo ou `discord-hybrid-sharding`
- **API HTTP**: Hono (leve, roda bem em Bun) ou Fastify
- **ORM**: Prisma (melhor DX de migrations) ou Drizzle (mais performático em Bun, SQL mais explícito) — escolher por preferência da equipe
- **Filas**: BullMQ sobre Redis
- **Validação**: Zod (comandos, DTOs da API, variáveis de ambiente)
- **Pagamentos**: Mercado Pago (primário) e Stripe (secundário)
- **Logs**: Pino (logs estruturados)
- **Monitoramento de erros**: Sentry

## 5. Estrutura de pastas (monorepo)

```
dave/
├── apps/
│   ├── gateway/              # processo que conecta ao Discord (sharded)
│   │   └── src/
│   │       ├── index.ts
│   │       └── shard-manager.ts
│   ├── bot-worker/           # consome fila, executa comandos e interações
│   │   └── src/
│   │       ├── commands/
│   │       │   ├── moderation/
│   │       │   ├── economy/
│   │       │   └── index.ts        # auto-loader de comandos
│   │       ├── interactions/
│   │       │   ├── buttons/
│   │       │   ├── modals/
│   │       │   ├── select-menus/
│   │       │   └── router.ts       # despacha customId -> handler
│   │       ├── builders/
│   │       │   ├── embed.builder.ts
│   │       │   ├── container.builder.ts   # novo Components v2
│   │       │   └── responder.builder.ts   # abstrai reply/update/modal
│   │       └── events/
│   ├── api/                  # REST API para frontend + billing
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── guilds/
│   │       │   ├── subscriptions/
│   │       │   └── auth/
│   │       ├── middlewares/
│   │       └── index.ts
│   ├── billing-worker/       # webhooks Mercado Pago/Stripe, cron de expiração
│   │   └── src/
│   └── dashboard/            # frontend Next.js — ver seção 16
│       └── src/
├── packages/
│   ├── database/             # schema Prisma/Drizzle + client compartilhado
│   │   └── src/schema/
│   ├── queue/                # definições de filas/jobs compartilhadas (BullMQ)
│   ├── config/                # env vars validadas com Zod, compartilhado
│   ├── discord-kit/           # builders reutilizáveis de embed/container/responder/comandos
│   └── shared-types/          # tipos TS compartilhados entre apps
├── docker-compose.yml
├── turbo.json                 # ou apenas workspaces do bun
└── package.json
```

Cada `app` roda como processo/container independente, permitindo escalar (ex: `bot-worker`) sem afetar os demais.

## 6. Sistema de Embeds / Containers / Responders

Proposta de design em `packages/discord-kit`:

### 6.1 `embed.builder.ts`
Wrapper fluente sobre o `EmbedBuilder` do discord.js:
- Métodos de conveniência: `.success()`, `.error()`, `.warning()`.
- `.withFooter(guildConfig)` para aplicar branding/identidade visual configurada por servidor.

### 6.2 `container.builder.ts`
Camada sobre o novo sistema de Components v2 do Discord (`ContainerBuilder`, `SectionBuilder`, etc):
- Trata como camada de abstração, não reescrita — se a API do Discord mudar, atualiza em um único lugar.

### 6.3 `responder.builder.ts`
Peça mais importante para escalar o projeto: abstrai **como responder a uma interação**, independente do tipo (`ChatInputCommandInteraction`, `ButtonInteraction`, `ModalSubmitInteraction`).
- Decide internamente entre `reply`, `update`, `deferReply`, `showModal` com base no estado da interação.
- Sempre usa os builders de embed/container por baixo.
- Handlers de comando nunca chamam `interaction.reply()` diretamente — sempre passam pelo responder.

### 6.4 Router de `customId`
Para suportar centenas de botões/modais diferentes em um bot multi-tenant:
- Codificar `customId` como `namespace:action:payload` (ex: `ticket:close:123`).
- Um router central despacha para o handler correto com base no `namespace:action`.
- Evita `if/else` gigante e permite registrar handlers por módulo/plugin.

## 7. Sistema de criação de comandos (discord-kit)

Função única `defineCommand()` para criar qualquer um dos três tipos de comando suportados pelo Discord/pelo bot, com o TypeScript inferindo os campos certos a partir do discriminador `type`. Arquivos em `packages/discord-kit/src/commands/`: `types.ts`, `define-command.ts`, e um exemplo de uso.

### 7.1 Tipos suportados

| `type` | O que é | Registrado onde | Campos próprios |
|---|---|---|---|
| `"slash"` | Slash Command (`/comando`) | API do Discord (`PUT /applications/{id}/commands`) | `description`, `build` (opções via `SlashCommandBuilder`) |
| `"prefix"` | Comando por texto (ex: `!ping`) | Não registrado no Discord — interpretado do conteúdo da mensagem por um `CommandRegistry` interno | `aliases` |
| `"user"` | User Application Command (menu de contexto ao clicar com botão direito num usuário) | API do Discord, com `ApplicationCommandType.User` | sem `description`/opções — Discord não permite |

### 7.2 `defineCommand()`

- Recebe um objeto com `type: 'slash' | 'prefix' | 'user'` e retorna um `CommandModule` normalizado, independente do tipo original.
- Campos comuns a todos os tipos (`name`, `isPremium`, `requiredPermissions`, `cooldownSeconds`) ficam fora do discriminador — evita repetir a mesma lógica de checagem de assinatura/permissão/cooldown em três lugares diferentes.
- A união discriminada (`SlashCommandDefinition | PrefixCommandDefinition | UserCommandDefinition`) garante em tempo de compilação que, por exemplo, um comando `type: 'user'` não aceite `description` (Discord não permite description em User Command) e que um `type: 'prefix'` não seja acidentalmente registrado na API do Discord.

### 7.3 `CommandRegistry`

- Separa o armazenamento por destino: `slashAndUserCommands` (vai para a API do Discord no boot) e `prefixCommands` (Map interno, incluindo aliases como chaves adicionais).
- Exposto como singleton via módulo — segue o critério da seção 8: guarda estado real (comandos registrados) que precisa persistir entre chamadas, então é uma classe singleton, não uma função pura.
- `getRegisterableCommands()` filtra só os comandos que precisam ser enviados à API do Discord — comandos `prefix` nunca passam por ali. `deploy-commands.ts` usa esse método como source of truth único.

## 8. Padrão de instanciação: quando usar classe/singleton vs função pura

Critério adotado no projeto: não é "usar classe ou não", é **"esse objeto representa um recurso caro/compartilhado, ou um valor que naturalmente muda a cada chamada?"**.

| Tipo de coisa | Abordagem | Motivo |
|---|---|---|
| Client de banco (Prisma/Drizzle), Redis, BullMQ, `Client` do discord.js | **Singleton via módulo** | Recurso caro e único por processo — conexões não devem ser recriadas |
| Embed/Container builders | Função que retorna instância nova a cada chamada | Conteúdo muda por interação; instância é barata e esperada |
| Router de `customId` / `CommandRegistry` | Classe singleton | Guarda estado real (mapa de handlers/comandos) que precisa persistir entre chamadas |
| Handlers de comando | Funções puras (`async function execute(interaction) {}`) | Sem estado próprio, mais fácil de testar |

### 8.1 Singleton via módulo (operações vitais/essenciais)

```typescript
// packages/database/src/client.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

```typescript
// packages/queue/src/redis.ts
import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL!);
```

### 8.2 Classe singleton (estado de configuração persistente)

```typescript
// packages/discord-kit/src/router.ts
class ComponentRouter {
  private handlers = new Map<string, ComponentHandler>();

  register(namespace: string, handler: ComponentHandler) {
    this.handlers.set(namespace, handler);
  }

  async dispatch(interaction: ButtonInteraction | ModalSubmitInteraction) {
    const [namespace, action, ...payload] = interaction.customId.split(':');
    const handler = this.handlers.get(namespace);
    if (!handler) return;
    await handler[action]?.(interaction, payload);
  }
}

export const componentRouter = new ComponentRouter();
```

### 8.3 Instância nova por chamada (builders e handlers)

```typescript
export function successEmbed(title: string, description?: string) {
  return new EmbedBuilder().setColor(Colors.Green).setTitle(title).setDescription(description ?? null);
}
```

## 9. Sistema de paginação (discord-kit)

Design para paginação eficiente de listagens (membros, logs de auditoria, etc.) usadas em embeds/containers.

### 9.1 Onde mora o estado da paginação

Decisão: **stateless por padrão**, com sessão no Redis apenas quando necessário.

- **Nunca guardar a lista inteira em memória** indexada por `messageId`.
- **Página atual + query pequena viajam dentro do próprio `customId`** do botão (ex: `page:member-list:2:guild_123`).
- **Sessão no Redis só quando a query é grande demais** (múltiplos filtros), com id curto de sessão e TTL curto (ex: 15 min).

### 9.2 Busca de dados

- `fetchPage(query, pageIndex, pageSize)` busca só a página necessária, nunca a lista inteira.
- `render(items, pageIndex, totalPages)` é agnóstico ao sistema visual (Embed ou Container).

### 9.3 Interação com os botões

- Botões padrão: primeira/anterior/próxima/última página, desabilitados nos limites.
- `interaction.update()` edita a mensagem existente.
- Clamp defensivo do `pageIndex`.
- `PAGINATION_SESSION_EXPIRED` quando a sessão no Redis expira.

### 9.4 Paginação em select menu (`SelectPaginator`)

Variante complementar ao `Paginator` (9.1–9.3), para o caso em que a lista precisa ser escolhida via `StringSelectMenuBuilder` em vez de navegada como conteúdo de texto — usada, por exemplo, na seleção de cidade/tipo de ação/participantes das Ações Ilegais (seção 26.2) e no resumo global do Baú (seção 26.1).

Regras:

- Limite físico do Discord: **25 opções por select menu**. Se a lista cabe em 25 itens, o select é renderizado direto, **sem botões de navegação** — não adicionar complexidade de paginação quando ela não é necessária.
- Se ultrapassar 25, o componente recorta a página atual (mesmo princípio de `fetchPage` da seção 9.2 — nunca carrega a lista inteira de uma vvez em memória) e adiciona uma linha de botões de navegação abaixo do select: primeira / anterior / info (mostra "página X de Y", sem ação) / próxima / última.
- `max_values` do select é recalculado a cada página, para nunca exceder a quantidade de opções realmente presentes naquela página (evita erro da API do Discord se a última página tiver menos de 25 itens e `max_values` ainda apontar para o tamanho da página cheia).
- Mesmo esquema stateless de `customId` da seção 9.1: `select-page:<namespace>:<pageIndex>:<query>` para os botões de navegação, e o próprio select carrega os valores da página atual — nenhum estado de sessão em memória do processo.
- Ao trocar de página, **o container inteiro é reconstruído** (não só o select) — ver princípio geral na seção 26.6. Isso é diferente do `Paginator` por botões, onde o conteúdo entre páginas normalmente já era "conteúdo paginado" por definição; aqui, o texto ao redor do select (contagem, instruções) também pode depender da página e precisa ser recalculado junto.

Proposta de arquivo: `packages/discord-kit/src/pagination/select-paginator.ts`, com assinatura equivalente a `createPaginator()` (seção 9.1) mas retornando `{ select: StringSelectMenuBuilder, navigationRow?: ActionRowBuilder }` em vez de um embed/container completo — o container ao redor é responsabilidade de quem chama, seguindo o mesmo princípio de composição da seção 6.2.

## 10. Controle de acesso e modelo de dados

### 10.1 Quem pode configurar e assinar o bot

Decisão: **qualquer membro com permissão `ADMINISTRATOR` (ou `MANAGE_GUILD`) no servidor pode adicionar, configurar e assinar o bot** — não travado só no dono do servidor.

Motivos:
- Delegação de gestão para staff é comum em servidores de RP.
- O Discord já resolve a autorização via `GET /users/@me/guilds` (campo `permissions`).
- O que importa rastrear não é "quem pode configurar", mas "quem é responsável pela cobrança" — por isso `Subscription.createdByUserId` e `AuditLog`.

Implementado: `POST /subscriptions/:guildId/cancel` só permite o criador da assinatura ou o dono do servidor; outros admins recebem `403`.

### 10.1.1 Confirmado: Guild = Organização (Discords separados por facção)

Ponto esclarecido na conversa sobre precificação: no nicho de GTA RP, **cada organização/facção já roda seu próprio Discord, separado do Discord principal do servidor** — não é um único Discord compartilhado por várias organizações. Isso significa que `Guild` (o servidor onde o bot está instalado) já corresponde 1:1 a uma organização na prática. O modelo de dados atual (`Subscription` vinculada à `Guild`, seção 10.3) está correto e **não precisa** de uma entidade `Organization` separada nem de migration adicional — cada organização assina de forma independente simplesmente porque cada uma tem seu próprio Discord/Guild.

Isso também simplifica a seção 17.2.1: não há necessidade de recalibrar preço por causa de "múltiplas orgs dividindo uma assinatura", porque essa situação não existe no modelo real do produto.

### 10.2 Autenticação do frontend

- Autenticação via **Discord OAuth2** — sem senha própria.
- Fluxo: usuário autoriza no Discord → `access_token`/`refresh_token` → `GET /users/@me` + `GET /users/@me/guilds` para montar a sessão.
- `User.accessToken`/`refreshToken` salvos para re-sincronizar sem forçar novo login.

### 10.3 Modelo de dados (`schema.prisma`)

- **`User`** — identidade do OAuth2 (`discordId`, `username`, `globalName`, `avatarHash`, `email` opcional, tokens).
- **`Guild`** — servidor com o bot. Guarda `ownerDiscordId` sempre, e `ownerUserId` quando disponível.
- **`GuildMember`** — cache de permissões por usuário/guild, com `isAdmin` calculado. Sincronizado no login e via cron semanal.
- **`GuildSettings`** — locale, cor de embed, canal de logs, `data` em JSON livre para configs por módulo.
- **`Plan`** — catálogo de planos.
- **`Subscription`** — vinculada à `Guild` (que já corresponde 1:1 a uma organização — ver seção 10.1.1), registra `createdByUserId`, status, período, `PaymentProvider`.
- **`AuditLog`** — `action` + `metadata` em JSON, quem fez o quê em cada guild.

## 11. Fluxo operacional de billing

- `billing-worker` escuta webhooks do Mercado Pago (primário) e Stripe (secundário) e atualiza `subscriptions`.
- `checkSubscription` verifica se há assinatura `ACTIVE`/`TRIALING` antes de **qualquer comando**, exceto `/setup` e `/assinar` (sempre liberados, para permitir configuração inicial e reativação) — não existe mais o conceito de "comando premium" isolado desde a remoção do plano Free (seção 17.1); sem assinatura válida, o bot inteiro fica bloqueado. Resultado do check cacheado no Redis com TTL curto, para não bater no Postgres a cada interação.
- Cron diário (BullMQ *repeatable job*) varre assinaturas vencidas, aplica `status: EXPIRED` e o bloqueio correspondente — sem downgrade para um nível gratuito, já que ele não existe mais.
- Cron semanal sincroniza `GuildMember` via tipo de job `guild_sync` no `BillingJobData`.

## 12. Infraestrutura local (Docker Compose)

- **postgres** (16-alpine), healthcheck, volume persistente.
- **redis** (7-alpine, append-only), healthcheck, volume persistente.
- **adminer** (porta 8081) e **redis-commander** (porta 8082).
- Serviços da aplicação (`gateway`, `bot-worker`, `api`, `billing-worker`) com Dockerfiles criados.

Copie `.env.example` para `.env` e preencha as variáveis antes de rodar `docker compose up`.

## 13. Concluído

- [x] Schema do banco (Prisma) para `users`, `guilds`, `guild_members`, `guild_settings`, `plans`, `subscriptions`, `audit_logs`.
- [x] Fluxo de login via Discord OAuth2 (troca de code por token, criação/atualização de `User`, sync inicial de `GuildMember`).
- [x] Job de sincronização periódica de `GuildMember` — cron semanal no `billing-worker` + tipo `guild_sync` no `BillingJobData`.
- [x] `packages/discord-kit` (embed/container/responder builders).
- [x] Router de `customId` para interações.
- [x] Dockerfiles de cada app (`gateway`, `bot-worker`, `api`, `billing-worker`).
- [x] Provedor de pagamento — **Mercado Pago** primário, Stripe secundário. Ambos implementados no `billing-worker`.
- [x] Middleware de verificação de assinatura nos comandos premium — campo `isPremium` no `CommandModule` + `checkSubscription`.
- [x] Contratos da REST API — documentação completa em `api-contracts.md`.
- [x] Trava de cancelamento — `POST /subscriptions/:guildId/cancel` só permite criador da assinatura ou dono do servidor; outros admins recebem `403`.
- [x] Sistema de paginação (`packages/discord-kit/src/pagination`) — `Paginator`, `PaginationSessionExpiredError`, `PagerOptions`, `PaginationResult`.
- [x] Sistema de criação de comandos (`packages/discord-kit/src/commands`) — `defineCommand()`, `CommandRegistry` (singleton), `commandRegistry`. Suporte a slash, user e prefix commands. `deploy-commands.ts` usa `commandRegistry.getRegisterableCommands()` como source of truth único.
- [x] REST API — endpoints principais (`/guilds/:guildId`, `/guilds/:guildId/setup`, `/subscriptions/:guildId`, `/subscriptions/:guildId/checkout`, `/subscriptions/:guildId/cancel`, `/users/me`), middleware JWT e `checkSubscription`.
- [x] Containers persistentes ("sticky messages") — schema `guild_containers`, comandos `/container create`/`disable`, listener `messageDelete`, job BullMQ de repost com delay configurável.
- [x] Fluxo de ativação híbrido (`guildCreate`, `/setup`, `/assinar`) — ver seção 15.

## 14. Próximos passos

### 14.1 Dashboard Frontend
- [x] Setup do app `dashboard` no Turborepo (Next.js)
- [x] Login via Discord OAuth2
- [x] Guild switcher + tela `/dashboard` (grade de servidores / redirect direto / tela de convite) — ver seção 16.2
- [x] Tela `/dashboard/[guildId]/overview` — ver seção 16.2
- [x] Tela `/dashboard/[guildId]/settings` (espelha o `/setup` do Discord) — ver seção 16.2
- [x] Tela `/dashboard/[guildId]/paineis` (visualização, criação, edição e exclusão de painéis com split layout e preview real-time no Discord) — ver seção 16.2 e IMPROVE.md
- [x] Tela `/dashboard/[guildId]/subscription` (checkout, status, cancelamento com trava de permissão e listagem dinâmica com features formatadas) — ver seção 16.2
- [x] Tela `/account`
- [x] Estados de loading/vazio/erro de permissão/assinatura vencida em todas as telas — ver seção 16.3
- [ ] Após dashboard pronto: adicionar link na DM de boas-vindas do `guildCreate`
- [ ] Escolha de renderização (Embed vs Container) por painel — ver seção 19
- [ ] Sistema de variáveis dinâmicas nos campos de texto dos painéis — ver seção 19

### 14.2 Pagamentos ao vivo
- [ ] Configurar webhooks Mercado Pago em produção
- [x] Testar fluxo completo: checkout → pagamento → atualização de `Subscription`
- [ ] Configurar webhooks Stripe (secundário)
- [x] Job de expiração automática de assinatura no `billing-worker`

## 15. Fluxo de Ativação do Bot (Opção C — Híbrida)

### Visão Geral

Quando o bot entra em um servidor, ele inicia o onboarding via DM para o dono. O caminho principal é o Dashboard; o `/setup` no Discord é o fallback para quem prefere não sair do servidor. O acesso a funcionalidades premium é bloqueado pelo middleware `checkSubscription` enquanto não houver assinatura ativa.

### 15.1 Evento `guildCreate`

1. Bot entra no servidor.
2. Registra a guild no banco (`Guild` + `GuildSettings` com defaults).
3. Tenta enviar DM ao dono com embed de boas-vindas.
4. Se DM falhar: envia mensagem no primeiro canal de texto disponível com permissão.

### 15.2 Comando `/setup` (wizard no Discord)

- **Etapa 1 — Canal**: select menu com canais de texto, salva `GuildSettings.defaultChannelId`.
- **Etapa 2 — Roles de acesso**: select menu multi-select, salva `GuildSettings.allowedRoleIds`.
- **Etapa 3 — Confirmação**: embed resumindo, botões "Confirmar"/"Refazer".

### 15.3 Middleware de Assinatura

- Todos os comandos passam pelo `checkSubscription`, exceto `/setup` e `/assinar` — sem plano Free (seção 17.1), não existe mais uma categoria de comando "básico" liberado por padrão.
- Sem `Subscription` `ACTIVE`/`TRIALING`, o bot responde qualquer outro comando com um embed direcionando para `/assinar`, em vez de executar a ação.

### 15.4 Comando `/assinar`

- Exibe planos disponíveis (embed com botões).
- Gera link de checkout no `billing-worker` (Mercado Pago primário).
- Webhook confirma pagamento → `Subscription` atualizada, acesso liberado.

### 15.5 Re-setup

- `/setup` pode ser rodado novamente a qualquer momento, requer permissão de administrador.

## 16. Dashboard Frontend — Especificação de telas e UI

A seção 14.1 lista o que falta implementar; esta seção detalha o **comportamento**, não só a existência de cada tela. Stack: Next.js (App Router), autenticado via Discord OAuth2 (seção 10.2), consumindo a REST API já implementada (seção 13).

### 16.1 Modelo de navegação

Um gestor pode ter acesso a múltiplos servidores — a navegação precisa refletir isso:

- **Guild switcher** fixo no topo (dropdown com ícone + nome do servidor). Trocar o servidor selecionado muda o contexto de toda a navegação abaixo sem recarregar a página (client-side, mantendo a sessão).
- **Sidebar lateral** com as seções por servidor: Visão geral, Configurações, Painéis, Assinatura.
- Se o usuário não tem acesso a nenhum servidor com o bot instalado, a sidebar não aparece — vai direto para a tela de "adicionar o bot".

### 16.2 Telas

| Rota | Propósito | Comportamento específico |
|---|---|---|
| `/login` | Autenticação | Só o botão "Continuar com Discord". Sem alternativa de senha/formulário. |
| `/dashboard` | Roteamento pós-login | 1 servidor → redireciona direto para `overview`. Múltiplos → grade de cards (ícone, nome, badge de status: ativo / assinatura vencida / não configurado). Zero → tela de convite do bot (botão de link OAuth2 de instalação). |
| `/dashboard/[guildId]/overview` | Home do servidor | Status da assinatura (badge), canal/roles configurados, contagem de painéis ativos, atalhos para as outras telas. |
| `/dashboard/[guildId]/settings` | Configuração | Espelha o wizard `/setup` do Discord como formulário: select de canal padrão, multi-select de roles permitidas. Salva via `POST /guilds/:guildId/setup` — mesmo endpoint usado pelo comando, então mudança aqui reflete no bot imediatamente. |
| `/dashboard/[guildId]/paineis` | Painéis (identidade visual de funções existentes) | Visualização, criação, edição e exclusão, com split layout e preview em tempo real do que vai aparecer no Discord. Ver seção 18 e 19. |
| `/dashboard/[guildId]/subscription` | Assinatura | Status do plano, data de renovação, botões Assinar/Trocar de plano/Cancelar, listagem dinâmica de planos com features formatadas. Botão de cancelar só fica habilitado se o usuário logado for o `createdByUserId` ou o dono do servidor (mesma regra do endpoint, seção 10.1) — outros admins veem o botão desabilitado com tooltip explicando o motivo. |
| `/account` | Perfil | Dados vindos do Discord (avatar, username), sem campos editáveis — a fonte da verdade é o Discord. |

### 16.3 Estados obrigatórios em toda tela

- **Loading**: skeleton com o formato do conteúdo real da tela, não um spinner genérico.
- **Vazio**: ex. zero painéis configurados → texto explicando como criar um pelo dashboard/Discord, sem tratar como erro.
- **Erro de permissão**: se a permissão do usuário mudou no Discord entre a sincronização e a ação, a API retorna `403` e a UI mostra "Sua permissão pode ter mudado, atualize a página" em vez de travar silenciosamente.
- **Assinatura vencida**: banner persistente no topo do dashboard daquele servidor (não modal bloqueante), com CTA para renovar — espelha o princípio do `checkSubscription` do bot (seção 11), mas no dashboard bloqueia a ação equivalente com o banner em vez de recusar o comando.

## 17. Estratégia de monetização e planos

### 17.1 Modelo: sem plano gratuito, trial obrigatório converte em pago

Decisão revisada: **não haverá plano Free permanente**. Apenas trial de 7 dias (seção 17.3) seguido de assinatura paga — sem camada gratuita por baixo.

Motivos para essa mudança de rumo em relação à decisão anterior (freemium):
- **O nicho de GTA RP já tem cultura de gasto alto e recorrente** — o padrão de referência não é mais "cosmético avulso" (ex: carro por R$300), e sim o **ciclo de wipe do servidor**: itens desse tipo costumam ser vendidos por ciclo/mês, ou seja, o público já está habituado a um gasto **recorrente mensal**, não só pontual. Isso é uma âncora de preço mais sólida do que uma compra única, porque o hábito de "pagar de novo todo mês/ciclo" já existe no nicho.
- O comparativo relevante não é "bot grátis de moderação genérica" (MEE6, Dyno) — é "vale o investimento pra rodar minha operação dentro do servidor" (seja ela o servidor inteiro ou uma organização/facção específica — ver seção 10.1.1).
- **Freemium tem custo de manutenção que não se paga nesse caso**: suportar uma camada gratuita para sempre (mesmo limitada) significa manter infraestrutura ativa para servidores/orgs que talvez nunca convertam — com um público dessa faixa de gasto, o trial de 7 dias já filtra quem tem intenção real de pagar, sem precisar carregar usuários gratuitos indefinidamente.
- **Sem taxa de setup continua valendo** — a decisão de não cobrar entrada não muda, só deixa de haver "ficar de graça pra sempre" como opção.

Consequência técnica importante: o middleware `checkSubscription` (seção 11) muda de escopo — hoje ele bloqueia comandos marcados como `isPremium`; num modelo sem free, ele passa a bloquear o **bot inteiro** quando não há assinatura ativa (exceto `/setup` e `/assinar`, que continuam sempre liberados para permitir reativação). Não existe mais "funcionalidade básica liberada" por padrão.

### 17.2 Estrutura de planos (revisada)

Dois planos, sem camada gratuita, preço ancorado no ciclo de gasto recorrente do nicho (ver 17.1):

| | **Standard** | **Business** |
|---|---|---|
| Preço (ponto de partida, **a validar com donos/líderes reais antes de lançar** — ver 17.2.1) | ~R$ 79,90/mês | ~R$ 149,90/mês |
| Painéis ativos | Ilimitados | Ilimitados |
| Baú (inventário), Central + Ranking, Cadastro | ✅ | ✅ |
| Webhook customizado (identidade/branding próprios no painel — nome e avatar do bot passam a ser os da organização) | ❌ | ✅ |
| Prioridade de fila (BullMQ) | ❌ | ✅ |
| Histórico de extrato/central (retenção) | 90 dias | Ilimitado |
| Administradores de billing | 1 | Vários |
| Suporte | Padrão | Prioritário |

Diferença deliberadamente **não** é "funcionalidade básica vs completa" (não existe versão capada das features centrais, seções 22–24) — é branding/identidade, prioridade e retenção de histórico. Isso porque as features centrais (Baú, Central, Cadastro) são o motivo de existir do produto; capá-las por plano prejudicaria a proposta de valor central em vez de só monetizar excedente.

O Webhook Customizado é, na prática, a feature-bandeira do plano Business: em RP, identidade e branding da organização carregam peso de status dentro do jogo — não é uma feature técnica utilitária, é o equivalente a "a org trabalha com a cara dela" no painel, algo que o público já historicamente paga bem por (skins, tags exclusivas, etc.).

Desconto para pagamento anual mantido — reforçado, já que o público desse nicho tende a fechar valores maiores de uma vez (cultura de vaquinha entre jogadores/organizações).

### 17.2.1 Antes de fechar o preço: validação pendente

1. **Levantar o tamanho médio de uma organização** (quantas pessoas ativas tipicamente controlam o Baú de uma facção) antes de travar os R$79,90/R$149,90. Uma org de 3-4 pessoas paga esse valor com folga; uma org de 15+ pessoas pode achar barato pro valor entregue (evitar fraude/sumiço de item é dor cara pra grupo grande) — o preço pode estar deixando valor na mesa nesse cenário.
2. Testar os dois números com 5-10 líderes de organização reais do nicho antes do lançamento — mesmo que informalmente, via DM ou enquete em servidor parceiro — para calibrar antes de travar o `Plan` no banco.

### 17.3 Trial

- **7 dias de acesso completo**, ativado automaticamente no evento `guildCreate` (seção 15.1) — sem pedir cartão, para maximizar o número de servidores/organizações que chegam a experimentar o produto de verdade antes de decidir.
- Ao expirar sem conversão, `Subscription.status` vai para `EXPIRED` e o middleware `checkSubscription` (seção 11) **bloqueia o bot inteiro** — não há mais um nível "básico" para cair. `/setup` e `/assinar` continuam sempre acessíveis, para não impedir a reativação.
- Configuração feita durante o trial (canal, roles, painéis, itens do Baú, etc.) **não é apagada** ao expirar — fica preservada e volta a funcionar assim que a assinatura for reativada. Bloquear o uso não deve custar o trabalho de configuração já feito, isso reduz a fricção de reconversão.
- É o principal gatilho de conversão: a staff já configurou e já depende do bot antes de qualquer cobrança — a perda de acesso ao fim do trial (não uma degradação gradual) é o que cria urgência real de decisão.

### 17.4 O que é "painel" (nome interno: container) — reforço conceitual

Importante para o desenho do dashboard (seção 16) e para o discurso de venda: **painel não é uma ferramenta genérica de criar embeds do zero**. É uma **camada de identidade visual aplicada a uma função que já existe no bot** (ex: painel de ticket, mensagem de boas-vindas, outro módulo futuro). O gestor escolhe cor, texto, e opcionalmente um webhook customizado (nome/avatar próprio) — a função passa a ser renderizada com essa identidade de forma persistente, até ele alterar de novo.

Isso já é modelado no schema atual (`guild_containers`, seção 13 — campos `type`, `payload`, `channelId`, `messageId`), onde `type` identifica *qual função* está sendo estilizada e `payload` guarda a configuração visual escolhida — não o conteúdo livre de um embed arbitrário.

### 17.5 Impacto no modelo de dados

- `Subscription` (seção 10.3) precisa de um campo para diferenciar trial de assinatura paga — ex: `status: TRIALING` (já previsto no enum `SubscriptionStatus`) e um `trialEndsAt` na `Guild` ou na própria `Subscription`, preenchido automaticamente no `guildCreate`.
- `Plan.features` (JSON já previsto no schema) passa a carregar os limites da tabela 17.2 — agora só diferenciando Standard vs Business (`customWebhookEnabled`, `queuePriority`, `centralHistoryDays`, `maxBillingAdmins`), não mais um corte "básico vs completo" entre features centrais, já que Baú/Central/Cadastro (seções 22–24) são iguais nos dois planos.
- `checkSubscription` muda de "verifica se comando é premium e se há assinatura" para simplesmente "verifica se há assinatura `ACTIVE`/`TRIALING`" — o campo `isPremium` do `CommandModule` (seção 7.2) deixa de ter uso prático nesse modelo e pode ser removido ou mantido como reserva para uma eventual feature futura exclusiva de um plano específico (não mais "grátis vs pago").

## 18. Tipos de painel e formato do payload

Detalhamento da seção 17.4: quais funções do bot ganham a camada de identidade visual configurável, e o formato de dados de cada uma. Proposta em `packages/discord-kit/src/containers/types.ts`.

### 18.1 Princípio de design

O `payload` de um painel guarda **apenas identidade visual** (título, descrição, cor, banner, webhook customizado, e agora modo de renderização + variáveis — ver seção 19) — nunca a lógica de negócio da função que ele estiliza. Ex: o painel `ticket_panel` guarda o texto do botão, mas a categoria/permissão de quem pode abrir ticket continua vivendo na configuração própria daquela feature (`TicketConfig`, fora do painel).

### 18.2 Tipos propostos (v1)

| `type` | Função que estiliza | Sticky (via `guild_containers.repostDelay`)? | Campos próprios do payload |
|---|---|---|---|
| `welcome` | Mensagem de boas-vindas ao entrar no servidor | Não | `showMemberCount` |
| `ticket_panel` | Painel de abertura de ticket/suporte | Sim | `buttonLabel` |
| `rules_panel` | Painel fixo de regras do servidor | Sim | — (só identidade) |
| `verification_panel` | Painel de verificação de entrada | Sim | `buttonLabel` |
| `announcement` | Anúncio disparado sob demanda por staff | Não | `mentionRoleId` opcional |

### 18.3 `customWebhook` — a feature-bandeira do plano pago

Quando definido, o painel é enviado via webhook do Discord com nome/avatar próprios (o "Dave Norton" padrão dá lugar à identidade da organização), em vez de aparecer como o bot. Ausência de `customWebhook` faz o painel usar a identidade padrão do bot. Membros da organização continuam podendo editar livremente o **conteúdo** do painel (texto/branding do embed ou container, seção 20) em qualquer plano — o que fica travado ao plano Business é especificamente **nome e avatar do remetente** (a "casca" do bot em si), não o conteúdo da mensagem. O middleware `checkSubscription` e o limite de `Plan.features.customWebhookEnabled` decidem se esse campo pode ser preenchido para aquele servidor/organização.

> Nota técnica a confirmar antes de anunciar como diferencial vendável: nome/avatar do webhook devem ser editáveis livremente a qualquer momento pela organização, ou fixados na criação com edição travada? Edição livre exige alguma validação/moderação leve (evitar nome ofensivo ou impersonation de outro bot/serviço).

## 19. Renderização Embed vs Container, e variáveis dinâmicas nos painéis

### 19.1 Escolha de renderização (`renderMode`)

Decisão: cada painel guarda um campo `renderMode: 'embed' | 'container'` no seu payload — o gestor escolhe, por painel, se ele é enviado como o `EmbedBuilder` tradicional ou como `ContainerBuilder` (Components v2).

Motivo de deixar por painel, e não uma escolha global do servidor: os dois formatos têm trade-offs visuais diferentes (embed é mais compacto e familiar; container permite layout mais rico, com seções e mídia) e o gestor pode preferir um formato pro painel de boas-vindas e outro pro de regras, por exemplo.

Impacto técnico:
- `ContainerIdentity` (seção 18) ganha o campo `renderMode`.
- `container.builder.ts` (seção 6.2) e `embed.builder.ts` (seção 6.1) passam a compartilhar a mesma função de composição de conteúdo (título, descrição, cor, variáveis resolvidas — seção 19.2), cada um só troca a camada final de output (`EmbedBuilder` vs `ContainerBuilder`). Evita duplicar a lógica de resolução de variáveis em dois builders.
- No dashboard, a tela de edição do painel (`/dashboard/[guildId]/paineis`, seção 16.2) ganha um seletor (toggle ou tabs "Embed" / "Container") no topo do formulário, e o preview em tempo real troca de formato junto.

### 19.2 Variáveis dinâmicas nos campos de texto

Decisão: cada `type` de painel expõe uma lista fixa de variáveis permitidas (não texto livre/eval), que o gestor pode inserir em qualquer posição dos campos de texto (`title`, `description`, `buttonLabel`, etc.) usando a sintaxe `${nomeDaVariavel}`.

Exemplos por tipo:

| `type` | Variáveis disponíveis |
|---|---|
| `welcome` | `${welcomeUser}` (menção do novo membro), `${serverName}`, `${memberCount}` |
| `ticket_panel` | `${serverName}` |
| `rules_panel` | `${serverName}` |
| `verification_panel` | `${serverName}` |
| `announcement` | `${serverName}`, `${authorName}` (quem disparou o anúncio) |

Motivos do design:
- **Lista fechada por tipo, não texto livre com eval**: cada `type` só permite as variáveis que fazem sentido pro contexto em que a mensagem é enviada — evita o gestor tentar usar `${welcomeUser}` num painel de regras (onde não existe "novo membro" no momento do envio) e evita qualquer risco de injeção, já que a resolução é um `replace` de chaves conhecidas, não interpretação de código.
- **Posição livre dentro do texto**: a variável pode aparecer em qualquer lugar do `title`/`description` (não um campo separado tipo "saudação" + "resto da mensagem") — dá liberdade real de redação pro gestor.

Implementação:
- Registro de variáveis por `type` em `packages/discord-kit/src/containers/placeholders.ts`, exportando `getAvailablePlaceholders(type)` e `resolvePlaceholders(text, context)` — a mesma função usada tanto no `container.builder.ts`/`embed.builder.ts` (renderização real no Discord) quanto no endpoint de preview do dashboard (seção 16.2), garantindo que o preview bate exatamente com o resultado final.
- `resolvePlaceholders` faz substituição simples de string (`${chave}` → valor do contexto), sem qualquer avaliação de expressão.
- No dashboard, cada campo de texto do formulário de painel ganha um menu/botão "Inserir variável" que lista as opções válidas pro `type` selecionado e insere `${...}` na posição do cursor — evita o gestor precisar digitar a sintaxe de cabeça e elimina erro de digitação na chave.

### 19.3 Impacto no modelo de dados

- `ContainerIdentity` (seção 18.1) ganha `renderMode: 'embed' | 'container'`.
- Nenhuma migration de schema necessária além disso — `payload` já é `Json` livre em `guild_containers` (seção 13), então `renderMode` e o texto com `${variaveis}` cabem no formato existente.

## 20. Criação de painéis: fidelidade ao formato real (Embed vs Container), preview fiel e correção de canais

Correção de rumo importante: a criação de um painel **precisa refletir 1:1 a estrutura real que o Discord.js usa**, não markup sintético (`---`, `<divider>`, etc.) que depois é convertido. Isso vale tanto pra Embed quanto pra Container, mas é especialmente crítico no Container, que é o formato com mais capacidade de customização.

### 20.1 Modo Embed — formulário espelha `EmbedBuilder`

Sem blocos, sem componentes — um `EmbedBuilder` tem uma estrutura fixa de campos. O formulário no dashboard expõe exatamente esses campos, nada além:

| Campo do formulário | Método do `EmbedBuilder` |
|---|---|
| Título | `.setTitle()` |
| Descrição (textarea, aceita variáveis — seção 19.2) | `.setDescription()` |
| Cor de destaque | `.setColor()` |
| URL do título (opcional, vira link clicável) | `.setURL()` |
| Imagem principal | `.setImage()` |
| Thumbnail (miniatura no canto) | `.setThumbnail()` |
| Autor (nome + ícone, opcional) | `.setAuthor({ name, iconURL })` |
| Rodapé (texto + ícone, opcional) | `.setFooter({ text, iconURL })` |
| Timestamp (toggle "mostrar horário atual") | `.setTimestamp()` |
| Campos (lista de nome/valor/inline, adicionar/remover/reordenar) | `.addFields({ name, value, inline })` repetido |

Nenhum campo aqui é livre — cada um mapeia direto pra um método real do builder, então o payload salvo (`ContainerIdentity` + estes campos específicos do modo embed) é suficiente pra reconstruir o embed sem ambiguidade.

### 20.2 Modo Container — construção interativa por blocos, não markup

Esta é a mudança central pedida: o Container (Components v2) é montado como **uma lista ordenada de blocos que o gestor adiciona, reordena e remove pela UI** — cada bloco mapeia 1:1 para um componente real do discord.js. Nenhuma sintaxe de texto (`---`, `<divider>`) é interpretada; o divisor, por exemplo, é literalmente adicionado clicando em um botão "Adicionar divisor" na lista de blocos, não digitado.

Blocos disponíveis na v1, cada um correspondendo diretamente a um componente do Components v2:

| Bloco na UI | Componente real do discord.js | Configurável pelo gestor |
|---|---|---|
| **Texto** | `TextDisplayBuilder` | Conteúdo (aceita variáveis, seção 19.2, e markdown — negrito/itálico/etc via toolbar, não digitado cru) |
| **Divisor** | `SeparatorBuilder` | Espaçamento (pequeno/grande), exibir linha ou só espaço |
| **Galeria de mídia** | `MediaGalleryBuilder` (com `MediaGalleryItemBuilder[]`) | Lista de URLs de imagem, cada uma com descrição alternativa opcional |
| **Seção** (texto + acessório) | `SectionBuilder` (com `TextDisplayBuilder[]` + `ThumbnailBuilder` ou botão como acessório) | Texto(s) da seção + escolha do acessório (thumbnail ou botão) |
| **Arquivo** | `FileBuilder` | URL do arquivo anexado |

Comportamento da UI de construção:
- Lista vertical dos blocos já adicionados, cada um com alça de arrastar (reordenar), botão de editar (abre painel de configuração daquele bloco específico) e botão de remover.
- Botão "+" no final da lista abre um menu com os tipos de bloco disponíveis para adicionar — cada tipo abre seu próprio formulário curto (ex: bloco de texto abre um textarea com toolbar de formatação; bloco de galeria abre uma lista de URLs).
- Nenhum campo de "cole o markup aqui" em lugar nenhum — toda edição é através de controles (textarea com toolbar, inputs de URL, toggles), mesmo para formatação de texto dentro de um bloco de texto (negrito/itálico via botões de toolbar que inserem a sintaxe markdown do Discord no textarea automaticamente, o gestor não precisa saber a sintaxe).

**Modelo de dados**: o payload de um painel em modo `container` guarda um array ordenado de blocos tipados (união discriminada por `blockType`), refletindo exatamente os componentes do discord.js — proposto em `packages/discord-kit/src/containers/blocks.ts` (ver arquivo à parte).

### 20.3 Live Preview — identidade real do bot e suporte a markdown

Dois problemas identificados no preview atual, ambos corrigidos:

**Identidade do remetente**: o preview deve mostrar o **avatar e nome reais do bot** (buscados do próprio client do Discord, ou de um endpoint `GET /bot/identity` que retorna `avatarURL`/`username` da aplicação) como remetente padrão — e trocar para o `customWebhook.name`/`customWebhook.avatarUrl` configurado no painel quando esse campo estiver preenchido (plano Business, seção 18.3). Hoje aparentemente o preview usa um placeholder genérico; precisa refletir exatamente quem vai aparecer como remetente da mensagem real.

**Renderização de markdown**: o preview precisa interpretar a sintaxe markdown do Discord (`**negrito**`, `*itálico*`, `__sublinhado__`, `~~riscado~~`, `` `código` ``, blocos de código, `> citação`, listas, spoilers `||texto||`, links) e renderizar visualmente, não mostrar os caracteres crus. Implementação sugerida: usar uma lib de parsing de markdown com o dialeto do Discord (ex: `discord-markdown` no npm, que já lida com as particularidades do Discord — menções, emojis customizados, etc. — diferente de um parser de markdown genérico) no componente de preview do dashboard, aplicada tanto no modo Embed quanto no Container (todo bloco de texto passa pelo mesmo renderer).

### 20.4 Correção: seletor de canal retornando categorias

Bug identificado: o select de canal (usado em `/dashboard/[guildId]/settings` e na escolha de canal de destino de um painel, seção 2.3 do prompt de UI) está retornando **categorias** (`ChannelType.GuildCategory`) junto com canais de texto — categorias não aceitam envio de mensagem, então selecionar uma quebra o envio.

Correção: o endpoint que lista os canais da guild (provavelmente algo como `GET /guilds/:guildId/channels`) deve filtrar explicitamente por tipo antes de retornar — permitir apenas `ChannelType.GuildText` e, se fizer sentido pro produto, `ChannelType.GuildAnnouncement`. Excluir categorias, canais de voz, fóruns e qualquer outro tipo que não aceite `.send()` de uma mensagem comum. Esse filtro deve acontecer no backend (não só escondido no frontend), para que a validação do `POST /guilds/:guildId/setup` e do endpoint de configuração de painel também rejeitem um `channelId` de categoria caso ele chegue por algum outro caminho.

## 21. Remodelagem de UI do Dashboard — elevar densidade e riqueza visual

Diagnóstico: as telas atuais (seção 16) são funcionalmente corretas mas visualmente "cruas" — listas simples, sem hierarquia visual forte, sem dados agregados visíveis de cara. Esta seção define como elevar isso, tela por tela, sem inventar componentes novos fora do shadcn/ui (seção do prompt de UI já entregue).

### 21.1 Princípios gerais

- **Densidade de informação com hierarquia clara**: usar `Card` com `CardHeader`/`CardDescription` consistentemente para dar peso visual a números importantes (saldo, ranking, contagem), não só texto solto.
- **Dados agregados antes de listas**: toda tela que hoje é "só uma tabela" ganha uma faixa de estatísticas no topo (ex: "12 itens cadastrados", "R$ 45.200 movimentados essa semana") usando `recharts` (já disponível) para pequenos gráficos (sparkline, barra) em vez de só números.
- **Estado vazio ilustrado, não só texto**: usar ícones grandes (`lucide-react`, 48–64px) centralizados com texto de apoio, não uma linha de texto cinza perdida no meio da tela.
- **Cor com propósito semântico consistente**: verde para ganho/positivo, vermelho para perda/negativo, âmbar para pendente/atenção — aplicado de forma consistente em Central, Baú e Cadastro (todas mexem com valores/status).

### 21.2 Redesenho por tela

- **`/dashboard/[guildId]/overview`**: vira um dashboard de verdade — grade de `Card`s de estatística (assinatura, painéis ativos, saldo agregado do Baú, posição no ranking da semana) + gráfico de atividade recente (linha do tempo das últimas ações registradas na Central, últimos 7 dias).
- **`/dashboard/[guildId]/paineis`**: cards de tipo de painel ganham uma prévia em miniatura (thumbnail renderizado do estado atual do painel, não só ícone + nome).
- **`/dashboard/[guildId]/subscription`**: cards de plano lado a lado com comparação de features via ícones de check/x (`CircleCheck`/`X`), plano atual destacado com borda de cor, não só uma lista.
- Novas telas das seções 22–24 seguem os mesmos princípios desde o início.

---

## 22. Sistema de Baú (inventário compartilhado)

### 22.1 Conceito

Um inventário por servidor, com itens cadastrados pela staff e quantidades por item que podem ser ajustadas (soma/subtração) por membros autorizados via painel no Discord. Saldo pode ficar negativo — isso é intencional (representa dívida/déficit a ser registrado, não um erro a ser bloqueado).

### 22.2 Modelo de dados

Proposta completa em `packages/database/prisma/schema-inventory-addition.prisma` (a incorporar ao `schema.prisma` principal, seção 10.3):

- **`InventoryItem`**: `id`, `guildId`, `name`, `description?`, `iconUrl?`, `currentQuantity` (desnormalizado — ver 22.2.1), `isActive`.
- **`InventoryMovement`**: `id`, `itemId`, `guildId`, `quantityDelta` (positivo ou negativo), `resultingQuantity` (saldo após o movimento, para auditoria sem precisar recalcular), `performedByUserId`, `reason?`, `createdAt`.

#### 22.2.1 Concorrência: por que `currentQuantity` é desnormalizado e atômico

Dois membros podem ajustar o mesmo item ao mesmo tempo (dois cliques quase simultâneos no painel). Calcular o saldo como "ler quantidade atual, somar/subtrair, salvar" tem condição de corrida clássica — as duas operações podem ler o mesmo valor inicial e uma sobrescrever a outra.

Solução adotada: `InventoryItem.currentQuantity` é atualizado via `increment`/`decrement` atômico do Prisma dentro de uma transação que também cria o `InventoryMovement` — o banco garante a atomicidade do incremento, não a aplicação. Implementado em `adjustItemQuantity()`, proposta em `apps/bot-worker/src/features/inventory/handlers.ts` — **esta é a única função no sistema com permissão de alterar `currentQuantity`**, todo handler de comando/modal passa por ela, nunca escreve o campo diretamente.

### 22.3 Painel no Discord (`type: 'inventory_panel'`)

- Botão "Ver itens" → paginação (seção 9) da lista de itens com saldo atual.
- Ao selecionar um item → modal com dois botões, "Adicionar quantidade" / "Retirar quantidade" (`customId`: `inventory:adjust:<itemId>:<+|->`, seguindo o padrão da seção 6.4), cada um abrindo um `ModalSubmitInteraction` pedindo o valor (inteiro positivo) e um motivo opcional.
- Staff com permissão de gestão vê botões extras "Criar item" / "Editar item" (mesmo painel, gate por `requiredPermissions` do handler, seção 7).
- Todo ajuste dispara `logFeatureEvent(guildId, 'INVENTORY', ...)` ao final (seção 25.3) — implementado no próprio `adjustItemQuantity()`, não em um listener separado.

### 22.4 Dashboard

Nova tela `/dashboard/[guildId]/bau`: tabela de itens com saldo atual, criação/edição de item (nome, descrição, ícone), e um extrato por item (lista paginada de `InventoryMovement`, mostrando quem fez, quando, delta e motivo) — essencial para investigar divergência de saldo sem precisar vasculhar o Discord.

Endpoints propostos (reaproveitando o mesmo middleware `checkSubscription`/permissão de admin, seções 10.1 e 11):

- `GET /guilds/:guildId/inventory/items` — lista itens ativos com saldo atual.
- `POST /guilds/:guildId/inventory/items` — cria item.
- `PATCH /guilds/:guildId/inventory/items/:itemId` — edita nome/descrição/ícone/`isActive` (não altera `currentQuantity` diretamente — ver 22.2.1).
- `POST /guilds/:guildId/inventory/items/:itemId/movements` — registra ajuste de quantidade a partir do dashboard, passando pela mesma `adjustItemQuantity()` usada pelo bot (fonte de verdade única, seção 22.2.1).
- `GET /guilds/:guildId/inventory/items/:itemId/movements` — extrato paginado (reaproveita o `Paginator`, seção 9).

---

## 23. Central (registro de ações ilegais e meta semanal) + Ranking

### 23.1 Conceito

Registro das "ações" (missões/crimes do RP) executadas, se foram bem-sucedidas ou não, valor envolvido e quem participou — mais o cumprimento de uma meta semanal por membro/grupo. O Ranking (seção 24 originalmente citada junto, mas com regra própria) deriva desses registros.

### 23.2 Modelo de dados

- **`IllegalAction`**: `id`, `guildId`, `cityId` (FK obrigatória para `IllegalActionCity`), `actionTypeId` (FK obrigatória para `IllegalActionType`), `outcome` (`WON` | `LOST`), `amount` (valor em dinheiro do RP, `Int` — centavos ou unidade inteira conforme moeda do servidor), `registeredByUserId`, `createdAt`. Cidade e tipo de ação são hierárquicos e configuráveis por servidor — ver seção 26.2 e `schema-locations-and-actiontypes.prisma`.
- **`IllegalActionParticipant`**: `id`, `actionId` (FK para `IllegalAction`), `discordUserId`, `shareAmount?` (se a divisão de valor por participante for necessária; opcional na v1, pode distribuir igualmente por padrão).
- **`WeeklyGoalSubmission`**: `id`, `guildId`, `discordUserId`, `weekStartDate`, `amountDelivered`, `registeredByUserId`, `createdAt`. `weekStartDate` normalizado (ex: sempre segunda-feira) para permitir agrupar/consultar por semana de forma consistente.

### 23.3 Painel no Discord (`type: 'central_panel'`)

- Botão "Registrar ação" → modal: resultado (ganhou/perdeu), valor, participantes (select de membros, multi-select).
- Botão "Registrar entrega da meta" → modal: valor entregue (associado ao `discordUserId` de quem está preenchendo, ou selecionável se for staff registrando por outro membro).
- Resumo no próprio painel (sticky, se configurado): total movimentado na semana atual, meta batida/faltando — recalculado a cada reenvio do sticky (mesmo mecanismo de repost da seção 13).

### 23.4 Ranking

- Não é uma tabela própria — é uma **consulta agregada** sobre `IllegalActionParticipant`/`IllegalAction` (soma de `shareAmount` ou `amount / participantes` por `discordUserId`, num período configurável: semana atual, mês, total).
- Painel no Discord (`type: 'ranking_panel'`) ou comando dedicado (`/ranking`) que usa o **sistema de paginação já existente** (seção 9) para listar os top participantes — reaproveita a infraestrutura, não cria um sistema de listagem paralelo.
- Para não recalcular a agregação a cada visualização em servidores grandes, cachear o resultado no Redis com TTL curto (ex: 5 min) — mesma lógica de cache já usada em `checkSubscription` (seção 11).

### 23.5 Dashboard

Nova tela `/dashboard/[guildId]/central`: gráfico de movimentação (ganho vs perda ao longo do tempo), tabela de ações registradas (com filtro por período e por participante), tabela de metas semanais por membro (batida/não batida, valor faltante), e o ranking como um leaderboard visual (seção 21.1 — usar avatar do Discord de cada membro via `GuildMember`, seção 10.3, não só o nome).

---

## 24. Sistema de Cadastro (registro de personagem com validação de apelido)

### 24.1 Conceito

Visitante se cadastra informando Nome do Personagem, ID no servidor (numérico, do RP), telefone e quem indicou. O bot valida isso contra o **apelido (nickname)** do usuário em um servidor específico (`SERVER_ID`, um hub central diferente do servidor onde o cadastro ocorre), que segue o padrão `#ID Nome` (ex: `#1234 Carl Johnson`).

### 24.2 Modelo de dados

- **`CharacterRegistration`**: `id`, `guildId`, `discordUserId`, `characterName`, `characterServerId` (o ID numérico do RP, distinto do `discordId`), `phoneNumber`, `referredByUserId?` (FK opcional para outro `User`/`CharacterRegistration`, ou texto livre se o indicador não tiver conta), `status` (`PENDING` | `VERIFIED` | `MISMATCH` | `REJECTED`), `nicknameAtSubmission` (o apelido lido no momento da validação, guardado para auditoria), `createdAt`.

### 24.3 Fluxo de validação

1. Membro preenche o cadastro via modal (painel `type: 'registration_panel'`, botão "Cadastrar").
2. Bot busca o membro pelo `discordUserId` no servidor identificado por `SERVER_ID` (guild fixa de referência — configurável via variável de ambiente/config, não hardcoded no código).
3. Extrai `characterServerId` e `characterName` do apelido via regex (`/^#(\d+)\s+(.+)$/`).
4. Compara com os valores enviados no formulário:
   - Bate os dois → `status: VERIFIED`, log de sucesso.
   - Não bate (nome ou ID diferente) → `status: MISMATCH`, log sinalizando a divergência para staff revisar manualmente — **não rejeita automaticamente**, porque pode ser erro de digitação do apelido ou do formulário, não necessariamente má-fé.
   - Membro não encontrado no servidor de referência ou sem apelido no padrão esperado → `status: PENDING`, staff decide manualmente.
5. Staff tem uma ação de aprovar/rejeitar manualmente qualquer cadastro `MISMATCH`/`PENDING` (botão no log, seção 25, ou na tela do dashboard).

### 24.4 Dashboard

Nova tela `/dashboard/[guildId]/cadastros`: tabela com filtro por status (badges coloridos: verde `VERIFIED`, âmbar `PENDING`, vermelho `MISMATCH`/`REJECTED`), ação de aprovar/rejeitar manualmente, e exibição lado a lado do que foi enviado no formulário vs o apelido lido no momento — facilita a staff decidir rapidamente sem precisar abrir o Discord.

---

## 25. Sistema de log — transversal às quatro features acima

### 25.1 Conceito

Cada uma das features acima (Baú, Central, Cadastro, e futuras) precisa notificar um canal configurável sempre que uma ação relevante acontece — não é uma feature isolada, é uma capacidade que todas usam.

### 25.2 Modelo de dados

- **`FeatureLogConfig`**: `id`, `guildId`, `feature` (`INVENTORY` | `CENTRAL` | `REGISTRATION` | outros conforme surgirem), `channelId`. Uma linha por combinação guild+feature — cada feature pode logar em um canal diferente (ex: log de Baú separado de log de Cadastro).

### 25.3 Mecanismo

- Função utilitária única em `packages/discord-kit/src/logging/log-event.ts`: `logFeatureEvent(guildId, feature, embedOrContainer)` — busca o `channelId` configurado em `FeatureLogConfig`, e envia via o mesmo `responder`/builder já existente (seção 6), reaproveitando toda a infraestrutura de composição visual. Se não houver canal configurado para aquela feature, a função é um no-op silencioso (não quebra a ação principal por falta de canal de log).
- Todo handler das três features acima (movimento de item, registro de ação/meta, cadastro processado) chama essa função ao final da própria execução — não é um listener de evento separado escutando tudo (mais simples de rastrear o que dispara o quê, e evita acoplamento indireto via eventos).
- Formato do log é sempre um embed/container simples e padronizado por feature (quem fez, o quê, quando, valor/detalhe relevante) — usa o mesmo `container.builder.ts`/`embed.builder.ts`, não um formato ad-hoc por feature.

### 25.4 Dashboard

Cada uma das telas novas (Baú, Central, Cadastro) ganha, na sua própria página de configurações (ou uma aba dentro dela), um seletor de canal de log (mesmo componente de seleção de canal já corrigido na seção 20.4 — só `GuildText`/`GuildAnnouncement`) — não é uma tela separada de "configuração de logs" para não fragmentar o contexto de cada feature.

### 25.5 Impacto na estrutura de pastas e planos

- `Plan.features` (seção 17.5) ganha flags específicas dessas features conforme a estratégia de monetização evoluir (ex: `maxInventoryItems`, `centralHistoryDays` diferenciando Standard vs Business — **não mais "limitando o histórico visível no plano Free"**, já que esse plano deixou de existir na seção 17.1) — a decidir quando as features estiverem implementadas e o comportamento de uso real for observado.
- Estrutura de pastas (seção 5) ganha `apps/bot-worker/src/features/{inventory,central,registration}/` para os handlers de comando/interação de cada uma, e as tabelas acima entram no `schema.prisma` (seção 10.3) como uma extensão do modelo existente, não uma reformulação.

## 26. Especificação detalhada dos painéis: Baú, Ações Ilegais, Ranking, Metas, Registro

Baseado em documentação de comportamento observado nos módulos do projeto anterior (fonte externa), adaptado à arquitetura do Dave: `defineCommand`/router (seção 7), `Paginator`/`SelectPaginator` (seção 9), blocos de Container (seção 20.2), `logFeatureEvent` (seção 25), e os modelos de dados já definidos (Baú seção 22; Ações Ilegais/Ranking/Metas seção 23; Registro seção 24).

### 26.0 Princípio geral: reconstrução total do container por etapa

Regra adotada para todos os painéis com fluxo em múltiplas etapas (Ações Ilegais é o caso mais claro, mas vale para qualquer painel com estado): **ao mudar de etapa, o container inteiro é reconstruído e reenviado via `interaction.update()`**, nunca só o componente que mudou (ex: só o select). Motivo: o texto ao redor (instruções da etapa, resumo da seleção atual, contagem, avisos de limite) normalmente depende do estado da etapa tanto quanto o próprio componente interativo — atualizar só uma peça deixaria o container com informação desatualizada no texto enquanto o componente já mudou.

Estado temporário entre etapas de um mesmo fluxo (ex: cidade já escolhida, aguardando escolha de participantes) é mantido no Redis com TTL curto, seguindo o mesmo padrão de sessão de paginação (seção 9.1) — não em memória do processo, para funcionar corretamente com múltiplas réplicas do `bot-worker` (seção 3.3).

---

### 26.1 Painel do Baú (`type: 'inventory_panel'`)

Complementa o modelo de dados já definido na seção 22.

**Mensagem principal do container:**
- Orientação inicial: escolher uma localização do baú (se o servidor tiver múltiplas localizações configuradas — ver nota de escopo abaixo) ou ir direto para a visão de itens, se só houver uma.
- Quando há itens sumarizados, uma visão global soma a quantidade de cada item em todas as localizações que o membro tem permissão de ver.
- Texto muda conforme a permissão do membro (`requiredPermissions`, seção 7.2) e conforme há ou não dados a mostrar (estado vazio: "nenhum item cadastrado ainda", com CTA para staff criar via dashboard ou botão "Criar item").

**Localizações**: confirmado como requisito — servidores de GTA RP tipicamente têm múltiplas localizações de baú (ex: "QG", "Casa X", "Casa Y"), configuráveis pela staff via dashboard. Modelo de dados em `schema-locations-and-actiontypes.prisma`: `InventoryLocation` (`id`, `guildId`, `name`, `allowedRoleIds[]`), e `InventoryItem` (seção 22.2) ganha `locationId` **opcional** — nullable porque um item pode não pertencer a nenhuma localização específica, mantendo compatibilidade com o caso mais simples (servidor sem o conceito de localização, tudo num "baú geral").

**Comportamento esperado:**
- Navegação entre localização → lista de itens → ação de adicionar/retirar, cada transição reconstruindo o container inteiro (seção 26.0).
- Validação de permissão por localização (se implementada) antes de mostrar conteúdo sensível de saldo.
- Ação de adicionar/retirar sempre passa por `adjustItemQuantity()` (seção 22.2.1) — nunca lida diretamente com o campo de saldo.

**Paginação:**
- **Resumo global de itens**: `SelectPaginator` (seção 9.4) com **15 itens por página** (não 25 — valor observado no comportamento legado, provavelmente por limite de espaço visual do texto que acompanha cada item no container, diferente do limite físico de opções do select).
- **Lista de itens por localização**: `Paginator` por botões (seção 9.1–9.3), com o texto do container mostrando página atual/total — reconstrução completa do container a cada troca de página, não só do texto da paginação.
- Seleção de localizações: sem paginação por padrão; se a lista de localizações ultrapassar 25, usar `SelectPaginator`.

**Gerenciamento de localizações (dashboard)**: nova sub-tela dentro de `/dashboard/[guildId]/bau` (aba ou seção "Localizações") — CRUD simples de `InventoryLocation` (nome + roles com acesso, via o mesmo componente de multi-select de roles já usado em `/settings`, seção 16.2). Endpoints: `GET/POST /guilds/:guildId/inventory/locations`, `PATCH /guilds/:guildId/inventory/locations/:locationId`. Criar item (seção 22.4) passa a ter um select de localização (opcional) no formulário.

---

### 26.2 Painel de Ações Ilegais (`type: 'illegal_action_panel'`)

Complementa o modelo de dados já definido na seção 23.2 (`IllegalAction`, `IllegalActionParticipant`).

Fluxo em etapas (é o painel mais complexo dos cinco — totalmente orientado a fluxo, seção 26.0 se aplica integralmente):

1. **Seleção de cidade** — ex: Los Santos, Sandy Shores. Configurável pela staff via dashboard, modelo `IllegalActionCity` (`schema-locations-and-actiontypes.prisma`).
2. **Seleção de tipo de ação** — os tipos são **vinculados à cidade escolhida na etapa anterior**, não uma lista global — confirmado pelo exemplo de uso: a cidade "Metrópole" tem os tipos "CAPITAL" e "DETROIT", que só fazem sentido dentro daquela cidade. Modelo `IllegalActionType` (`cityId`, `name`, `maxParticipants?` — limite de participantes pode variar por tipo de ação, não só por servidor).
3. **Seleção de participantes** — multi-select de membros, com validação de limite máximo: usa `IllegalActionType.maxParticipants` se definido, senão cai para um limite padrão configurável em `GuildSettings.data` (seção 10.3).
4. **Resultado e valor** — modal com resultado (ganhou/perdeu) e valor.

Ambos `cityId` e `actionTypeId` são **obrigatórios** em `IllegalAction` (não nullable) — diferente da localização do Baú, que é opcional; cidade e tipo de ação foram confirmados como primordiais para o registro fazer sentido no domínio do RP.

**Mensagens do container por etapa:**
- Título e texto mudam conforme a etapa atual (ex: "Escolha a cidade" → "Escolha o tipo de ação" → "Escolha os participantes").
- Em etapas de seleção múltipla, o container mostra um resumo da seleção já feita até aqui (ex: "Cidade: Los Santos | Ação: Assalto ao banco") e aviso quando o limite de participantes está próximo/atingido.

**Comportamento esperado:**
- Estado da etapa mantido por usuário durante o fluxo (Redis, TTL curto — seção 26.0), permitindo avançar e também **voltar** a uma etapa anterior sem perder o que já foi escolhido.
- Ao concluir, cria `IllegalAction` + `IllegalActionParticipant[]` (seção 23.2) numa transação, dispara `logFeatureEvent(guildId, 'CENTRAL', ...)` (seção 25.3).

**Paginação:**
- Cidade, tipo de ação e participantes usam `SelectPaginator` (seção 9.4) quando a respectiva lista ultrapassa 25 opções — prefixos de customId distintos por etapa (`illegal-action:city`, `illegal-action:type`, `illegal-action:participants`), evitando colisão entre as listas de etapas diferentes no roteamento (seção 6.4).
- Container da etapa é sempre recriado por completo a cada navegação de página, não só o select (seção 26.0).

**Gerenciamento de cidades e tipos (dashboard)**: nova tela `/dashboard/[guildId]/central/configuracoes` (ou aba dentro de `/central`, seção 23.5) — CRUD de `IllegalActionCity`, e dentro de cada cidade (drill-down), CRUD de `IllegalActionType` com o campo opcional de limite de participantes. Endpoints: `GET/POST /guilds/:guildId/illegal-actions/cities`, `GET/POST/PATCH /guilds/:guildId/illegal-actions/cities/:cityId/types`.

---

### 26.3 Painel de Ranking (`type: 'ranking_panel'`)

Complementa a seção 23.4.

**Mensagem principal do container:**
- Título: ranking semanal de ações.
- Corpo: lista dos membros ranqueados com número de vitórias (ou valor ganho, conforme critério de ordenação escolhido — a definir se é por quantidade de ações ou valor monetário total; ambos calculáveis a partir de `IllegalActionParticipant`, seção 23.2).
- Rodapé: data/hora da última atualização e tempo restante até o reset semanal.
- **Resiliência ao vazio**: quando não há nenhuma ação vencida na semana corrente, o container mostra uma mensagem própria de "nenhuma ação registrada ainda essa semana" em vez de uma lista vazia sem explicação — segue o mesmo princípio de estado vazio ilustrado da seção 21.1 (adaptado ao contexto de container no Discord: texto claro, não deixar em branco).

**Comportamento esperado:**
- Mensagem é criada ou **atualizada automaticamente** no canal configurado — reaproveita o mesmo mecanismo de sticky message / repost já implementado para painéis em geral (`guild_containers.repostDelay`, seção 13), não um sistema de atualização paralelo.
- Ranking recalculado com base no período semanal atual (mesma normalização de `weekStartDate` usada em `WeeklyGoalSubmission`, seção 23.2, para consistência entre Ranking e Metas quanto à definição de "semana").
- Resultado cacheado no Redis com TTL curto (seção 23.4) — a atualização do sticky não deve recalcular a agregação do zero a cada reenvio se o TTL ainda for válido.

**Paginação:**
- Container principal não é paginado (lista de ranking tipicamente curta — top N configurável, ex: top 10). Se um caso de uso futuro pedir "ver ranking completo", isso vira uma tela separada com `Paginator` por botões, não o painel principal.

---

### 26.4 Painel de Metas (`type: 'weekly_goal_panel'`)

Complementa a seção 23.2 (`WeeklyGoalSubmission`).

**Mensagem principal do container:**
- Título indicando meta semanal.
- Texto explicando que o botão registra a entrega da meta.
- Botão principal: "Registrar Meta".
- Rodapé: contagem relativa até o fim da semana (mesma normalização de `weekStartDate` da seção 26.3).

**Comportamento esperado:**
- Mensagem enviada/atualizada no canal configurado da guild — mesmo mecanismo de sticky (seção 13).
- Clique no botão abre modal de registro (valor entregue); se for staff registrando por outro membro, um passo adicional de seleção do membro-alvo precede o modal.
- Interface depende de roles e canal configurados no servidor — validado antes de renderizar o container principal (mesma validação de canal/role já aplicada nos demais painéis, seção 20.4).
- Ao concluir, cria `WeeklyGoalSubmission` (seção 23.2) e dispara `logFeatureEvent(guildId, 'CENTRAL', ...)`.

**Paginação:**
- Container principal não é paginado.
- Se a seleção de membro-alvo (fluxo de staff registrando por terceiro) tiver lista grande, usar `SelectPaginator` — mas isso pertence ao subfluxo, não ao container inicial do painel.

---

### 26.5 Painel de Registro (`type: 'registration_panel'`)

Complementa o modelo de dados já definido na seção 24.2 (`CharacterRegistration`), com um refinamento de fluxo:

**Mensagem principal do container:**
- Texto de boas-vindas explicando que o cadastro é obrigatório para acesso à comunidade.
- Botão principal: "Realizar Cadastro".
- Rodapé: assinatura curta identificando o sistema/equipe.

**Comportamento esperado (fluxo de cadastro):**
- Clique abre modal com nome do personagem, "passaporte" (equivalente ao `characterServerId` da seção 24.2 — nome usado no domínio do RP) e telefone.
- Telefone aceita entrada simples (sem máscara obrigatória no input) e é **normalizado para um formato padrão** no backend antes de salvar (ex: remover caracteres não numéricos, validar tamanho) — evita que pequenas variações de digitação (`(11) 91234-5678` vs `11912345678`) sejam tratadas como dados diferentes em consultas futuras.
- Passaporte/`characterServerId` validado como numérico no próprio modal (validação client-side do Discord já rejeita não-numérico se o campo for configurado como tal, mais validação server-side de qualquer forma).
- Após submissão, roda a validação contra o apelido no servidor de referência (seção 24.3) e gera `status: VERIFIED`/`MISMATCH`/`PENDING`.

**Container de aprovação de cadastro** (tela/mensagem separada, voltada para staff):
- Exibe um resumo do solicitante: nome do personagem, passaporte, telefone normalizado, quem indicou.
- Mostra o **avatar do Discord do usuário como thumbnail** (`SectionBuilder` com acessório `thumbnail`, seção 20.2) — facilita reconhecimento visual rápido pela staff.
- Botões "Aprovar" e "Negar", alterando `CharacterRegistration.status` para `VERIFIED`/`REJECTED` manualmente, e disparando `logFeatureEvent(guildId, 'REGISTRATION', ...)` (seção 25.3).

**Paginação:**
- Não há paginação neste painel — cadastro é um fluxo de formulário único (modal), e a fila de aprovação (se exposta como lista para a staff) é responsabilidade da tela de dashboard `/dashboard/[guildId]/cadastros` (seção 24.4), que já usa a paginação de tabela padrão do dashboard, não do container do Discord.

---

### 26.6 Resumo de classificação por tipo de interface

Segue a mesma categorização observada no comportamento legado, mapeada aos cinco painéis desta especificação:

| Categoria | Painéis | Implicação de design |
|---|---|---|
| **Interface estática** | Ranking, Metas, Registro (tela inicial) | Container principal não paginado, reconstrução simples ao atualizar dados (sticky), sem estado de múltiplas etapas. |
| **Interface semi-dinâmica** | Baú | Mistura texto estático (orientação), filtro por permissão (localização) e navegação por página — `SelectPaginator` e `Paginator` coexistem conforme a visão (global vs por localização). |
| **Interface orientada a fluxo** | Ações Ilegais | Múltiplas etapas com estado temporário por usuário, reconstrução total do container a cada etapa (seção 26.0), navegação para frente e para trás preservando seleção. |