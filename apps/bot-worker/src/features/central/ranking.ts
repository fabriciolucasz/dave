// apps/bot-worker/src/features/central/ranking.ts
//
// Função de ranking semanal — seção 23.4 e 26.3 do PLAN.md.
//
// Agrega IllegalActionParticipant por discordUserId, soma shareAmount,
// filtra pela semana atual (normalizada a partir de segunda-feira).
// Resultado cacheado no Redis com TTL de 5 minutos.

import { prisma } from '@dave/database';
import { redis } from '@dave/queue';

const RANKING_CACHE_TTL_SECONDS = 5 * 60; // 5 minutos

export interface RankingEntry {
  discordUserId: string;
  totalAmount: number;
  actionCount: number;
  position: number;
}

/**
 * Calcula a data de segunda-feira da semana atual (normalização de weekStartDate).
 * Mesma lógica usada em WeeklyGoalSubmission para consistência.
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
  const diff = day === 0 ? -6 : 1 - day; // segunda-feira como início da semana
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calcula a data de domingo (fim da semana atual) para exibição no rodapé.
 */
export function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Retorna os dias restantes até o fim da semana.
 */
export function getDaysUntilWeekEnd(weekStart: Date): number {
  const now = new Date();
  const end = getWeekEnd(weekStart);
  const diffMs = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Busca e retorna o ranking semanal da guild.
 * Resultado cacheado no Redis por {@link RANKING_CACHE_TTL_SECONDS} segundos.
 *
 * @param guildId - ID interno da guild (não discordId).
 * @param topN - Máximo de posições a retornar. Padrão: 10.
 */
export async function getRankingData(guildId: string, topN: number = 10): Promise<RankingEntry[]> {
  const cacheKey = `ranking:${guildId}:${topN}`;

  // Tenta cache primeiro
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as RankingEntry[];
  }

  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd(weekStart);

  // Agrega participações da semana atual com ações WON
  const participants = await prisma.illegalActionParticipant.findMany({
    where: {
      action: {
        guildId,
        outcome: 'WON',
        createdAt: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    },
    select: {
      discordUserId: true,
      shareAmount: true,
      action: {
        select: {
          amount: true,
          participants: { select: { id: true } },
        },
      },
    },
  });

  // Agrega por usuário
  const userTotals = new Map<string, { totalAmount: number; actionCount: number }>();

  for (const participant of participants) {
    const existing = userTotals.get(participant.discordUserId) ?? { totalAmount: 0, actionCount: 0 };

    // shareAmount pode ser null — calcula divisão igualitária como fallback
    const share = participant.shareAmount !== null
      ? participant.shareAmount
      : Math.floor(participant.action.amount / participant.action.participants.length);

    userTotals.set(participant.discordUserId, {
      totalAmount: existing.totalAmount + share,
      actionCount: existing.actionCount + 1,
    });
  }

  // Ordena por valor total decrescente e limita a topN
  const ranking: RankingEntry[] = [...userTotals.entries()]
    .sort(([, a], [, b]) => b.totalAmount - a.totalAmount)
    .slice(0, topN)
    .map(([discordUserId, data], index) => ({
      discordUserId,
      totalAmount: data.totalAmount,
      actionCount: data.actionCount,
      position: index + 1,
    }));

  // Armazena no cache
  await redis.setex(cacheKey, RANKING_CACHE_TTL_SECONDS, JSON.stringify(ranking));

  return ranking;
}

/**
 * Invalida o cache de ranking de uma guild.
 * Chamado sempre que uma nova ação é registrada.
 */
export async function invalidateRankingCache(guildId: string): Promise<void> {
  try {
    const keys = await redis.keys(`ranking:${guildId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('[Ranking] Falha ao invalidar cache:', err);
  }
}

/**
 * Formata o ranking como texto para exibição no container do Discord.
 * Retorna null se não houver dados (estado vazio — seção 26.3).
 */
export function formatRankingText(ranking: RankingEntry[]): string | null {
  if (ranking.length === 0) {
    return null; // Chamador deve tratar o estado vazio com mensagem própria
  }

  const medals = ['🥇', '🥈', '🥉'];

  return ranking.map((entry) => {
    const medal = medals[entry.position - 1] ?? `**#${entry.position}**`;
    const amount = entry.totalAmount.toLocaleString('pt-BR');
    return `${medal} <@${entry.discordUserId}> — R$ ${amount} (${entry.actionCount} ação${entry.actionCount !== 1 ? 'ões' : ''})`;
  }).join('\n');
}
