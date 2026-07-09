import type { EmbedBuilder, ButtonBuilder } from 'discord.js';
import type { ContainerBuilder } from '../container.builder.js';

export interface PagerOptions<TQuery, TItem> {
  /** Namespace único da paginação para roteamento no componentRouter (ex: "audit-logs"). */
  namespace: string;
  /** Função para buscar apenas os itens da página atual (via LIMIT/OFFSET). */
  fetchPage: (query: TQuery, pageIndex: number, pageSize: number) => Promise<{ items: TItem[]; totalItems: number }>;
  /** Função de renderização para transformar a lista de itens da página atual em um Embed ou Container. */
  render: (items: TItem[], pageIndex: number, totalPages: number) => EmbedBuilder | ContainerBuilder;
  /** Quantidade de itens por página. Padrão: 10. */
  pageSize?: number;
  /**
   * Função customizada para persistir queries longas em cache (ex: Redis).
   * Se omitida, a query viaja serializada diretamente no customId.
   */
  serializeQuery?: (query: TQuery) => Promise<string>;
  /** Função para recuperar a query persistida no cache. */
  deserializeQuery?: (key: string) => Promise<TQuery>;
}

export interface PaginationResult {
  /** O embed ou container correspondente à página atual. */
  view: EmbedBuilder | ContainerBuilder;
  /** Os botões padrão de paginação (primeira, anterior, próxima, última). */
  buttons: ButtonBuilder[];
}
