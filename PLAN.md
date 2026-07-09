# PLAN.md — Dave (bot de Discord multi-tenant / mini SaaS para gestores de GTA RP)

Este documento descreve a arquitetura do projeto. Itens marcados como concluídos na seção 13 (Próximos passos) refletem trabalho já implementado; o restante do documento descreve tanto decisões já tomadas quanto propostas de design. Serve como referência viva — atualize conforme o código evoluir.

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
│   └── billing-worker/       # webhooks Mercado Pago/Stripe, cron de expiração
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

Proposta de função única `defineCommand()` para criar qualquer um dos três tipos de comando suportados pelo Discord/pelo bot, com o TypeScript inferindo os campos certos a partir do discriminador `type`. Arquivos propostos em `packages/discord-kit/src/commands/`: `types.ts`, `define-command.ts`, e um exemplo de uso.

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
- Exposto como singleton via módulo (`export const commandRegistry = new CommandRegistry()`) — segue o critério da seção 8: guarda estado real (comandos registrados) que precisa persistir entre chamadas, então é uma classe singleton, não uma função pura.
- `getRegisterableCommands()` filtra só os comandos que precisam ser enviados à API do Discord — comandos `prefix` nunca passam por ali.

## 8. Padrão de instanciação: quando usar classe/singleton vs função pura

Critério adotado no projeto para decidir entre singleton, classe ou função pura — não é "usar classe ou não", é **"esse objeto representa um recurso caro/compartilhado, ou um valor que naturalmente muda a cada chamada?"**.

| Tipo de coisa | Abordagem | Motivo |
|---|---|---|
| Client de banco (Prisma/Drizzle), Redis, BullMQ, `Client` do discord.js | **Singleton via módulo** | Recurso caro e único por processo — conexões não devem ser recriadas |
| Embed/Container builders | Função que retorna instância nova a cada chamada | Conteúdo muda por interação; instância é barata e esperada. Compartilhar instância aqui gera estado mutável vazando entre comandos concorrentes |
| Router de `customId` / `CommandRegistry` | Classe singleton | Guarda estado real (mapa de handlers/comandos) que precisa persistir entre chamadas |
| Handlers de comando | Funções puras (`async function execute(interaction) {}`) | Sem estado próprio, mais fácil de testar |

### 8.1 Singleton via módulo (operações vitais/essenciais)

Para tudo que é **recurso caro e único por processo** — conexão com Postgres, client Redis, conexão do BullMQ, o `Client` do discord.js — o padrão adotado é **singleton via módulo**, não classe com `getInstance()`. Como módulos ES são cacheados pelo runtime, o arquivo só executa uma vez, não importa quantos lugares façam `import`:

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

Vantagens sobre singleton em classe: mais simples de testar (dá pra mockar o módulo inteiro), sem cerimônia de `getInstance()`, e o próprio runtime garante unicidade da instância.

### 8.2 Classe singleton (estado de configuração persistente)

Quando o singleton precisa de **comportamento**, não só um valor exposto — por exemplo, o router de `customId` que mantém um mapa de handlers registrados — uma classe instanciada uma única vez e exportada faz sentido:

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

export const componentRouter = new ComponentRouter(); // uma única instância no processo todo
```

### 8.3 Instância nova por chamada (builders e handlers)

Para os builders (`embed.builder.ts`, `container.builder.ts`, `responder.builder.ts`) e handlers de comando, evitar classes/singleton — usar factory functions. O conteúdo de um embed muda a cada interação, então instanciar por chamada é esperado e barato; compartilhar uma instância aqui introduz estado mutável compartilhado, fonte comum de bugs em sistema concorrente (dois comandos rodando ao mesmo tempo podem vazar campos um pro outro se dividirem a mesma instância de builder):

```typescript
// em vez de um serviço com estado, uma função pura que retorna instância nova
export function successEmbed(title: string, description?: string) {
  return new EmbedBuilder().setColor(Colors.Green).setTitle(title).setDescription(description ?? null);
}
```

## 9. Sistema de paginação (discord-kit)

Proposta de design para paginação eficiente de listagens (membros, logs de auditoria, etc.) usadas em embeds/containers. Arquivos propostos em `packages/discord-kit/src/pagination/`: `types.ts`, `paginator.ts`, e um exemplo de uso.

### 9.1 Onde mora o estado da paginação

Decisão: **stateless por padrão**, com sessão no Redis apenas quando necessário.

- **Nunca guardar a lista inteira em memória** indexada por `messageId` — não escala entre múltiplas réplicas do `bot-worker` (que não compartilham memória) e vaza memória se a paginação nunca for usada até o fim.
- **Página atual + query pequena viajam dentro do próprio `customId`** do botão (ex: `page:member-list:2:guild_123`). Isso é stateless: qualquer réplica do worker consegue responder o clique, mesmo depois de reiniciar ou sem ter sido a réplica que criou a mensagem.
- **Sessão no Redis só quando a query é grande demais** para caber no limite de 100 caracteres do `customId` (ex: múltiplos filtros de data/ação em um log de auditoria). Nesse caso, o customId carrega apenas um id curto de sessão, com TTL curto (ex: 15 min).

### 9.2 Busca de dados

- `fetchPage(query, pageIndex, pageSize)` busca **só a página necessária**, nunca a lista inteira — paginação real no banco (`LIMIT`/`OFFSET` como ponto de partida; trocar por paginação por cursor se alguma tabela crescer para o ponto de `OFFSET` alto ficar caro).
- `render(items, pageIndex, totalPages)` fica a cargo de quem usa o paginator — a mesma assinatura funciona tanto para retornar um `EmbedBuilder` (sistema antigo) quanto um `ContainerBuilder` (Components v2), então o paginator em si é agnóstico ao sistema visual usado.

### 9.3 Interação com os botões

- Botões padrão: primeira página / anterior / próxima / última — desabilitados automaticamente nos limites.
- Clique sempre responde com `interaction.update()`, editando a mensagem existente em vez de criar uma nova (evita spam no canal).
- Clamp defensivo do `pageIndex` recebido do customId — dados podem ter mudado (item deletado) entre um clique e outro, então nunca confiar cegamente no valor vindo do cliente.
- Se a sessão no Redis expirar, o `deserializeQuery` lança um erro identificável (`PAGINATION_SESSION_EXPIRED`) para o responder decidir como avisar o usuário (ex: "essa listagem expirou, rode o comando novamente").

## 10. Controle de acesso e modelo de dados

### 10.1 Quem pode configurar e assinar o bot

Decisão: **qualquer membro com permissão `ADMINISTRATOR` (ou `MANAGE_GUILD`) no servidor pode adicionar, configurar e assinar o bot** — não travado só no dono do servidor. Segue o mesmo padrão de bots consolidados no mercado (MEE6, Dyno, Ticket Tool).

Motivos:
- Na prática, donos de servidor de RP costumam delegar a gestão para uma equipe de staff/administradores. Travar no dono cria gargalo de suporte ("o dono sumiu, ninguém mexe no bot").
- O próprio Discord resolve a autorização por nós: no login OAuth2, `GET /users/@me/guilds` retorna o campo `permissions` do usuário em cada servidor — basta checar o bit de `ADMINISTRATOR`/`MANAGE_GUILD`, sem reinventar um sistema de permissões próprio.
- O risco real não é "quem pode configurar", é "quem é responsável pela cobrança". Por isso o modelo de dados sempre registra:
  - quem criou/gerencia cada assinatura (`Subscription.createdByUserId`);
  - quem fez cada ação sensível (`AuditLog`).

Implementado: `POST /subscriptions/:guildId/cancel` só permite o criador da assinatura ou o dono do servidor; outros admins recebem `403`.

### 10.2 Autenticação do frontend

- Autenticação via **Discord OAuth2** — sem senha própria, sem gestão de credenciais.
- Fluxo: usuário autoriza no Discord → recebemos `access_token`/`refresh_token` → usamos `GET /users/@me` (identidade) e `GET /users/@me/guilds` (lista de servidores + permissões) para montar a sessão.
- `User.accessToken`/`refreshToken` ficam salvos para permitir re-sincronizar a lista de guilds/permissões sem forçar novo login a cada sessão.

### 10.3 Modelo de dados (`schema.prisma`)

Entidades:

- **`User`** — identidade vinda do Discord OAuth2 (`discordId`, `username`, `globalName`, `avatarHash`, `email` opcional, tokens de OAuth2).
- **`Guild`** — servidor onde o bot está instalado. Guarda `ownerDiscordId` sempre (mesmo que o dono nunca tenha logado no dashboard) e, quando disponível, o vínculo com `User` via `ownerUserId`.
- **`GuildMember`** — cache de "quem tem acesso a qual guild e com que permissão". Guarda o bitfield de permissões do Discord e um campo `isAdmin` já calculado, para consultas rápidas sem reprocessar o bitfield toda hora. Sincronizado no login e via cron semanal no `billing-worker`.
- **`GuildSettings`** — configurações do servidor (locale, cor padrão de embed, canal de logs) separadas da tabela principal de `Guild`. Inclui um campo `data` em JSON livre para configs específicas de módulos (economia, RP, moderação) — validação a cargo de Zod na camada de API/bot.
- **`Plan`** — catálogo de planos disponíveis (nome, preço, intervalo, features, id do price no provedor de pagamento).
- **`Subscription`** — vinculada à `Guild`, não ao `User`. Registra `createdByUserId` (quem assinou/paga), status, período vigente e IDs do provedor de pagamento (`PaymentProvider`: Mercado Pago ou Stripe).
- **`AuditLog`** — genérico (`action` + `metadata` em JSON), registra quem fez o quê em cada guild.

## 11. Fluxo operacional de billing

O modelo de dados de assinaturas está detalhado na seção 10.3 (`Plan`, `Subscription`).

- `billing-worker` escuta webhooks do Mercado Pago (primário) e Stripe (secundário) e atualiza a tabela `subscriptions`.
- Middleware de comando (`isPremium` no `CommandModule` + `checkSubscription`) verifica a assinatura antes de executar comandos premium:
  - Resultado cacheado no Redis com TTL curto, para não bater no Postgres a cada interação.
- Cron job diário (BullMQ *repeatable job*) varre assinaturas vencidas e aplica downgrade/bloqueio automaticamente.
- Cron job semanal sincroniza `GuildMember` (permissões do Discord podem mudar sem aviso) via tipo de job `guild_sync` no `BillingJobData`.

## 12. Infraestrutura local (Docker Compose)

O `docker-compose.yml` contém:

- **postgres** (16-alpine) com healthcheck e volume persistente.
- **redis** (7-alpine, com append-only file) com healthcheck e volume persistente.
- **adminer** — UI web para inspecionar o Postgres (porta padrão 8081).
- **redis-commander** — UI web para inspecionar o Redis (porta padrão 8082).
- Serviços da aplicação (`gateway`, `bot-worker`, `api`, `billing-worker`) com Dockerfiles criados.

Copie `.env.example` para `.env` e preencha as variáveis antes de rodar `docker compose up`.

## 13. Próximos passos

- [x] Criar o schema do banco (Prisma) para `users`, `guilds`, `guild_members`, `guild_settings`, `plans`, `subscriptions`, `audit_logs`.
- [x] Implementar fluxo de login via Discord OAuth2 (troca de code por token, criação/atualização de `User`, sync inicial de `GuildMember`).
- [x] Implementar job de sincronização periódica de `GuildMember` — cron semanal no `billing-worker` + tipo `guild_sync` no `BillingJobData`.
- [x] Implementar `packages/discord-kit` (embed/container/responder builders).
- [x] Implementar router de `customId` para interações.
- [x] Criar Dockerfiles de cada app (`gateway`, `bot-worker`, `api`, `billing-worker`).
- [x] Definir provedor de pagamento — **Mercado Pago** como primário, Stripe como secundário. Ambos implementados no `billing-worker`.
- [x] Definir middleware de verificação de assinatura nos comandos premium — campo `isPremium` no `CommandModule` + `checkSubscription`.
- [x] Especificar contratos da REST API — documentação completa em `api-contracts.md`.
- [x] Trava de cancelamento — `POST /subscriptions/:guildId/cancel` só permite criador da assinatura ou dono do servidor; outros admins recebem `403`.
- [x] Implementar sistema de paginação (`packages/discord-kit/src/pagination`) — `Paginator`, `PaginationSessionExpiredError`, `PagerOptions`, `PaginationResult` exportados pelo discord-kit.
- [x] Implementar sistema de criação de comandos (`packages/discord-kit/src/commands`) — `defineCommand()`, `CommandRegistry` (singleton), `commandRegistry`. Suporte a slash, user e prefix commands. `deploy-commands.ts` usa `commandRegistry.getRegisterableCommands()` como source of truth único.