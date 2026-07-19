// apps/dashboard/src/app/dashboard/[guildId]/bau/InventoryManager.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Package, Plus, History, Settings, Save, AlertCircle } from 'lucide-react';
import { saveLogConfig, createInventoryItem, adjustItemQuantity, getInventoryMovements } from './actions';

interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  currentQuantity: number;
  isActive: boolean;
  createdAt: string;
}

interface InventoryMovement {
  id: string;
  quantityDelta: number;
  resultingQuantity: number;
  performedByUserId: string;
  reason: string | null;
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
  initialItems: InventoryItem[];
  channels: Channel[];
  initialLogConfigs: LogConfig[];
}

export function InventoryManager({ guildId, initialItems, channels, initialLogConfigs }: Props) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [logChannelId, setLogChannelId] = useState(
    initialLogConfigs.find(c => c.feature === 'INVENTORY')?.channelId || ''
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItems[0]?.id || null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  
  // Forms States
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemQty, setNewItemQty] = useState(0);
  const [isCreating, setIsCreating] = useState(false);

  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load movements for selected item
  useEffect(() => {
    if (selectedItemId) {
      getInventoryMovements(guildId, selectedItemId)
        .then(res => {
          if (res.success && res.movements) {
            setMovements(res.movements);
          } else {
            setMovements([]);
          }
        })
        .catch(err => console.error('Erro ao carregar movimentações:', err));
    }
  }, [selectedItemId, guildId]);

  const handleSaveLogConfig = async () => {
    const res = await saveLogConfig(guildId, logChannelId);
    if (res.success) {
      setMessage({ type: 'success', text: 'Configuração de canal de logs salva com sucesso!' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao salvar configuração de log.' });
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName) return;

    const res = await createInventoryItem(guildId, newItemName, newItemDesc, newItemQty);
    if (res.success && res.item) {
      setItems([res.item, ...items]);
      setSelectedItemId(res.item.id);
      setNewItemName('');
      setNewItemDesc('');
      setNewItemQty(0);
      setIsCreating(false);
      setMessage({ type: 'success', text: `Item "${res.item.name}" criado com sucesso!` });
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao criar item.' });
    }
  };

  const handleAdjustQuantity = async (e: React.FormEvent, type: 'add' | 'sub') => {
    e.preventDefault();
    if (!selectedItemId || adjustQty <= 0) return;

    const delta = type === 'add' ? adjustQty : -adjustQty;

    const res = await adjustItemQuantity(guildId, selectedItemId, delta, adjustReason);
    if (res.success && res.item && res.movement) {
      setItems(items.map(item => (item.id === selectedItemId ? res.item : item)));
      setMovements([res.movement, ...movements]);
      setAdjustQty(0);
      setAdjustReason('');
      setIsAdjusting(false);
      setMessage({ type: 'success', text: 'Saldo atualizado com sucesso!' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao ajustar saldo.' });
    }
  };

  const textChannels = channels.filter(c => c.type === 0 || c.type === 5);
  const selectedItem = items.find(i => i.id === selectedItemId);

  // Stats
  const totalItemsCount = items.length;
  const totalStockQty = items.reduce((sum, item) => sum + item.currentQuantity, 0);

  return (
    <div style={styles.container}>
      {message && (
        <div style={{ ...styles.alert, ...(message.type === 'success' ? styles.alertSuccess : styles.alertError) }}>
          <AlertCircle size={16} /> <span>{message.text}</span>
        </div>
      )}

      {/* Top Stats Cards */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard} className="card-glass">
          <div style={styles.statIconWrapper}>
            <Package size={24} style={{ color: '#5865f2' }} />
          </div>
          <div>
            <div style={styles.statLabel}>Total de Itens</div>
            <div style={styles.statValue}>{totalItemsCount}</div>
          </div>
        </div>

        <div style={styles.statCard} className="card-glass">
          <div style={styles.statIconWrapper}>
            <Plus size={24} style={{ color: '#248046' }} />
          </div>
          <div>
            <div style={styles.statLabel}>Saldo Total em Estoque</div>
            <div style={styles.statValue}>{totalStockQty}</div>
          </div>
        </div>

        {/* Logs Config Card */}
        <div style={{ ...styles.statCard, flex: 2 }} className="card-glass">
          <div style={styles.statIconWrapper}>
            <Settings size={24} style={{ color: '#949ba4' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.statLabel}>Canal de Logs de Inventário</div>
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

      {/* Main Content split */}
      <div style={styles.splitGrid}>
        {/* Left Col: Items List */}
        <div style={styles.card} className="card-glass">
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>Itens do Inventário</h3>
            <button onClick={() => setIsCreating(!isCreating)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
              + Novo Item
            </button>
          </div>

          {isCreating && (
            <form onSubmit={handleCreateItem} style={styles.createForm}>
              <input
                type="text"
                placeholder="Nome do Item"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                className="form-control"
                required
              />
              <textarea
                placeholder="Descrição"
                value={newItemDesc}
                onChange={e => setNewItemDesc(e.target.value)}
                className="form-control"
                rows={2}
              />
              <input
                type="number"
                placeholder="Quantidade Inicial"
                value={newItemQty}
                onChange={e => setNewItemQty(parseInt(e.target.value, 10) || 0)}
                className="form-control"
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Criar</button>
                <button type="button" onClick={() => setIsCreating(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
              </div>
            </form>
          )}

          <div style={styles.listContainer}>
            {items.map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                style={{
                  ...styles.listItem,
                  ...(selectedItemId === item.id ? styles.listItemActive : {}),
                }}
              >
                <div>
                  <div style={styles.itemName}>{item.name}</div>
                  <div style={styles.itemDesc}>{item.description || 'Sem descrição.'}</div>
                </div>
                <div style={styles.itemBadge}>
                  {item.currentQuantity}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Details & Movement Log */}
        <div style={styles.card} className="card-glass">
          {selectedItem ? (
            <>
              <div style={styles.cardHeader}>
                <div>
                  <h3 style={styles.cardTitle}>{selectedItem.name}</h3>
                  <p style={styles.cardSubtitle}>Visualizando movimentações e ajuste de estoque.</p>
                </div>
                <button onClick={() => setIsAdjusting(!isAdjusting)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  Ajustar Saldo
                </button>
              </div>

              {isAdjusting && (
                <div style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px', background: 'rgba(0,0,0,0.1)', marginBottom: '20px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '8px' }}>Ajustar quantidade do Item</span>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="number"
                      placeholder="Qtd (Ex: 5)"
                      value={adjustQty || ''}
                      onChange={e => setAdjustQty(parseInt(e.target.value, 10) || 0)}
                      className="form-control"
                      style={{ flex: 1 }}
                      min={1}
                    />
                    <input
                      type="text"
                      placeholder="Motivo"
                      value={adjustReason}
                      onChange={e => setAdjustReason(e.target.value)}
                      className="form-control"
                      style={{ flex: 2 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={(e) => handleAdjustQuantity(e, 'add')} className="btn btn-primary" style={{ flex: 1, background: '#248046' }}>Adicionar (+)</button>
                    <button onClick={(e) => handleAdjustQuantity(e, 'sub')} className="btn btn-danger" style={{ flex: 1, background: '#da373c' }}>Retirar (-)</button>
                    <button onClick={() => setIsAdjusting(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <History size={16} /> <span style={{ fontSize: '13px', fontWeight: 700 }}>Histórico de Movimentações</span>
              </div>

              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Data</th>
                      <th style={styles.th}>Ajuste</th>
                      <th style={styles.th}>Saldo Resultante</th>
                      <th style={styles.th}>Autor</th>
                      <th style={styles.th}>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(mov => (
                      <tr key={mov.id} style={styles.tr}>
                        <td style={styles.td}>{new Date(mov.createdAt).toLocaleString('pt-BR')}</td>
                        <td style={{ ...styles.td, color: mov.quantityDelta >= 0 ? '#248046' : '#da373c', fontWeight: 700 }}>
                          {mov.quantityDelta >= 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}
                        </td>
                        <td style={styles.td}>{mov.resultingQuantity}</td>
                        <td style={styles.td}>{mov.performedByUserId}</td>
                        <td style={styles.td}>{mov.reason || '—'}</td>
                      </tr>
                    ))}
                    {movements.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: '#949ba4' }}>Nenhuma movimentação registrada.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#949ba4' }}>
              <Package size={48} style={{ marginBottom: '12px' }} />
              <span>Nenhum item selecionado. Crie um item ao lado.</span>
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
    gridTemplateColumns: '1fr 2fr',
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
  createForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '8px',
    background: 'rgba(0,0,0,0.1)',
    marginBottom: '20px',
  },
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.03)',
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.01)',
    transition: 'background 0.15s ease',
  },
  listItemActive: {
    background: 'rgba(88, 101, 242, 0.1)',
    borderColor: '#5865f2',
  },
  itemName: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#ffffff',
  },
  itemDesc: {
    fontSize: '11px',
    color: '#949ba4',
    marginTop: '2px',
  },
  itemBadge: {
    fontSize: '12px',
    fontWeight: 700,
    background: 'rgba(255, 255, 255, 0.05)',
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#ffffff',
  },
  tableWrapper: {
    overflowX: 'auto',
    flex: 1,
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
};
