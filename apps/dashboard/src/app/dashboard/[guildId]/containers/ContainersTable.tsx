// apps/dashboard/src/app/dashboard/[guildId]/containers/ContainersTable.tsx
'use client';

import { useState } from 'react';
import { disableContainer } from './actions';

interface ContainerItem {
  id: string;
  channelId: string;
  channelName: string;
  type: string;
  messageId: string | null;
  createdAt: string;
}

interface ContainersTableProps {
  guildId: string;
  initialContainers: ContainerItem[];
}

export function ContainersTable({ guildId, initialContainers }: ContainersTableProps) {
  const [containers, setContainers] = useState<ContainerItem[]>(initialContainers);
  const [disablingId, setDisablingId] = useState<string | null>(null);

  const handleDisable = async (containerId: string) => {
    if (!confirm('Deseja realmente desativar esta mensagem persistente? Ela será excluída do canal no Discord.')) {
      return;
    }

    setDisablingId(containerId);
    const result = await disableContainer(guildId, containerId);
    setDisablingId(null);

    if (result.success) {
      setContainers(containers.filter((c) => c.id !== containerId));
    } else {
      alert(result.error || 'Falha ao desativar container.');
    }
  };

  if (containers.length === 0) {
    return (
      <div style={styles.emptyContainer} className="animate-fade-in">
        <span style={styles.emptyIcon}>📦</span>
        <h3 style={styles.emptyTitle}>Nenhum container persistente</h3>
        <p style={styles.emptyText}>
          Não existem mensagens persistentes ("sticky messages") ativas neste servidor no momento.
        </p>
        <p style={styles.emptyHelp}>
          Para criar uma nova, utilize o comando do bot diretamente no Discord:<br />
          <code>**`/container create`**</code>
        </p>
      </div>
    );
  }

  return (
    <div style={styles.tableWrapper} className="animate-fade-in">
      <table style={styles.table}>
        <thead>
          <tr style={styles.trHead}>
            <th style={styles.th}>Tipo</th>
            <th style={styles.th}>Canal</th>
            <th style={styles.th}>Message ID</th>
            <th style={styles.th}>Criado Em</th>
            <th style={styles.th}>Ação</th>
          </tr>
        </thead>
        <tbody>
          {containers.map((c) => (
            <tr key={c.id} style={styles.trBody}>
              <td style={styles.td}>
                <span style={styles.typeBadge}>{c.type}</span>
              </td>
              <td style={styles.td}>
                <span style={styles.channelName}>#{c.channelName}</span>
              </td>
              <td style={styles.td}>
                <code style={styles.code}>{c.messageId || 'Pendente (Aguardando repost)'}</code>
              </td>
              <td style={styles.td}>
                {new Date(c.createdAt).toLocaleDateString('pt-BR')}
              </td>
              <td style={styles.td}>
                <button
                  onClick={() => handleDisable(c.id)}
                  disabled={disablingId === c.id}
                  className="btn btn-danger"
                  style={styles.btnDisable}
                >
                  {disablingId === c.id ? 'Desativando...' : 'Desativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  emptyContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '64px 24px',
    background: 'rgba(255, 255, 255, 0.01)',
    border: '1px dashed var(--border)',
    borderRadius: '12px',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
    marginBottom: '8px',
  },
  emptyText: {
    fontSize: '14px',
    color: '#949ba4',
    maxWidth: '440px',
    marginBottom: '12px',
  },
  emptyHelp: {
    fontSize: '13px',
    color: '#6e7681',
    background: 'rgba(0, 0, 0, 0.2)',
    padding: '12px 16px',
    borderRadius: '8px',
    lineHeight: 1.6,
  },
  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
    background: 'rgba(0, 0, 0, 0.15)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  trHead: {
    borderBottom: '1px solid var(--border)',
  },
  th: {
    padding: '16px 24px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#6e7681',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  trBody: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
    transition: 'background 0.2s ease',
  },
  td: {
    padding: '16px 24px',
    fontSize: '14px',
    color: '#f2f3f5',
    verticalAlign: 'middle',
  },
  typeBadge: {
    background: 'rgba(88, 101, 242, 0.15)',
    color: '#5865f2',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  channelName: {
    fontWeight: 600,
  },
  code: {
    fontFamily: 'monospace',
    color: '#f0b232',
    background: 'rgba(240, 178, 50, 0.05)',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
  },
  btnDisable: {
    padding: '6px 12px',
    fontSize: '12px',
  },
};
