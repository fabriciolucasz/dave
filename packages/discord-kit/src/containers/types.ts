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
  | 'announcement';

/** Interface base com os campos de identidade visual comuns a todos os containers */
export interface BaseContainerPayload {
  title?: string;
  description?: string;
  accentColor?: string; // Cor em formato Hex (ex: #5865f2)
  bannerUrl?: string; // Imagem do banner/media gallery
  renderMode?: 'embed' | 'container'; // Modo de renderização (Seção 19)
  
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

/** União discriminada para payloads de qualquer tipo de container */
export type ContainerPayload =
  | WelcomeContainerPayload
  | TicketPanelContainerPayload
  | RulesPanelContainerPayload
  | VerificationPanelContainerPayload
  | AnnouncementContainerPayload;
