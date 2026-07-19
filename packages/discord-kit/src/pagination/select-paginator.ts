// packages/discord-kit/src/pagination/select-paginator.ts
//
// SelectPaginator — variante do Paginator (seção 9.1) para seleção via StringSelectMenu.
// Seção 9.4 do PLAN.md.
//
// Regras:
//   - Se items.length <= 25: select renderizado direto, sem botões de navegação.
//   - Se items.length > 25: recorta a página atual e adiciona linha de navegação.
//   - max_values recalculado por página para não exceder o tamanho real da página.
//   - Stateless: a função recebe os items já carregados e o pageIndex.
//     O container ao redor é responsabilidade de quem chama.
//   - customId dos botões: `${namespace}:page:${pageIndex}:${queryKey}` — mesmo padrão do Paginator.

import {
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';

export const SELECT_PAGE_SIZE = 25; // limite físico do Discord

export interface SelectItemOption {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
}

export interface SelectPaginatorOptions<TItem> {
  /** Namespace único — usado como prefixo no customId dos botões de navegação. */
  namespace: string;
  /** Itens já carregados — a função faz o recorte internamente. */
  items: TItem[];
  /** Transforma um item no formato de opção do select. */
  mapToOption: (item: TItem) => SelectItemOption;
  /** Placeholder exibido quando nada está selecionado. */
  placeholder?: string;
  /** Mínimo de valores selecionáveis. Padrão: 1. */
  minValues?: number;
  /**
   * Máximo de valores selecionáveis por página.
   * Se omitido, usa a quantidade de itens reais na página (max_values = tamanho da página).
   * Nunca ultrapassa o número de itens reais da página.
   */
  maxValues?: number;
  /**
   * Chave de query serializada — incluída nos customIds dos botões de navegação
   * para permitir que o handler recupere o contexto ao trocar de página.
   * Se omitida, usa string vazia.
   */
  queryKey?: string;
}

export interface SelectPaginatorResult {
  select: StringSelectMenuBuilder;
  /** Linha de botões de navegação — apenas presente se houver mais de 25 itens. */
  navigationRow?: ActionRowBuilder<ButtonBuilder>;
  totalPages: number;
  currentPage: number;
  totalItems: number;
}

/**
 * Cria um select menu paginado (seção 9.4 do PLAN.md).
 *
 * @param opts - Opções de configuração do paginator.
 * @param pageIndex - Índice da página atual (base 0). Sofre clamp defensivo.
 *
 * @example
 * const { select, navigationRow } = createSelectPaginator(
 *   { namespace: 'illegal-action:city', items: cities, mapToOption: c => ({ label: c.name, value: c.id }) },
 *   0
 * );
 * // se navigationRow existir, adicionar abaixo do select no container
 */
export function createSelectPaginator<TItem>(
  opts: SelectPaginatorOptions<TItem>,
  pageIndex: number,
): SelectPaginatorResult {
  const { namespace, items, mapToOption, placeholder, minValues = 1, queryKey = '' } = opts;

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / SELECT_PAGE_SIZE));

  // Clamp defensivo — protege contra pageIndex inválido vindo do customId
  const clampedPage = Math.max(0, Math.min(pageIndex, totalPages - 1));

  // Recorte da página atual
  const start = clampedPage * SELECT_PAGE_SIZE;
  const pageItems = items.slice(start, start + SELECT_PAGE_SIZE);

  // max_values nunca excede a quantidade real de itens na página
  const maxValues = Math.min(opts.maxValues ?? pageItems.length, pageItems.length);

  // Monta as opções do select
  const options = pageItems.map((item) => {
    const opt = mapToOption(item);
    const builder = new StringSelectMenuOptionBuilder()
      .setLabel(opt.label.slice(0, 100)) // limite do Discord: 100 chars
      .setValue(opt.value);
    if (opt.description) builder.setDescription(opt.description.slice(0, 100));
    if (opt.emoji) builder.setEmoji(opt.emoji);
    return builder;
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${namespace}:select`)
    .setPlaceholder(placeholder ?? 'Selecione uma opção...')
    .setMinValues(minValues)
    .setMaxValues(maxValues)
    .addOptions(options);

  // Se não há mais de 25 itens, retorna sem botões de navegação
  if (totalItems <= SELECT_PAGE_SIZE) {
    return {
      select,
      totalPages: 1,
      currentPage: 0,
      totalItems,
    };
  }

  // Cria linha de navegação com 5 botões: |< < [info] > >|
  const isFirst = clampedPage === 0;
  const isLast = clampedPage === totalPages - 1;

  const btnFirst = new ButtonBuilder()
    .setCustomId(`${namespace}:page:0:${queryKey}`)
    .setLabel('«')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isFirst);

  const btnPrev = new ButtonBuilder()
    .setCustomId(`${namespace}:page:${clampedPage - 1}:${queryKey}`)
    .setLabel('‹')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isFirst);

  // Botão de info — mostra a página atual, sempre desabilitado (não executa ação)
  const btnInfo = new ButtonBuilder()
    .setCustomId(`${namespace}:info:${clampedPage}:${queryKey}`)
    .setLabel(`Página ${clampedPage + 1} de ${totalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const btnNext = new ButtonBuilder()
    .setCustomId(`${namespace}:page:${clampedPage + 1}:${queryKey}`)
    .setLabel('›')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isLast);

  const btnLast = new ButtonBuilder()
    .setCustomId(`${namespace}:page:${totalPages - 1}:${queryKey}`)
    .setLabel('»')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isLast);

  const navigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btnFirst,
    btnPrev,
    btnInfo,
    btnNext,
    btnLast,
  );

  return {
    select,
    navigationRow,
    totalPages,
    currentPage: clampedPage,
    totalItems,
  };
}
