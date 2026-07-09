import { ButtonBuilder, ButtonStyle, type InteractionReplyOptions } from 'discord.js';
import type { PagerOptions, PaginationResult } from './types.js';

export class PaginationSessionExpiredError extends Error {
  constructor() {
    super('PAGINATION_SESSION_EXPIRED');
    this.name = 'PaginationSessionExpiredError';
  }
}

export class Paginator<TQuery, TItem> {
  private readonly pageSize: number;

  constructor(private readonly options: PagerOptions<TQuery, TItem>) {
    this.pageSize = options.pageSize ?? 10;
  }

  /**
   * Constrói o estado visual e os botões de controle para uma página específica.
   */
  async getPage(query: TQuery, pageIndex: number): Promise<PaginationResult> {
    const { items, totalItems } = await this.options.fetchPage(query, pageIndex, this.pageSize);
    const totalPages = Math.max(1, Math.ceil(totalItems / this.pageSize));

    // Clamp defensivo: garante que o index não estoure limites se a lista encolheu
    const clampedPageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));

    // Busca novamente caso tenha sofrido clamp para garantir consistência
    let finalItems = items;
    if (clampedPageIndex !== pageIndex) {
      const refetched = await this.options.fetchPage(query, clampedPageIndex, this.pageSize);
      finalItems = refetched.items;
    }

    const view = this.options.render(finalItems, clampedPageIndex, totalPages);

    // Determina a queryKey que será passada nos customIds dos botões
    let queryKey: string;
    if (this.options.serializeQuery) {
      queryKey = await this.options.serializeQuery(query);
    } else {
      // Inline serialization default (JSON minificado e codificado em base64/URI)
      const serialized = JSON.stringify(query);
      queryKey = Buffer.from(serialized).toString('base64url');
    }

    const namespace = this.options.namespace;
    const isFirst = clampedPageIndex === 0;
    const isLast = clampedPageIndex === totalPages - 1;

    // Botões com customId codificado no padrão do componentRouter: namespace:action:payload
    // payload = [clampedPageIndex, queryKey]
    const btnFirst = new ButtonBuilder()
      .setCustomId(`${namespace}:page:0:${queryKey}`)
      .setLabel('«')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isFirst);

    const btnPrev = new ButtonBuilder()
      .setCustomId(`${namespace}:page:${clampedPageIndex - 1}:${queryKey}`)
      .setLabel('‹')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isFirst);

    const btnNext = new ButtonBuilder()
      .setCustomId(`${namespace}:page:${clampedPageIndex + 1}:${queryKey}`)
      .setLabel('›')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isLast);

    const btnLast = new ButtonBuilder()
      .setCustomId(`${namespace}:page:${totalPages - 1}:${queryKey}`)
      .setLabel('»')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isLast);

    return {
      view,
      buttons: [btnFirst, btnPrev, btnNext, btnLast],
    };
  }

  /**
   * Deserializa a query vinda do customId, tratando expiração do Redis se aplicável.
   */
  async resolveQuery(queryKey: string): Promise<TQuery> {
    if (this.options.deserializeQuery) {
      try {
        const query = await this.options.deserializeQuery(queryKey);
        if (!query) {
          throw new PaginationSessionExpiredError();
        }
        return query;
      } catch (err) {
        if (err instanceof PaginationSessionExpiredError) throw err;
        throw new PaginationSessionExpiredError();
      }
    }

    try {
      const decoded = Buffer.from(queryKey, 'base64url').toString('utf8');
      return JSON.parse(decoded) as TQuery;
    } catch {
      throw new Error('Falha ao decodificar a query inline.');
    }
  }
}
