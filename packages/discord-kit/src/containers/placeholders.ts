// packages/discord-kit/src/containers/placeholders.ts
import type { ContainerType } from './types.js';

/**
 * Retorna a lista de placeholders suportados pelo tipo de painel correspondente.
 */
export function getAvailablePlaceholders(type: ContainerType): string[] {
  switch (type) {
    case 'welcome':
      return ['welcomeUser', 'serverName', 'memberCount'];
    case 'ticket_panel':
    case 'rules_panel':
    case 'verification_panel':
      return ['serverName'];
    case 'announcement':
      return ['serverName', 'authorName'];
    default:
      return [];
  }
}

/**
 * Substitui placeholders formatados como ${nomeDaVariavel} pelo valor mapeado no contexto.
 */
export function resolvePlaceholders(text: string, context: Record<string, string>): string {
  if (!text) return text;
  let resolved = text;
  for (const [key, value] of Object.entries(context)) {
    // Substitui todas as ocorrências de ${key} por value
    resolved = resolved.split(`\${${key}}`).join(value);
  }
  return resolved;
}
