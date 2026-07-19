// apps/dashboard/src/app/dashboard/[guildId]/cadastros/RegistrationManager.tsx
'use client';

import React, { useState } from 'react';
import { UserCheck, Check, X, AlertCircle, Settings, Save, Eye } from 'lucide-react';
import { saveLogConfig, reviewRegistration } from './actions';

interface CharacterRegistration {
  id: string;
  discordUserId: string;
  characterName: string;
  characterServerId: number;
  phoneNumber: string;
  referredByUserId: string | null;
  status: string;
  nicknameAtSubmission: string;
  createdAt: string;
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
  initialRegistrations: CharacterRegistration[];
  channels: Channel[];
  initialLogConfigs: LogConfig[];
}

export function RegistrationManager({ guildId, initialRegistrations, channels, initialLogConfigs }: Props) {
  const [registrations, setRegistrations] = useState<CharacterRegistration[]>(initialRegistrations);
  const [logChannelId, setLogChannelId] = useState(
    initialLogConfigs.find(c => c.feature === 'REGISTRATION')?.channelId || ''
  );
  
  const [selectedRegId, setSelectedRegId] = useState<string | null>(initialRegistrations[0]?.id || null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSaveLogConfig = async () => {
    const res = await saveLogConfig(guildId, logChannelId);
    if (res.success) {
      setMessage({ type: 'success', text: 'Configuração de canal de logs salva com sucesso!' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao salvar configuração de log.' });
    }
  };

  const handleReview = async (regId: string, status: 'VERIFIED' | 'REJECTED') => {
    const res = await reviewRegistration(guildId, regId, status);
    if (res.success && res.registration) {
      setRegistrations(registrations.map(r => (r.id === regId ? res.registration : r)));
      setMessage({
        type: 'success',
        text: `Cadastro de ${res.registration.characterName} foi ${status === 'VERIFIED' ? 'aprovado' : 'rejeitado'} com sucesso!`,
      });
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao revisar cadastro.' });
    }
  };

  const textChannels = channels.filter(c => c.type === 0 || c.type === 5);
  const selectedReg = registrations.find(r => r.id === selectedRegId);

  // Stats
  const totalCount = registrations.length;
  const pendingCount = registrations.filter(r => r.status === 'PENDING' || r.status === 'MISMATCH').length;

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
            <UserCheck size={24} style={{ color: '#5865f2' }} />
          </div>
          <div>
            <div style={styles.statLabel}>Total de Cadastros</div>
            <div style={styles.statValue}>{totalCount}</div>
          </div>
        </div>

        <div style={styles.statCard} className="card-glass">
          <div style={styles.statIconWrapper}>
            <AlertCircle size={24} style={{ color: '#ffc44f' }} />
          </div>
          <div>
            <div style={styles.statLabel}>Revisões Pendentes</div>
            <div style={styles.statValue}>{pendingCount}</div>
          </div>
        </div>

        {/* Logs Config */}
        <div style={{ ...styles.statCard, flex: 2 }} className="card-glass">
          <div style={styles.statIconWrapper}>
            <Settings size={24} style={{ color: '#949ba4' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.statLabel}>Canal de Logs de Cadastro</div>
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

      {/* Split List & Review comparison */}
      <div style={styles.splitGrid}>
        {/* Left: Table List */}
        <div style={{ ...styles.card, flex: 2 }} className="card-glass">
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>Fila de Cadastros</h3>
          </div>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Data</th>
                  <th style={styles.th}>Nome do Personagem</th>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Membro (Discord ID)</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map(reg => (
                  <tr
                    key={reg.id}
                    onClick={() => setSelectedRegId(reg.id)}
                    style={{
                      ...styles.tr,
                      cursor: 'pointer',
                      ...(selectedRegId === reg.id ? styles.trActive : {}),
                    }}
                  >
                    <td style={styles.td}>{new Date(reg.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td style={styles.td}>{reg.characterName}</td>
                    <td style={styles.td}>#{reg.characterServerId}</td>
                    <td style={styles.td}>{reg.discordUserId}</td>
                    <td style={styles.td}>
                      <span
                        className={`badge`}
                        style={{
                          background:
                            reg.status === 'VERIFIED'
                              ? 'rgba(36, 128, 70, 0.15)'
                              : reg.status === 'PENDING'
                              ? 'rgba(255, 196, 79, 0.15)'
                              : 'rgba(218, 55, 60, 0.15)',
                          color:
                            reg.status === 'VERIFIED'
                              ? '#34d399'
                              : reg.status === 'PENDING'
                              ? '#ffc44f'
                              : '#f25c60',
                        }}
                      >
                        {reg.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Eye size={12} /> Rastrear
                      </button>
                    </td>
                  </tr>
                ))}
                {registrations.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#949ba4' }}>Nenhum cadastro recebido.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Side comparison panel */}
        <div style={styles.card} className="card-glass">
          {selectedReg ? (
            <>
              <div style={styles.cardHeader}>
                <div>
                  <h3 style={styles.cardTitle}>Comparação Visual</h3>
                  <p style={styles.cardSubtitle}>Revisar correspondência de dados de cadastro.</p>
                </div>
              </div>

              <div style={styles.comparisonGrid}>
                {/* Form Data */}
                <div style={styles.compCol}>
                  <div style={styles.compHeader}>Formulário Enviado</div>
                  <div style={styles.compItem}>
                    <div style={styles.compLabel}>Nome do Personagem</div>
                    <div style={styles.compValue}>{selectedReg.characterName}</div>
                  </div>
                  <div style={styles.compItem}>
                    <div style={styles.compLabel}>ID do Personagem (RP)</div>
                    <div style={styles.compValue}>#{selectedReg.characterServerId}</div>
                  </div>
                  <div style={styles.compItem}>
                    <div style={styles.compLabel}>Telefone</div>
                    <div style={styles.compValue}>{selectedReg.phoneNumber}</div>
                  </div>
                  <div style={styles.compItem}>
                    <div style={styles.compLabel}>Indicado Por</div>
                    <div style={styles.compValue}>{selectedReg.referredByUserId || 'Ninguém'}</div>
                  </div>
                </div>

                {/* Discord Nick Data */}
                <div style={styles.compCol}>
                  <div style={styles.compHeader}>Discord Apelido</div>
                  <div style={styles.compItem}>
                    <div style={styles.compLabel}>Apelido Lido (no Hub)</div>
                    <div style={{ ...styles.compValue, fontFamily: 'monospace', color: '#ffc44f' }}>
                      {selectedReg.nicknameAtSubmission || 'Nenhum apelido definido'}
                    </div>
                  </div>
                  <div style={{ ...styles.compItem, marginTop: '24px' }}>
                    <div style={styles.compLabel}>Status da Validação</div>
                    <div
                      className="badge"
                      style={{
                        display: 'inline-block',
                        marginTop: '4px',
                        background:
                          selectedReg.status === 'VERIFIED'
                            ? 'rgba(36, 128, 70, 0.15)'
                            : selectedReg.status === 'PENDING'
                            ? 'rgba(255, 196, 79, 0.15)'
                            : 'rgba(218, 55, 60, 0.15)',
                        color:
                          selectedReg.status === 'VERIFIED'
                            ? '#34d399'
                            : selectedReg.status === 'PENDING'
                            ? '#ffc44f'
                            : '#f25c60',
                      }}
                    >
                      {selectedReg.status}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons if Pending/Mismatch */}
              {(selectedReg.status === 'PENDING' || selectedReg.status === 'MISMATCH') && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
                  <button
                    onClick={() => handleReview(selectedReg.id, 'VERIFIED')}
                    className="btn btn-primary"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#248046' }}
                  >
                    <Check size={16} /> Aprovar Cadastro
                  </button>
                  <button
                    onClick={() => handleReview(selectedReg.id, 'REJECTED')}
                    className="btn btn-danger"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#da373c' }}
                  >
                    <X size={16} /> Rejeitar Cadastro
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#949ba4' }}>
              <UserCheck size={48} style={{ marginBottom: '12px' }} />
              <span>Nenhum cadastro selecionado para visualização lado-a-lado.</span>
            </div>
          )}
        </div>
      </div>
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
  splitGrid: {
    display: 'grid',
    gridTemplateColumns: '3fr 2fr',
    gap: '24px',
    alignItems: 'start',
  },
  card: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '400px',
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
  trActive: {
    background: 'rgba(88,101,242,0.05)',
  },
  comparisonGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  compCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  compHeader: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#5865f2',
    marginBottom: '6px',
  },
  compItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  compLabel: {
    fontSize: '10px',
    color: '#949ba4',
    textTransform: 'uppercase',
  },
  compValue: {
    fontSize: '13px',
    color: '#ffffff',
    marginTop: '2px',
  },
};
