// packages/discord-kit/src/containers/types.ts
//
// Definições de tipos e payloads para containers persistentes (Seção 18 do PLAN.md).
//
// O payload de um container armazena apenas propriedades de identidade visual
// e dados estruturais necessários para renderizar o container no Discord.

export type ContainerType =
  | 'welcome'
  | 'ticket_panel'
  | 'rules_panel'
  | 'verification_panel'
  | 'announcement'
  // Painéis de feature — seção 26 do PLAN.md
  | 'inventory_panel'      // Baú (seção 26.1)
  | 'illegal_action_panel' // Ações Ilegais (seção 26.2)
  | 'ranking_panel'        // Ranking (seção 26.3)
  | 'weekly_goal_panel'    // Metas Semanais (seção 26.4)
  | 'registration_panel';  // Cadastro de Personagem (seção 26.5)

import type { ContainerBlock } from './blocks.js';

/** Interface base com os campos de identidade visual comuns a todos os containers */
export interface BaseContainerPayload {
  title?: string;
  description?: string;
  accentColor?: string; // Cor em formato Hex (ex: #5865f2)
  bannerUrl?: string; // Imagem do banner/media gallery (para legado / fallback)
  renderMode?: 'embed' | 'container'; // Modo de renderização (Seção 19)

  // Modo Embed Espelhado (Seção 20.1)
  url?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  authorName?: string;
  authorIconUrl?: string;
  footerText?: string;
  footerIconUrl?: string;
  showTimestamp?: boolean;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;

  // Modo Container Blocos (Seção 20.2)
  blocks?: ContainerBlock[];
  
  // Customização de Webhook (Pro/Business)
  customWebhook?: {
    name?: string;
    avatarUrl?: string;
  };
}

/** Container de Boas-vindas */
export interface WelcomeContainerPayload extends BaseContainerPayload {
  type: 'welcome';
  showMemberCount?: boolean;
}

/** Painel de Ticket / Suporte */
export interface TicketPanelContainerPayload extends BaseContainerPayload {
  type: 'ticket_panel';
  buttonLabel?: string; // Texto do botão para abrir ticket (ex: "Criar Ticket")
}

/** Painel de Regras do Servidor */
export interface RulesPanelContainerPayload extends BaseContainerPayload {
  type: 'rules_panel';
}

/** Painel de Verificação */
export interface VerificationPanelContainerPayload extends BaseContainerPayload {
  type: 'verification_panel';
  buttonLabel?: string; // Texto do botão de verificação (ex: "Verificar-se")
}

/** Container de Anúncios */
export interface AnnouncementContainerPayload extends BaseContainerPayload {
  type: 'announcement';
  mentionRoleId?: string; // ID da Role do Discord a ser mencionada no anúncio
}

// ---------------------------------------------------------------------------
// Novos painéis de feature — seção 26 do PLAN.md
// ---------------------------------------------------------------------------

/** Painel do Baú (inventário compartilhado — seção 26.1) */
export interface InventoryPanelPayload extends BaseContainerPayload {
  type: 'inventory_panel';
  buttonLabel?: string; // Texto do botão principal (ex: "Ver Itens")
}

/** Painel de Ações Ilegais (fluxo multi-etapa — seção 26.2) */
export interface IllegalActionPanelPayload extends BaseContainerPayload {
  type: 'illegal_action_panel';
  buttonLabel?: string; // Texto do botão principal (ex: "Registrar Ação")
}

/** Painel de Ranking semanal (seção 26.3) */
export interface RankingPanelPayload extends BaseContainerPayload {
  type: 'ranking_panel';
  /** Número de posições exibidas. Padrão: 10. */
  topN?: number;
}

/** Painel de Metas Semanais (seção 26.4) */
export interface WeeklyGoalPanelPayload extends BaseContainerPayload {
  type: 'weekly_goal_panel';
  buttonLabel?: string; // Texto do botão principal (ex: "Registrar Meta")
}

/** Painel de Cadastro de Personagem (seção 26.5) */
export interface RegistrationPanelPayload extends BaseContainerPayload {
  type: 'registration_panel';
  buttonLabel?: string; // Texto do botão principal (ex: "Realizar Cadastro")
  footerSignature?: string; // Assinatura curta do rodapé (ex: "Sistema de Cadastro • Staff")
}

/** União discriminada para payloads de qualquer tipo de container */
export type ContainerPayload =
  | WelcomeContainerPayload
  | TicketPanelContainerPayload
  | RulesPanelContainerPayload
  | VerificationPanelContainerPayload
  | AnnouncementContainerPayload
  | InventoryPanelPayload
  | IllegalActionPanelPayload
  | RankingPanelPayload
  | WeeklyGoalPanelPayload
  | RegistrationPanelPayload;
