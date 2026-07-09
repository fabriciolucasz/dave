// apps/dashboard/src/app/dashboard/[guildId]/settings/SettingsForm.tsx
'use client';

import { useState } from 'react';
import { saveGuildSettings } from './actions';

interface DiscordChannel {
  id: string;
  name: string;
}

interface DiscordRole {
  id: string;
  name: string;
}

interface SettingsFormProps {
  guildId: string;
  initialChannelId: string | null;
  initialRoleIds: string[];
  channels: DiscordChannel[];
  roles: DiscordRole[];
}

export function SettingsForm({
  guildId,
  initialChannelId,
  initialRoleIds,
  channels,
  roles,
}: SettingsFormProps) {
  const [defaultChannelId, setDefaultChannelId] = useState(initialChannelId || '');
  const [allowedRoleIds, setAllowedRoleIds] = useState<string[]>(initialRoleIds);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRoleToggle = (roleId: string) => {
    if (allowedRoleIds.includes(roleId)) {
      setAllowedRoleIds(allowedRoleIds.filter((id) => id !== roleId));
    } else {
      setAllowedRoleIds([...allowedRoleIds, roleId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const result = await saveGuildSettings(guildId, {
      defaultChannelId,
      allowedRoleIds,
    });

    setLoading(false);
    if (result.success) {
      setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Falha ao salvar configurações.' });
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {message && (
        <div
          style={{
            ...styles.alert,
            background: message.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: message.type === 'success' ? '#2ec46d' : '#f25c60',
            borderColor: message.type === 'success' ? 'rgba(35, 165, 90, 0.2)' : 'rgba(218, 55, 60, 0.2)',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Canal Padrão */}
      <div className="form-group">
        <label className="form-label">Canal Padrão</label>
        <p style={styles.helpText}>Canal onde o bot enviará mensagens e anúncios padrão do sistema.</p>
        <select
          value={defaultChannelId}
          onChange={(e) => setDefaultChannelId(e.target.value)}
          className="form-control"
          required
        >
          <option value="" disabled>Escolha um canal de texto...</option>
          {channels.map((ch) => (
            <option key={ch.id} value={ch.id}>
              #{ch.name}
            </option>
          ))}
        </select>
      </div>

      {/* Cargos de Acesso */}
      <div className="form-group">
        <label className="form-label">Cargos Autorizados</label>
        <p style={styles.helpText}>Selecione quais cargos têm permissão para interagir e executar comandos administrativos do bot.</p>
        <div style={styles.rolesGrid}>
          {roles.map((role) => {
            const isChecked = allowedRoleIds.includes(role.id);
            return (
              <label
                key={role.id}
                style={{
                  ...styles.roleCard,
                  background: isChecked ? 'rgba(88, 101, 242, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                  borderColor: isChecked ? 'var(--accent)' : 'var(--border)',
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleRoleToggle(role.id)}
                  style={styles.checkbox}
                />
                <span style={styles.roleName}>{role.name}</span>
              </label>
            );
          })}
          {roles.length === 0 && (
            <p style={styles.noRoles}>Nenhum cargo encontrado neste servidor.</p>
          )}
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading} style={styles.submitBtn}>
        {loading ? 'Salvando...' : 'Salvar Configuração'}
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    maxWidth: '640px',
    width: '100%',
  },
  helpText: {
    fontSize: '13px',
    color: '#949ba4',
    marginBottom: '4px',
  },
  alert: {
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '14px',
    fontWeight: 600,
    animation: 'fadeIn 0.2s ease',
  },
  rolesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '12px',
    maxHeight: '260px',
    overflowY: 'auto',
    padding: '4px',
    background: 'rgba(0, 0, 0, 0.15)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
  },
  roleCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '6px',
    border: '1px solid',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'all 0.2s ease',
  },
  checkbox: {
    cursor: 'pointer',
    width: '16px',
    height: '16px',
    accentColor: 'var(--accent)',
  },
  roleName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  noRoles: {
    gridColumn: '1 / -1',
    padding: '24px',
    textAlign: 'center',
    color: '#6e7681',
    fontSize: '14px',
  },
  submitBtn: {
    alignSelf: 'flex-start',
    padding: '12px 24px',
  },
};
