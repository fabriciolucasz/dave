import { EmbedBuilder, Colors, type ColorResolvable } from 'discord.js';

// ---------------------------------------------------------------------------
// embed.builder.ts — seção 6.1 do PLAN.md
//
// PADRÃO (seção 7.3): funções puras que retornam instância nova a cada chamada.
// Isso é intencional — embeds são stateful e muda a cada interação.
// Compartilhar uma instância entre chamadas concorrentes causaria vazamento
// de estado (bug clássico em sistemas concorrentes).
//
// Nunca exporte uma instância global de EmbedBuilder.
// ---------------------------------------------------------------------------

/** Opções de branding por servidor, vindas do GuildSettings. */
export interface GuildBranding {
  /** Cor hex do servidor, ex: "#5865F2". Se ausente, usa a cor padrão do tipo. */
  embedColor?: string | null;
  /** Nome do servidor para o footer. */
  guildName?: string | null;
  /** URL do ícone do servidor para o footer. */
  guildIconUrl?: string | null;
}

/**
 * Aplica o branding do servidor a um EmbedBuilder existente.
 * Chame depois de criar o embed base para sobrescrever cor e footer.
 *
 * @example
 * const embed = withGuildBranding(successEmbed('Feito!'), guildSettings);
 */
export function withGuildBranding(embed: EmbedBuilder, branding: GuildBranding): EmbedBuilder {
  if (branding.embedColor) {
    embed.setColor(branding.embedColor as ColorResolvable);
  }

  if (branding.guildName) {
    embed.setFooter(
      branding.guildIconUrl
        ? { text: branding.guildName, iconURL: branding.guildIconUrl }
        : { text: branding.guildName },
    );
  }

  return embed;
}

/**
 * Embed de sucesso (verde).
 *
 * @example
 * const embed = successEmbed('Usuário banido', `**${user.tag}** foi banido com sucesso.`);
 */
export function successEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle(title)
    .setDescription(description ?? null);
}

/**
 * Embed de erro (vermelho).
 *
 * @example
 * const embed = errorEmbed('Sem permissão', 'Você não tem permissão para executar este comando.');
 */
export function errorEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle(`❌ ${title}`)
    .setDescription(description ?? null);
}

/**
 * Embed de aviso (amarelo).
 *
 * @example
 * const embed = warningEmbed('Atenção', 'Sua assinatura expira em 3 dias.');
 */
export function warningEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Yellow)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description ?? null);
}

/**
 * Embed informativo (azul).
 *
 * @example
 * const embed = infoEmbed('Status do bot', 'Tudo operando normalmente.');
 */
export function infoEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description ?? null);
}

/**
 * Embed de carregamento/processando (cinza).
 * Útil para deferReply enquanto processa algo pesado.
 */
export function loadingEmbed(title = 'Processando...', description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Greyple)
    .setTitle(`⏳ ${title}`)
    .setDescription(description ?? null);
}
