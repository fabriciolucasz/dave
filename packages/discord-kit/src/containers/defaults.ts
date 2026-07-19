// packages/discord-kit/src/containers/defaults.ts
//
// Default container payloads for each ContainerType, with sensible defaults in Portuguese (pt-BR).
// These are used as fallbacks in the dashboard and can serve as starting points for new panels.
//
// Each entry contains title, description, accentColor, and type-specific fields (buttonLabel, etc).
// Note: Do NOT include `blocks` — they will auto-migrate from `description` in PanelConfigForm.tsx.

import type { ContainerType, ContainerPayload } from './types.js';

export const DEFAULT_CONTAINER_PAYLOADS: Record<ContainerType, Partial<ContainerPayload>> = {
  welcome: {
    type: 'welcome',
    title: 'Bem-vindo(a) ao ${serverName}!',
    description: 'Olá, ${welcomeUser}! Que bom ter você por aqui. Você é o nosso membro número **${memberCount}** — dê uma olhada nos canais de regras e cadastro para começar.',
    accentColor: '#57F287',
    showMemberCount: true,
  },

  ticket_panel: {
    type: 'ticket_panel',
    title: 'Central de Suporte — ${serverName}',
    description: 'Precisa de ajuda ou quer reportar um problema? Clique no botão abaixo para abrir um ticket privado com a nossa equipe.',
    accentColor: '#5865F2',
    buttonLabel: 'Criar Ticket',
  },

  rules_panel: {
    type: 'rules_panel',
    title: 'Regras do Servidor',
    description: 'Respeite todos os membros. Sem spam ou flood em canais. Conteúdo deve ser adequado para cada canal. Siga as diretrizes de RP do ${serverName}. Decisão final é sempre da staff.',
    accentColor: '#ED4245',
  },

  verification_panel: {
    type: 'verification_panel',
    title: 'Verificação de Acesso',
    description: 'Para liberar o acesso completo ao ${serverName}, clique no botão abaixo e confirme que leu as regras da comunidade.',
    accentColor: '#248046',
    buttonLabel: 'Verificar-se',
  },

  announcement: {
    type: 'announcement',
    title: '📢 Anúncio Oficial',
    description: 'Fique atento às novidades do ${serverName}! Espaço reservado para comunicados da equipe (${authorName}).',
    accentColor: '#FEE75C',
  },

  inventory_panel: {
    type: 'inventory_panel',
    title: 'Baú da Guilda',
    description: 'Consulte os itens disponíveis no inventário compartilhado do ${serverName} e registre entradas/saídas com o botão abaixo.',
    accentColor: '#4F545C',
    buttonLabel: 'Ver Baú',
  },

  illegal_action_panel: {
    type: 'illegal_action_panel',
    title: 'Registro de Ações Ilegais',
    description: 'Utilize este painel para registrar uma ação ilegal de RP no ${serverName}: cidade, tipo de ação, participantes e resultado.',
    accentColor: '#DA373C',
    buttonLabel: 'Registrar Ação',
  },

  ranking_panel: {
    type: 'ranking_panel',
    title: 'Ranking Semanal de Ações',
    description: '', // Always overridden by injectRankingContent in the repost job
    accentColor: '#FAA61A',
    topN: 10,
  },

  weekly_goal_panel: {
    type: 'weekly_goal_panel',
    title: 'Metas Semanais',
    description: 'Registre a entrega da sua meta semanal no ${serverName} clicando no botão abaixo.',
    accentColor: '#248046',
    buttonLabel: 'Registrar Meta',
  },

  registration_panel: {
    type: 'registration_panel',
    title: 'Cadastro de Personagem',
    description: 'Realize o cadastro do seu personagem no ${serverName} clicando no botão abaixo. Seu cadastro será revisado por ${authorName}.',
    accentColor: '#5865F2',
    buttonLabel: 'Cadastrar Personagem',
    footerSignature: 'Sistema de Cadastro • Staff',
  },
};
