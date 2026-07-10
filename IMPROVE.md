# Prompt de implementação — Melhorias de UI do Dashboard (Dave)

> Use este documento como instrução para o agente/desenvolvedor que for implementar. Contexto completo do projeto está em `PLAN.md` (seções 16, 17 e 18) — leia antes de começar.

## Contexto

O dashboard (`apps/dashboard`, Next.js App Router) já está implementado com as telas descritas na seção 16 do `PLAN.md`. Esta tarefa cobre três frentes de melhoria, independentes entre si mas relacionadas pela mesma tela (`/dashboard/[guildId]/containers`):

1. Padronizar o uso de componentes (shadcn/ui) e substituir emojis por ícones.
2. Renomear a aba "Containers" para um nome que o gestor de RP reconheça, e implementar a configuração por tipo dentro dela.
3. Mover o catálogo de planos de assinatura para o banco de dados (não hardcoded), refletindo isso na tela de assinatura.

---

## Tarefa 1 — Auditoria de shadcn/ui e substituição de emojis por ícones

### 1.1 Verificação do shadcn/ui

- Confirmar que `components.json` existe na raiz do `apps/dashboard` e que os componentes usados (`Button`, `Card`, `Dialog`, `Select`, `Table`, `Badge`, `Tooltip`, `Skeleton`, etc.) vêm de `@/components/ui/*` gerados pelo CLI do shadcn (`npx shadcn add <componente>`), não componentes HTML nativos estilizados manualmente ou de outra lib misturada.
- Onde encontrar inconsistência (ex: um `<button>` cru com Tailwind em vez de `<Button>`, ou um modal feito na mão em vez de `<Dialog>`), substituir pelo componente shadcn equivalente.
- Rodar `npx shadcn diff` (ou equivalente) para checar se os componentes já instalados estão desatualizados em relação ao registry oficial, e atualizar se houver mudanças relevantes de acessibilidade/estilo.
- Garantir que o tema (`tailwind.config`, variáveis CSS de cor) está centralizado nos tokens do shadcn — nenhuma cor hardcoded (`#5865F2`, `bg-blue-500`) fora dos tokens, exceto onde a cor vem de dado dinâmico (ex: `accentColor` de um container, seção 18).

### 1.2 Emojis → ícones

- Buscar por emojis no código do dashboard (grep por caracteres fora do plano ASCII em strings JSX/TSX) — comum aparecerem em badges de status ("✅ Ativo", "⚠️ Vencido"), botões, e mensagens de estado vazio.
- Substituir todos por ícones de `lucide-react` (já é a lib de ícones padrão usada pelo shadcn/ui, então não introduz nova dependência):
  - Status ativo → `<CircleCheck />` (cor `text-green-600` ou token semântico equivalente)
  - Status vencido/erro → `<CircleAlert />` ou `<TriangleAlert />`
  - Ação de editar → `<Pencil />`
  - Ação de excluir/desativar → `<Trash2 />` ou `<Power />` (para "desativar", não "excluir" — ver Tarefa 2)
  - Servidor/guild → `<Server />` ou usar o ícone real do servidor (`iconHash`, seção 10.3) quando disponível, ícone só como fallback
  - Assinatura/plano → `<CreditCard />` ou `<Sparkles />` para destacar plano Pro
  - Vazio/nenhum item → `<Inbox />` ou `<PackageOpen />`
- Ícones sempre com `aria-hidden="true"` quando acompanhados de texto, ou `aria-label` quando são o único conteúdo do botão (ex: botão de ícone puro numa tabela).
- Tamanho padrão: `16px` (`size-4` no Tailwind) inline com texto, `20px` (`size-5`) em botões de destaque isolados.

**Critério de aceite desta tarefa**: nenhum emoji renderizado em nenhuma tela do dashboard; todo componente interativo (botão, modal, select, tabela, badge, tooltip, skeleton) vem de `@/components/ui/*`.

---

## Tarefa 2 — Renomear "Containers" e implementar a configuração por tipo

### 2.1 Novo nome

"Container" é nome técnico interno (schema, seção 13/18) — não deve vazar para a UI. Renomear a aba/rota para **"Painéis"** (rota: `/dashboard/[guildId]/paineis`), porque:
- É o termo que descreve o que o gestor de RP realmente está configurando (o painel de boas-vindas, o painel de ticket, etc.), sem jargão técnico.
- Mantém consistência com o wording que já aparece nos próprios `type` do container (`ticket_panel`, `rules_panel`, `verification_panel` — todos literalmente "painel de algo").

Manter `container`/`Container` como nome interno em código/schema (não precisa migration de nome de tabela) — só a camada de apresentação muda.

### 2.2 Estrutura da tela `/dashboard/[guildId]/paineis`

Hoje a tela só lista containers existentes com opção de desativar (v1, seção 16.2). Expandir para:

1. **Lista de painéis configuráveis por tipo**, não só os já ativos — mostrar os 5 tipos da seção 18.2 (`welcome`, `ticket_panel`, `rules_panel`, `verification_panel`, `announcement`) como cards, cada um com:
   - Nome amigável do tipo (ex: "Boas-vindas", "Abertura de ticket", "Regras do servidor", "Verificação", "Anúncio")
   - Ícone representativo (`lucide-react`: `Hand` para boas-vindas, `Ticket` para ticket, `ScrollText` para regras, `ShieldCheck` para verificação, `Megaphone` para anúncio)
   - Status: "Configurado e ativo" / "Configurado, inativo" / "Não configurado" (badge com ícone da Tarefa 1.2)
   - Botão "Configurar" (se não configurado) ou "Editar" (se já configurado)

2. **Formulário de configuração por tipo** (modal ou rota dedicada `/dashboard/[guildId]/paineis/[type]`) — campos vêm direto da `ContainerIdentity` + campos próprios do `type` (ver `packages/discord-kit/src/containers/types.ts`, seção 18.1):
   - Campos comuns: `title`, `description` (textarea com preview do markdown do Discord ao lado), `accentColor` (color picker), `bannerUrl` (upload ou URL)
   - `customWebhook` (nome + avatar) — **só habilitado se o plano do servidor permitir** (`Plan.features.customWebhookEnabled`, seção 17.5); se não permitir, mostrar o campo desabilitado com um badge "Recurso Pro" e CTA para a tela de assinatura, em vez de simplesmente esconder o campo (esconder perde a oportunidade de venda)
   - Campos específicos do tipo (ex: `buttonLabel` para `ticket_panel`/`verification_panel`, `showMemberCount` para `welcome`, `mentionRoleId` para `announcement`)
   - **Preview em tempo real** do container renderizado ao lado do formulário (reaproveitar o mesmo `container.builder.ts` do backend via um endpoint de preview, para garantir que o preview bate exatamente com o que vai aparecer no Discord)

3. **Canal de destino**: select de canal (mesmo componente usado em `/settings`, seção 16.2), obrigatório para tipos "sticky" (`ticket_panel`, `rules_panel`, `verification_panel`), opcional/"canal do momento" para `announcement`.

### 2.3 Plano de implementação (ordem sugerida)

1. Renomear rota e labels de navegação (`Containers` → `Painéis`) — mudança de baixo risco, fazer primeiro.
2. Endpoint `GET /guilds/:guildId/containers/types` — retorna os 5 tipos disponíveis com metadata de exibição (nome amigável, ícone, se é sticky), consumindo a mesma lista de `ContainerPayload` do discord-kit para não duplicar a definição dos tipos.
3. Tela de listagem por tipo (item 1 acima) — consome esse endpoint + `GET /guilds/:guildId/containers` (já existente) para cruzar status.
4. Formulário de configuração genérico que se adapta ao `type` selecionado (item 2) — construir um único componente `PanelConfigForm` que recebe o `type` e renderiza os campos comuns + os campos específicos daquele tipo via um mapa de schemas (Zod, reaproveitando a validação que já existe no backend).
5. Endpoint de preview (`POST /guilds/:guildId/containers/preview`) — recebe o payload em edição, retorna o container renderizado (reaproveita `container.builder.ts`).
6. Integrar preview em tempo real no formulário.
7. Gate do campo `customWebhook` por plano (item 2, `Plan.features`).

---

## Tarefa 3 — Planos de assinatura: banco de dados, não JSON hardcoded

### 3.1 Decisão

Usar a tabela `Plan` **que já existe no schema** (seção 10.3) — não hardcodar em JSON. Motivos:
- O schema já foi desenhado para isso (`code`, `name`, `priceCents`, `interval`, `features` em JSON, `stripePriceId`).
- Promoções e mudanças de preço não devem exigir deploy de código — só um `UPDATE` na tabela (ou uma tela administrativa futura).
- `Subscription.planId` já referencia `Plan` via FK — hardcoded quebraria essa relação ou exigiria duplicar os dados em dois lugares.

### 3.2 Passos

1. **Seed inicial** dos 3 planos definidos na seção 17.2 (Free, Pro, Business) via script de seed do Prisma (`prisma/seed.ts`), rodado uma vez em cada ambiente — não hardcoded no código da aplicação, mas também não editado manualmente via SQL solto (mantém rastreável em versionamento).
2. Campo `Plan.features` (JSON) recebe o formato:
   ```json
   {
     "maxActiveContainers": 1,
     "customWebhookEnabled": false,
     "queuePriority": false,
     "maxBillingAdmins": 1
   }
   ```
   Cada limite lido pelo `checkSubscription` (seção 11) e pela UI (Tarefa 2.2) a partir daqui — nunca hardcoded em `if`s espalhados pelo código.
3. Endpoint `GET /plans` (público, sem autenticação) — lista os planos ativos (`isActive: true`) para renderizar a tela de assinatura.
4. Tela `/dashboard/[guildId]/subscription` (seção 16.2) passa a buscar os planos desse endpoint em vez de qualquer lista fixa no frontend — cards de plano gerados dinamicamente a partir da resposta, então adicionar/remover/reprecificar um plano no banco reflete automaticamente na UI sem deploy do dashboard.
5. Badge de "Recurso Pro" (Tarefa 2.2) e qualquer outro gate de feature no frontend consultam `Plan.features` do plano atual da guild (retornado por `GET /subscriptions/:guildId`), não uma constante local.

**Critério de aceite desta tarefa**: remover qualquer array/objeto de planos hardcoded no código do dashboard; a tela de assinatura funciona inteiramente a partir de `GET /plans` + `GET /subscriptions/:guildId`.