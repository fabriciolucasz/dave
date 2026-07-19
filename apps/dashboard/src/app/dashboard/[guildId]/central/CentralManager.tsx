// apps/dashboard/src/app/dashboard/[guildId]/central/CentralManager.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Swords, Plus, Calendar, Settings, Save, AlertCircle, TrendingUp, Trophy } from 'lucide-react';
import { saveLogConfig, createIllegalAction, createWeeklyGoal, getRanking } from './actions';

interface IllegalAction {
  id: string;
  outcome: string;
  amount: number;
  registeredByUserId: string;
  createdAt: string;
  participants?: Array<{ discordUserId: string }>;
}

interface WeeklyGoalSubmission {
  id: string;
  discordUserId: string;
  amountDelivered: number;
  weekStartDate: string;
  registeredByUserId: string;
  createdAt: string;
}

interface RankingEntry {
  discordUserId: string;
  totalAmount: number;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface LogConfig {
  feature: string;
  channelId: string;
}

interface Props {
  guildId: string;
  initialActions: IllegalAction[];
  initialGoals: WeeklyGoalSubmission[];
  channels: Channel[];
  initialLogConfigs: LogConfig[];
}

export function CentralManager({ guildId, initialActions, initialGoals, channels, initialLogConfigs }: Props) {
  const [actions, setActions] = useState<IllegalAction[]>(initialActions);
  const [goals, setGoals] = useState<WeeklyGoalSubmission[]>(initialGoals);
  const [logChannelId, setLogChannelId] = useState(
    initialLogConfigs.find(c => c.feature === 'CENTRAL')?.channelId || ''
  );
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'actions' | 'ranking' | 'goals'>('actions');
  const [rankingPeriod, setRankingPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [ranking, setRanking] = useState<RankingEntry[]>([]);

  // Forms States
  const [outcome, setOutcome] = useState<'WON' | 'LOST'>('WON');
  const [actionAmount, setActionAmount] = useState(0);
  const [actionParticipants, setActionParticipants] = useState('');
  const [isCreatingAction, setIsCreatingAction] = useState(false);

  const [goalUserId, setGoalUserId] = useState('');
  const [goalAmount, setGoalAmount] = useState(0);
  const [isCreatingGoal, setIsCreatingGoal] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Ranking
  useEffect(() => {
    getRanking(guildId, rankingPeriod)
      .then(res => {
        if (res.success && res.ranking) {
          setRanking(res.ranking);
        } else {
          setRanking([]);
        }
      })
      .catch(err => console.error('Erro ao carregar ranking:', err));
  }, [rankingPeriod, guildId, actions, goals]); // Reload ranking when actions or goals change

  const handleSaveLogConfig = async () => {
    const res = await saveLogConfig(guildId, logChannelId);
    if (res.success) {
      setMessage({ type: 'success', text: 'Configuração de canal de logs salva com sucesso!' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao salvar configuração de log.' });
    }
  };

  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionAmount || !actionParticipants) return;

    const participants = actionParticipants.split(',').map(p => p.trim()).filter(Boolean);
    if (participants.length === 0) return;

    const res = await createIllegalAction(guildId, outcome, actionAmount, participants);
    if (res.success && res.action) {
      setActions([res.action, ...actions]);
      setActionAmount(0);
      setActionParticipants('');
      setIsCreatingAction(false);
      setMessage({ type: 'success', text: 'Ação registrada com sucesso!' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao registrar ação.' });
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalUserId || goalAmount <= 0) return;

    // Get current Monday
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const weekStartDate = new Date(now.setDate(diff)).toISOString().split('T')[0] || '';

    const res = await createWeeklyGoal(guildId, goalUserId, goalAmount, weekStartDate);
    if (res.success && res.goal) {
      setGoals([res.goal, ...goals]);
      setGoalUserId('');
      setGoalAmount(0);
      setIsCreatingGoal(false);
      setMessage({ type: 'success', text: 'Entrega de meta registrada com sucesso!' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao registrar meta.' });
    }
  };

  const textChannels = channels.filter(c => c.type === 0 || c.type === 5);

  // Stats calculations
  const totalWonAmount = actions
    .filter(a => a.outcome === 'WON')
    .reduce((sum, a) => sum + a.amount, 0);

  const goalSum = goals.reduce((sum, g) => sum + g.amountDelivered, 0);

  return (
    <div style={styles.container}>
      {message && (
        <div style={{ ...styles.alert, ...(message.type === 'success' ? styles.alertSuccess : styles.alertError) }}>
          <AlertCircle size={16} /> <span>{message.text}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard} className="card-glass">
          <div style={styles.statIconWrapper}>
            <TrendingUp size={24} style={{ color: '#248046' }} />
          </div>
          <div>
            <div style={styles.statLabel}>Total Ganho em Ações</div>
            <div style={styles.statValue}>R$ {totalWonAmount.toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div style={styles.statCard} className="card-glass">
          <div style={styles.statIconWrapper}>
            <Trophy size={24} style={{ color: '#ffc44f' }} />
          </div>
          <div>
            <div style={styles.statLabel}>Entregas de Meta Semanal</div>
            <div style={styles.statValue}>R$ {goalSum.toLocaleString('pt-BR')}</div>
          </div>
        </div>

        {/* Logs Config */}
        <div style={{ ...styles.statCard, flex: 2 }} className="card-glass">
          <div style={styles.statIconWrapper}>
            <Settings size={24} style={{ color: '#949ba4' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.statLabel}>Canal de Logs da Central</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <select
                value={logChannelId}
                onChange={(e) => setLogChannelId(e.target.value)}
                className="form-control"
                style={{ flex: 1, padding: '6px' }}
              >
                <option value="">Nenhum canal configurado (Log desativado)</option>
                {textChannels.map(ch => (
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
              </select>
              <button onClick={handleSaveLogConfig} className="btn btn-secondary" style={{ padding: '6px 12px' }}>
                <Save size={14} /> Salvar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div style={styles.tabMenu}>
        <button
          onClick={() => setActiveTab('actions')}
          style={{ ...styles.tabBtn, ...(activeTab === 'actions' ? styles.tabBtnActive : {}) }}
        >
          <Swords size={16} /> Registro de Ações
        </button>
        <button
          onClick={() => setActiveTab('ranking')}
          style={{ ...styles.tabBtn, ...(activeTab === 'ranking' ? styles.tabBtnActive : {}) }}
        >
          <Trophy size={16} /> Ranking/Leaderboard
        </button>
        <button
          onClick={() => setActiveTab('goals')}
          style={{ ...styles.tabBtn, ...(activeTab === 'goals' ? styles.tabBtnActive : {}) }}
        >
          <Calendar size={16} /> Metas Semanais
        </button>
      </div>

      {/* Tab: Actions */}
      {activeTab === 'actions' && (
        <div style={styles.splitGrid}>
          <div style={styles.card} className="card-glass">
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Registrar Nova Ação</h3>
            </div>
            <form onSubmit={handleCreateAction} style={styles.form}>
              <div className="form-group">
                <label className="form-label">Resultado</label>
                <select
                  value={outcome}
                  onChange={e => setOutcome(e.target.value as any)}
                  className="form-control"
                >
                  <option value="WON">Sucesso (WON)</option>
                  <option value="LOST">Falha (LOST)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Valor Total (em R$)</label>
                <input
                  type="number"
                  value={actionAmount || ''}
                  onChange={e => setActionAmount(parseInt(e.target.value, 10) || 0)}
                  placeholder="Ex: 50000"
                  className="form-control"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">IDs dos Participantes (separados por vírgula)</label>
                <textarea
                  value={actionParticipants}
                  onChange={e => setActionParticipants(e.target.value)}
                  placeholder="Ex: 123456789012345678, 987654321098765432"
                  className="form-control"
                  rows={3}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary">Registrar Ação</button>
            </form>
          </div>

          <div style={styles.card} className="card-glass">
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Histórico de Ações</h3>
            </div>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Data</th>
                    <th style={styles.th}>Resultado</th>
                    <th style={styles.th}>Valor</th>
                    <th style={styles.th}>Registrado Por</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map(act => (
                    <tr key={act.id} style={styles.tr}>
                      <td style={styles.td}>{new Date(act.createdAt).toLocaleString('pt-BR')}</td>
                      <td style={styles.td}>
                        <span className={`badge ${act.outcome === 'WON' ? 'badge-active' : 'badge-inactive'}`}>
                          {act.outcome === 'WON' ? 'WON' : 'LOST'}
                        </span>
                      </td>
                      <td style={{ ...styles.td, color: act.outcome === 'WON' ? '#34d399' : '#f25c60', fontWeight: 700 }}>
                        R$ {act.amount.toLocaleString('pt-BR')}
                      </td>
                      <td style={styles.td}>{act.registeredByUserId}</td>
                    </tr>
                  ))}
                  {actions.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ ...styles.td, textAlign: 'center', color: '#949ba4' }}>Nenhuma ação registrada.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Ranking */}
      {activeTab === 'ranking' && (
        <div style={styles.card} className="card-glass">
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.cardTitle}>Leaderboard de Participantes</h3>
              <p style={styles.cardSubtitle}>Consulta agregada do valor gerado por membro.</p>
            </div>
            <div style={styles.toggleGroup}>
              <button onClick={() => setRankingPeriod('week')} className={rankingPeriod === 'week' ? 'active' : ''} style={styles.toggleItem}>Semana</button>
              <button onClick={() => setRankingPeriod('month')} className={rankingPeriod === 'month' ? 'active' : ''} style={styles.toggleItem}>Mês</button>
              <button onClick={() => setRankingPeriod('all')} className={rankingPeriod === 'all' ? 'active' : ''} style={styles.toggleItem}>Total</button>
            </div>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Posição</th>
                  <th style={styles.th}>Membro (Discord ID)</th>
                  <th style={styles.th}>Valor Gerado</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row, idx) => (
                  <tr key={row.discordUserId} style={styles.tr}>
                    <td style={{ ...styles.td, fontWeight: 700 }}>#{idx + 1}</td>
                    <td style={styles.td}>
                      <span style={{ fontFamily: 'monospace' }}>{row.discordUserId}</span>
                    </td>
                    <td style={{ ...styles.td, color: '#34d399', fontWeight: 700 }}>
                      R$ {row.totalAmount.toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
                {ranking.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ ...styles.td, textAlign: 'center', color: '#949ba4' }}>Nenhum dado de ranking para o período selecionado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Goals */}
      {activeTab === 'goals' && (
        <div style={styles.splitGrid}>
          <div style={styles.card} className="card-glass">
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Registrar Entrega de Meta</h3>
            </div>
            <form onSubmit={handleCreateGoal} style={styles.form}>
              <div className="form-group">
                <label className="form-label">Discord User ID do Membro</label>
                <input
                  type="text"
                  value={goalUserId}
                  onChange={e => setGoalUserId(e.target.value)}
                  placeholder="Ex: 123456789012345678"
                  className="form-control"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Valor Entregue (em R$)</label>
                <input
                  type="number"
                  value={goalAmount || ''}
                  onChange={e => setGoalAmount(parseInt(e.target.value, 10) || 0)}
                  placeholder="Ex: 10000"
                  className="form-control"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary">Registrar Entrega</button>
            </form>
          </div>

          <div style={styles.card} className="card-glass">
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Histórico de Entregas</h3>
            </div>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Data de Início da Semana</th>
                    <th style={styles.th}>Membro (Discord ID)</th>
                    <th style={styles.th}>Valor Entregue</th>
                    <th style={styles.th}>Registrado Por</th>
                  </tr>
                </thead>
                <tbody>
                  {goals.map(g => (
                    <tr key={g.id} style={styles.tr}>
                      <td style={styles.td}>{new Date(g.weekStartDate).toLocaleDateString('pt-BR')}</td>
                      <td style={styles.td}>{g.discordUserId}</td>
                      <td style={{ ...styles.td, color: '#34d399', fontWeight: 700 }}>R$ {g.amountDelivered.toLocaleString('pt-BR')}</td>
                      <td style={styles.td}>{g.registeredByUserId}</td>
                    </tr>
                  ))}
                  {goals.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ ...styles.td, textAlign: 'center', color: '#949ba4' }}>Nenhuma entrega registrada.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  alert: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  alertSuccess: {
    background: 'rgba(36, 128, 70, 0.15)',
    border: '1px solid rgba(36, 128, 70, 0.3)',
    color: '#34d399',
  },
  alertError: {
    background: 'rgba(218, 55, 60, 0.15)',
    border: '1px solid rgba(218, 55, 60, 0.3)',
    color: '#f25c60',
  },
  statsGrid: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: '220px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
  },
  statIconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.03)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: '11px',
    color: '#949ba4',
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#ffffff',
    marginTop: '2px',
  },
  tabMenu: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    paddingBottom: '8px',
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    color: '#949ba4',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.15s ease',
  },
  tabBtnActive: {
    background: 'rgba(88, 101, 242, 0.15)',
    color: '#5865f2',
  },
  splitGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: '24px',
    alignItems: 'start',
  },
  card: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '340px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    paddingBottom: '12px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#ffffff',
  },
  cardSubtitle: {
    fontSize: '12px',
    color: '#949ba4',
    marginTop: '2px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  th: {
    textAlign: 'left',
    padding: '10px',
    color: '#949ba4',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    fontWeight: 700,
  },
  td: {
    padding: '10px',
    color: '#dbdee1',
    borderBottom: '1px solid rgba(255,255,255,0.02)',
  },
  tr: {
    transition: 'background 0.1s ease',
  },
  toggleGroup: {
    display: 'flex',
    background: 'rgba(0,0,0,0.2)',
    padding: '2px',
    borderRadius: '6px',
  },
  toggleItem: {
    background: 'none',
    border: 'none',
    color: '#949ba4',
    padding: '4px 10px',
    fontSize: '11px',
    cursor: 'pointer',
    borderRadius: '4px',
  },
};
