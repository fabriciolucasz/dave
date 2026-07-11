// apps/dashboard/src/app/dashboard/[guildId]/paineis/PaineisList.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  Hand,
  Ticket,
  ScrollText,
  ShieldCheck,
  Megaphone,
  CircleCheck,
  CircleAlert,
  ArrowLeft,
  Pencil,
  Power,
  Inbox,
  Sparkles,
  Check,
} from 'lucide-react';
import { disableContainer, saveContainer, getContainerPreview } from './actions';
import { PanelConfigForm } from './PanelConfigForm';

interface ContainerItem {
  id: string;
  channelId: string;
  type: string;
  messageId: string | null;
  createdAt: string;
  isActive: boolean;
  payload: any;
}

interface ContainerType {
  type: string;
  name: string;
  icon: string;
  isSticky: boolean;
  description: string;
}

interface PlanFeatures {
  maxActiveContainers: number;
  customWebhookEnabled: boolean;
  queuePriority: boolean;
  maxBillingAdmins: number;
}

interface PaineisListProps {
  guildId: string;
  panelTypes: ContainerType[];
  initialContainers: ContainerItem[];
  channels: Array<{ id: string; name: string }>;
  currentPlanCode: string;
  planFeatures: PlanFeatures;
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Hand: Hand,
  Ticket: Ticket,
  ScrollText: ScrollText,
  ShieldCheck: ShieldCheck,
  Megaphone: Megaphone,
};

export function PaineisList({
  guildId,
  panelTypes,
  initialContainers,
  channels,
  currentPlanCode,
  planFeatures,
}: PaineisListProps) {
  const [containers, setContainers] = useState<ContainerItem[]>(initialContainers);
  const [activeConfigType, setActiveConfigType] = useState<string | null>(null);
  const [disablingId, setDisablingId] = useState<string | null>(null);

  // Filtra containers ativos para saber o status de cada tipo
  const activeContainersByType = new Map<string, ContainerItem>(
    containers.filter((c) => c.isActive).map((c) => [c.type, c])
  );

  const handleDisable = async (containerId: string) => {
    if (!confirm('Deseja realmente desativar este Painel? Ele será removido do Discord.')) {
      return;
    }
    setDisablingId(containerId);
    const res = await disableContainer(guildId, containerId);
    setDisablingId(null);

    if (res.success) {
      setContainers(containers.filter((c) => c.id !== containerId));
    } else {
      alert(res.error || 'Erro ao desativar painel.');
    }
  };

  const handleSaveSuccess = (savedContainer: any) => {
    // Atualiza a lista local de containers
    setContainers((prev) => {
      // Remove versões anteriores do mesmo tipo
      const filtered = prev.filter(
        (c) => !(c.type === savedContainer.type && c.channelId === savedContainer.channelId)
      );
      return [savedContainer, ...filtered];
    });
    setActiveConfigType(null);
  };

  // Encontra canal pelo ID para exibição amigável
  const getChannelName = (channelId: string) => {
    return channels.find((ch) => ch.id === channelId)?.name || channelId;
  };

  if (activeConfigType) {
    const selectedType = panelTypes.find((t) => t.type === activeConfigType)!;
    const existingContainer = activeContainersByType.get(activeConfigType);

    return (
      <div className="animate-fade-in">
        <button
          onClick={() => setActiveConfigType(null)}
          className="btn btn-secondary"
          style={styles.backBtn}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Voltar para Painéis
        </button>

        <div className="card-glass" style={styles.formContainer}>
          <PanelConfigForm
            guildId={guildId}
            channels={channels}
            panelType={selectedType}
            existingContainer={existingContainer}
            planFeatures={planFeatures}
            currentPlanCode={currentPlanCode}
            onSaveSuccess={handleSaveSuccess}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={styles.container}>
      <div style={styles.headerBlock}>
        <h2 style={styles.title}>Painéis de Identidade Visual</h2>
        <p style={styles.description}>
          Personalize a identidade visual e o comportamento das mensagens fixas do bot em seu servidor.
        </p>
      </div>

      {/* Grid de Cards de Tipos de Painel */}
      <div style={styles.grid}>
        {panelTypes.map((type) => {
          const IconComponent = ICON_MAP[type.icon] || Hand;
          const activeContainer = activeContainersByType.get(type.type);
          const isConfigured = !!activeContainer;

          return (
            <div key={type.type} className="card-glass" style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.iconWrapper}>
                  <IconComponent size={24} style={{ color: '#ffffff' }} />
                </div>
                <span
                  className={`badge ${isConfigured ? 'badge-active' : 'badge-inactive'}`}
                  style={styles.badge}
                >
                  {isConfigured ? (
                    <>
                      <CircleCheck size={12} aria-hidden="true" style={{ marginRight: '4px' }} /> Ativo
                    </>
                  ) : (
                    <>
                      <CircleAlert size={12} aria-hidden="true" style={{ marginRight: '4px' }} /> Inativo
                    </>
                  )}
                </span>
              </div>

              <h3 style={styles.cardTitle}>{type.name}</h3>
              <p style={styles.cardDesc}>{type.description}</p>

              {isConfigured && activeContainer && (
                <div style={styles.configuredInfo}>
                  <div><strong>Canal:</strong> #{getChannelName(activeContainer.channelId)}</div>
                  <div style={{ marginTop: '4px', fontSize: '11px' }}>
                    <strong>Renderização:</strong> <span style={{ textTransform: 'capitalize' }}>{activeContainer.payload?.renderMode || 'embed'}</span>
                  </div>
                </div>
              )}

              <div style={styles.cardFooter}>
                <button
                  onClick={() => setActiveConfigType(type.type)}
                  className="btn btn-primary"
                  style={styles.actionBtn}
                >
                  <Pencil size={14} aria-hidden="true" />
                  {isConfigured ? 'Editar Painel' : 'Configurar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabela de Painéis Ativos */}
      <div className="card-glass" style={styles.tableCard}>
        <h3 style={styles.tableTitle}>Painéis Ativos no Discord</h3>
        <p style={styles.tableSubtitle}>
          Lista de mensagens persistentes atualmente monitoradas pelo bot no seu servidor.
        </p>

        {containers.filter((c) => c.isActive).length === 0 ? (
          <div style={styles.emptyContainer}>
            <Inbox size={48} aria-hidden="true" style={{ color: '#6e7681', marginBottom: '16px' }} />
            <h4 style={{ color: '#ffffff', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
              Nenhum painel ativo
            </h4>
            <p style={{ color: '#949ba4', fontSize: '14px', maxWidth: '340px' }}>
              Utilize os cards acima para configurar e postar o seu primeiro painel personalizado no servidor!
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Painel</th>
                  <th style={styles.th}>Canal</th>
                  <th style={styles.th}>Renderização</th>
                  <th style={styles.th}>Mensagem ID</th>
                  <th style={styles.th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {containers
                  .filter((c) => c.isActive)
                  .map((c) => {
                    const typeMeta = panelTypes.find((t) => t.type === c.type);
                    return (
                      <tr key={c.id} style={styles.trBody}>
                        <td style={styles.td}>
                          <span style={styles.panelName}>{typeMeta?.name || c.type}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ fontWeight: 600 }}>#{getChannelName(c.channelId)}</span>
                        </td>
                        <td style={styles.td}>
                          <span className="badge badge-active" style={{ textTransform: 'capitalize', fontSize: '11px', fontWeight: 600 }}>
                            {c.payload?.renderMode || 'embed'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <code style={styles.code}>{c.messageId || 'Aguardando repost...'}</code>
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => setActiveConfigType(c.type)}
                              className="btn btn-secondary"
                              style={styles.tableActionBtn}
                            >
                              <Pencil size={12} aria-hidden="true" /> Editar
                            </button>
                            <button
                              onClick={() => handleDisable(c.id)}
                              disabled={disablingId === c.id}
                              className="btn btn-danger"
                              style={styles.tableActionBtn}
                            >
                              <Power size={12} aria-hidden="true" /> Desativar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  headerBlock: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    paddingBottom: '16px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#ffffff',
    marginBottom: '8px',
  },
  description: {
    fontSize: '14px',
    color: '#949ba4',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '24px',
  },
  card: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: '260px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  iconWrapper: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    background: 'rgba(88, 101, 242, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(88, 101, 242, 0.25)',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: 700,
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#ffffff',
    marginBottom: '8px',
  },
  cardDesc: {
    fontSize: '13px',
    color: '#949ba4',
    lineHeight: '1.5',
    flex: 1,
    marginBottom: '16px',
  },
  configuredInfo: {
    fontSize: '12px',
    color: '#6e7681',
    background: 'rgba(0, 0, 0, 0.15)',
    padding: '6px 10px',
    borderRadius: '4px',
    marginBottom: '16px',
  },
  cardFooter: {
    marginTop: 'auto',
  },
  actionBtn: {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '8px',
    fontSize: '13px',
  },
  tableCard: {
    padding: '32px',
  },
  tableTitle: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#ffffff',
    marginBottom: '4px',
  },
  tableSubtitle: {
    fontSize: '13px',
    color: '#949ba4',
    marginBottom: '24px',
  },
  emptyContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '48px 16px',
    background: 'rgba(0, 0, 0, 0.1)',
    border: '1px dashed var(--border)',
    borderRadius: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  trHead: {
    borderBottom: '1px solid var(--border)',
    background: 'rgba(255, 255, 255, 0.01)',
  },
  th: {
    padding: '12px 20px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#6e7681',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  trBody: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
  },
  td: {
    padding: '12px 20px',
    fontSize: '14px',
    color: '#f2f3f5',
    verticalAlign: 'middle',
  },
  panelName: {
    fontWeight: 700,
    color: '#ffffff',
  },
  code: {
    fontFamily: 'monospace',
    color: '#f0b232',
    background: 'rgba(240, 178, 50, 0.05)',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
  },
  tableActionBtn: {
    padding: '6px 12px',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  backBtn: {
    marginBottom: '20px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    fontSize: '13px',
  },
  formContainer: {
    padding: '32px',
  },
};
