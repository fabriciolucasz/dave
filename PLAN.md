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

## 10. Controle de acesso e modelo de dados

### 10.1 Quem pode configurar e assinar o bot

Decisão: **qualquer membro com permissão `ADMINISTRATOR` (ou `MANAGE_GUILD`) no servidor pode adicionar, configurar e assinar o bot** — não travado só no dono do servidor.

Motivos:
- Delegação de gestão para staff é comum em servidores de RP.
- O Discord já resolve a autorização via `GET /users/@me/guilds` (campo `permissions`).
- O que importa rastrear não é "quem pode configurar", mas "quem é responsável pela cobrança" — por isso `Subscription.createdByUserId` e `AuditLog`.

Implementado: `POST /subscriptions/:guildId/cancel` só permite o criador da assinatura ou o dono do servidor; outros admins recebem `403`.

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
- **`Subscription`** — vinculada à `Guild`, registra `createdByUserId`, status, período, `PaymentProvider`.
- **`AuditLog`** — `action` + `metadata` em JSON, quem fez o quê em cada guild.

## 11. Fluxo operacional de billing

- `billing-worker` escuta webhooks do Mercado Pago (primário) e Stripe (secundário) e atualiza `subscriptions`.
- Middleware `isPremium` no `CommandModule` + `checkSubscription` verifica assinatura antes de comandos premium, cacheado no Redis com TTL curto.
- Cron diário (BullMQ *repeatable job*) varre assinaturas vencidas e aplica downgrade/bloqueio.
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
- [x] Tela `/dashboard/[guildId]/containers` (somente leitura + desativar, sem criação pelo dashboard na v1) — ver seção 16.2
- [x] Tela `/dashboard/[guildId]/subscription` (checkout, status, cancelamento com trava de permissão) — ver seção 16.2
- [x] Tela `/account`
- [x] Estados de loading/vazio/erro de permissão/assinatura vencida em todas as telas — ver seção 16.3
- [x] Após dashboard pronto: adicionar link na DM de boas-vindas do `guildCreate`

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

- Rotas/comandos premium passam pelo `checkSubscription`.
- `/setup` e `/assinar` são os únicos comandos liberados sem assinatura ativa.

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
- **Sidebar lateral** com as seções por servidor: Visão geral, Configurações, Containers, Assinatura.
- Se o usuário não tem acesso a nenhum servidor com o bot instalado, a sidebar não aparece — vai direto para a tela de "adicionar o bot".

### 16.2 Telas

| Rota | Propósito | Comportamento específico |
|---|---|---|
| `/login` | Autenticação | Só o botão "Continuar com Discord". Sem alternativa de senha/formulário. |
| `/dashboard` | Roteamento pós-login | 1 servidor → redireciona direto para `overview`. Múltiplos → grade de cards (ícone, nome, badge de status: ativo / assinatura vencida / não configurado). Zero → tela de convite do bot (botão de link OAuth2 de instalação). |
| `/dashboard/[guildId]/overview` | Home do servidor | Status da assinatura (badge), canal/roles configurados, contagem de containers ativos, atalhos para as outras telas. |
| `/dashboard/[guildId]/settings` | Configuração | Espelha o wizard `/setup` do Discord como formulário: select de canal padrão, multi-select de roles permitidas. Salva via `POST /guilds/:guildId/setup` — mesmo endpoint usado pelo comando, então mudança aqui reflete no bot imediatamente. |
| `/dashboard/[guildId]/containers` | Containers ativos | Tabela: tipo, canal, status ativo/inativo, botão de desativar. **Sem criação pelo dashboard na v1** — criação continua via `/container create` no Discord, evitando duplicar a lógica de renderização de container no frontend. |
| `/dashboard/[guildId]/subscription` | Assinatura | Status do plano, data de renovação, botões Assinar/Trocar de plano/Cancelar. Botão de cancelar só fica habilitado se o usuário logado for o `createdByUserId` ou o dono do servidor (mesma regra do endpoint, seção 10.1) — outros admins veem o botão desabilitado com tooltip explicando o motivo. |
| `/account` | Perfil | Dados vindos do Discord (avatar, username), sem campos editáveis — a fonte da verdade é o Discord. |

### 16.3 Estados obrigatórios em toda tela

- **Loading**: skeleton com o formato do conteúdo real da tela, não um spinner genérico.
- **Vazio**: ex. zero containers → texto explicando como criar um pelo Discord, sem tratar como erro.
- **Erro de permissão**: se a permissão do usuário mudou no Discord entre a sincronização e a ação, a API retorna `403` e a UI mostra "Sua permissão pode ter mudado, atualize a página" em vez de travar silenciosamente.
- **Assinatura vencida**: banner persistente no topo do dashboard daquele servidor (não modal bloqueante), com CTA para renovar — espelha o princípio do `checkSubscription` do bot (seção 11), mas no dashboard bloqueia a ação equivalente com o banner em vez de recusar o comando.


## 17. Estratégia de monetização e planos

### 17.1 Modelo: sem taxa de setup, freemium + trial + mensalidade

Decisão: **não cobrar taxa de "desenvolvimento"/setup**. Apenas mensalidade (com opção anual com desconto), com um plano Free permanente e um trial temporário do Pro.

Motivos:
- O mercado de bots de Discord (MEE6, Dyno, Ticket Tool, Carl-bot) já treinou o gestor a esperar instalação gratuita. Uma taxa de entrada é uma barreira que os concorrentes diretos não têm.
- Fricção de pagamento antes de qualquer valor entregue derruba conversão — o gestor ainda não viu o bot funcionando na prática.
- O custo marginal de atender mais um servidor é ~zero (arquitetura multi-tenant, seção 3) — diferente de uma agência que cobra setup por trabalho manual por cliente. Não há custo por servidor a recuperar com taxa fixa.

### 17.2 Estrutura de planos

| | **Free** | **Pro** | **Business** |
|---|---|---|---|
| Preço | R$ 0 | mensal (valor a definir) | mensal, mais alto |
| Containers ativos (identidade visual configurável) | 1 | Ilimitados | Ilimitados |
| Webhook customizado (nome/avatar próprio no container) | ❌ | ✅ | ✅ |
| Prioridade de fila (BullMQ) | ❌ | ❌ | ✅ |
| Administradores de billing (quem pode gerenciar a assinatura) | 1 (quem assinou) | 1 | Vários |
| Suporte | Comunidade | Padrão | Prioritário |

Desconto para pagamento anual, oferecido de forma visível desde o primeiro contato com a tela de assinatura (`/dashboard/[guildId]/subscription`, seção 16.2) — comunidades de RP costumam arrecadar via vaquinha entre jogadores, então fechar o valor anual de uma vez facilita esse fluxo.

Preço fixo por servidor (`Guild`), não por membro — consistente com o modelo atual de `Subscription` vinculada a `Guild`, e evita penalizar servidores grandes logo no início.

### 17.3 Trial

- **7 dias de acesso Pro completo**, ativado automaticamente no evento `guildCreate` (seção 15.1) — sem pedir cartão.
- Ao expirar sem conversão, o middleware `checkSubscription` (seção 11) passa a tratar o servidor como Free — funcionalidades acima do limite Free ficam bloqueadas, não o bot inteiro.
- É o principal gatilho de conversão: a staff já configurou e já depende do bot antes de ver qualquer cobrança.

### 17.4 O que é "container" — reforço conceitual

Importante para o desenho do dashboard (seção 16) e para o discurso de venda: **container não é uma ferramenta genérica de criar embeds do zero**. É uma **camada de identidade visual aplicada a uma função que já existe no bot** (ex: painel de ticket, mensagem de boas-vindas, outro módulo futuro). O gestor escolhe cor, texto, e opcionalmente um webhook customizado (nome/avatar próprio) — a função passa a ser renderizada com essa identidade de forma persistente, até ele alterar de novo.

Isso já é modelado no schema atual (`guild_containers`, seção 13 — campos `type`, `payload`, `channelId`, `messageId`), onde `type` identifica *qual função* está sendo estilizada e `payload` guarda a configuração visual escolhida — não o conteúdo livre de um embed arbitrário.

Implicações para o roadmap do dashboard (seção 16.2, tela `/dashboard/[guildId]/containers`): quando a criação/edição avançada for implementada ali (hoje limitada a desativar — v1), a UI deve deixar claro que o gestor está **personalizando a aparência de uma função existente**, não criando conteúdo novo do zero. Essa é a funcionalidade-bandeira do plano Pro — o gatilho de conversão mais forte do produto, mais relevante que qualquer limite numérico de comandos.

### 17.5 Impacto no modelo de dados

- `Subscription` (seção 10.3) precisa de um campo para diferenciar trial de assinatura paga — ex: `status: TRIALING` (já previsto no enum `SubscriptionStatus`) e um `trialEndsAt` na `Guild` ou na própria `Subscription`, preenchido automaticamente no `guildCreate`.
- `Plan.features` (JSON já previsto no schema) passa a carregar os limites por plano descritos na tabela 17.2 (ex: `maxActiveContainers`, `customWebhookEnabled`, `queuePriority`) — o middleware `checkSubscription` e o limite de containers ativos leem daqui, evitando hardcode de regras de negócio no código do bot.

## 18. Tipos de container e formato do payload

Detalhamento da seção 17.4: quais funções do bot ganham a camada de identidade visual configurável, e o formato de dados de cada uma. Proposta em `packages/discord-kit/src/containers/types.ts`.

### 18.1 Princípio de design

O `payload` de um container guarda **apenas identidade visual** (título, descrição, cor, banner, webhook customizado) — nunca a lógica de negócio da função que ele estiliza. Ex: o container `ticket_panel` guarda o texto do botão, mas a categoria/permissão de quem pode abrir ticket continua vivendo na configuração própria daquela feature (`TicketConfig`, fora do container). Isso evita que o sistema de container vire, na prática, um builder de conteúdo genérico — ele é estritamente uma camada de estilo sobre funções que já existem.

Toda `ContainerIdentity` compartilha os mesmos campos base (`title`, `description`, `accentColor`, `bannerUrl`, `customWebhook`), o que permite que o `container.builder.ts` (seção 6.2) renderize qualquer tipo com a mesma lógica de composição visual — só o conteúdo funcional específico varia por `type`.

### 18.2 Tipos propostos (v1)

| `type` | Função que estiliza | Sticky (via `guild_containers.repostDelay`)? | Campos próprios do payload |
|---|---|---|---|
| `welcome` | Mensagem de boas-vindas ao entrar no servidor | Não | `showMemberCount` |
| `ticket_panel` | Painel de abertura de ticket/suporte | Sim | `buttonLabel` |
| `rules_panel` | Painel fixo de regras do servidor | Sim | — (só identidade) |
| `verification_panel` | Painel de verificação de entrada | Sim | `buttonLabel` |
| `announcement` | Anúncio disparado sob demanda por staff | Não | `mentionRoleId` opcional |

Lista não é exaustiva — novos `type` podem ser adicionados conforme novas funções do bot forem construídas; a união discriminada em `ContainerPayload` garante que cada novo tipo declare só os campos que fazem sentido pra ele.

### 18.3 `customWebhook` — a feature-bandeira do plano pago

Quando definido, o container é enviado via webhook do Discord com nome/avatar próprios, em vez de aparecer como o bot — é a funcionalidade citada na seção 17.2/17.4 como principal gatilho de conversão para o plano Pro. Ausência de `customWebhook` faz o container usar a identidade padrão do bot. O middleware `checkSubscription` (seção 11) e o limite de `Plan.features.customWebhookEnabled` (seção 17.5) decidem se esse campo pode ser preenchido para aquele servidor.