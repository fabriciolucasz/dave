// apps/dashboard/src/app/dashboard/[guildId]/paineis/PanelConfigForm.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Save, Eye, LayoutGrid } from 'lucide-react';
import { saveContainer } from './actions';
import Link from 'next/link';

interface ContainerType {
  type: string;
  name: string;
  isSticky: boolean;
  description: string;
}

interface PanelConfigFormProps {
  guildId: string;
  channels: Array<{ id: string; name: string }>;
  panelType: ContainerType;
  existingContainer: any | null;
  planFeatures: {
    maxActiveContainers: number;
    customWebhookEnabled: boolean;
    queuePriority: boolean;
    maxBillingAdmins: number;
  };
  currentPlanCode: string;
  onSaveSuccess: (saved: any) => void;
}

export function PanelConfigForm({
  guildId,
  channels,
  panelType,
  existingContainer,
  planFeatures,
  currentPlanCode,
  onSaveSuccess,
}: PanelConfigFormProps) {
  const isPro = planFeatures.customWebhookEnabled;
  const isSticky = panelType.isSticky;

  const initialPayload = existingContainer?.payload || {};

  // Form States
  const [title, setTitle] = useState(initialPayload.title || '');
  const [description, setDescription] = useState(initialPayload.description || '');
  const [accentColor, setAccentColor] = useState(initialPayload.accentColor || '#5865f2');
  const [bannerUrl, setBannerUrl] = useState(initialPayload.bannerUrl || '');
  const [channelId, setChannelId] = useState(existingContainer?.channelId || channels[0]?.id || '');
  const [repostDelay, setRepostDelay] = useState(existingContainer?.repostDelay || 30);

  // Webhook States
  const [webhookName, setWebhookName] = useState(initialPayload.customWebhook?.name || '');
  const [webhookAvatar, setWebhookAvatar] = useState(initialPayload.customWebhook?.avatarUrl || '');

  // Type Specific States
  const [buttonLabel, setButtonLabel] = useState(initialPayload.buttonLabel || '');
  const [showMemberCount, setShowMemberCount] = useState(
    initialPayload.showMemberCount !== undefined ? initialPayload.showMemberCount : true
  );
  const [mentionRoleId, setMentionRoleId] = useState(initialPayload.mentionRoleId || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelId && isSticky) {
      setError('Por favor, selecione o canal de destino.');
      return;
    }

    setSaving(true);
    setError(null);

    // Constrói payload do container conforme o schema
    const payload: Record<string, any> = {
      type: panelType.type,
      title,
      description,
      accentColor,
      bannerUrl: bannerUrl || undefined,
    };

    // Injeta customWebhook somente se for Pro
    if (isPro && (webhookName || webhookAvatar)) {
      payload.customWebhook = {
        name: webhookName || undefined,
        avatarUrl: webhookAvatar || undefined,
      };
    }

    // Campos específicos por tipo
    if (panelType.type === 'ticket_panel' || panelType.type === 'verification_panel') {
      payload.buttonLabel = buttonLabel || undefined;
    } else if (panelType.type === 'welcome') {
      payload.showMemberCount = showMemberCount;
    } else if (panelType.type === 'announcement') {
      payload.mentionRoleId = mentionRoleId || undefined;
    }

    const res = await saveContainer(guildId, channelId, panelType.type, payload, repostDelay);
    setSaving(false);

    if (res.success) {
      // Simula retorno do container salvo
      onSaveSuccess({
        id: existingContainer?.id || Math.random().toString(),
        channelId,
        type: panelType.type,
        messageId: existingContainer?.messageId || null,
        createdAt: new Date().toISOString(),
        isActive: true,
        payload,
      });
    } else {
      setError(res.error || 'Falha ao salvar painel.');
    }
  };

  return (
    <div style={styles.splitLayout}>
      {/* Coluna 1: Formulário */}
      <div style={styles.formCol}>
        <h3 style={styles.formTitle}>Configurar Painel: {panelType.name}</h3>
        <p style={styles.formSubtitle}>{panelType.description}</p>

        {error && <div style={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Identidade Visual Comum */}
          <div style={styles.sectionHeader}>Visual & Estética</div>

          <div className="form-group">
            <label className="form-label">Título do Painel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Digite o título do painel"
              className="form-control"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Descrição / Mensagem</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Use markdown para formatar (ex: **negrito**, \`código\`)"
              className="form-control"
              rows={4}
              style={{ resize: 'vertical' }}
              required
            />
          </div>

          <div style={styles.row}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Cor de Destaque</label>
              <div style={styles.colorPickerWrapper}>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={styles.colorInput}
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="form-control"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
            </div>

            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Canal de Destino</label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="form-control"
              >
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    #{ch.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">URL da Imagem do Banner (Opcional)</label>
            <input
              type="url"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://exemplo.com/imagem.png"
              className="form-control"
            />
          </div>

          {/* Configurações Específicas do Tipo */}
          <div style={styles.sectionHeader}>Configurações de Função</div>

          {(panelType.type === 'ticket_panel' || panelType.type === 'verification_panel') && (
            <div className="form-group">
              <label className="form-label">Texto do Botão Interativo</label>
              <input
                type="text"
                value={buttonLabel}
                onChange={(e) => setButtonLabel(e.target.value)}
                placeholder={panelType.type === 'ticket_panel' ? 'Criar Ticket' : 'Verificar-se'}
                className="form-control"
              />
            </div>
          )}

          {panelType.type === 'welcome' && (
            <div className="form-group" style={styles.checkboxGroup}>
              <input
                type="checkbox"
                id="showMemberCount"
                checked={showMemberCount}
                onChange={(e) => setShowMemberCount(e.target.checked)}
                style={styles.checkbox}
              />
              <label htmlFor="showMemberCount" style={styles.checkboxLabel}>
                Exibir contagem total de membros na mensagem
              </label>
            </div>
          )}

          {panelType.type === 'announcement' && (
            <div className="form-group">
              <label className="form-label">ID da Role para Mencionador (Opcional)</label>
              <input
                type="text"
                value={mentionRoleId}
                onChange={(e) => setMentionRoleId(e.target.value)}
                placeholder="Ex: 123456789012345678"
                className="form-control"
              />
            </div>
          )}

          {isSticky && (
            <div className="form-group">
              <label className="form-label">Intervalo de Repostagem (Segundos)</label>
              <select
                value={repostDelay}
                onChange={(e) => setRepostDelay(Number(e.target.value))}
                className="form-control"
              >
                <option value={10}>10 segundos</option>
                <option value={30}>30 segundos (Recomendado)</option>
                <option value={60}>1 minuto</option>
                <option value={300}>5 minutos</option>
              </select>
            </div>
          )}

          {/* Webhook customizado (PRO GATE) */}
          <div style={styles.sectionHeader}>
            <span>Webhook Customizado (Identidade Própria)</span>
            {!isPro && <span style={styles.proBadge}><Sparkles size={10} /> Recurso Pro</span>}
          </div>

          <div style={isPro ? {} : styles.proDisabledWrapper}>
            <div className="form-group">
              <label className="form-label">Nome do Webhook</label>
              <input
                type="text"
                value={webhookName}
                onChange={(e) => setWebhookName(e.target.value)}
                placeholder="Ex: Suporte Dave"
                className="form-control"
                disabled={!isPro}
              />
            </div>

            <div className="form-group">
              <label className="form-label">URL da Imagem do Avatar</label>
              <input
                type="url"
                value={webhookAvatar}
                onChange={(e) => setWebhookAvatar(e.target.value)}
                placeholder="https://exemplo.com/avatar.png"
                className="form-control"
                disabled={!isPro}
              />
            </div>

            {!isPro && (
              <div style={styles.proOverlay}>
                <Sparkles size={24} style={{ color: '#ffc44f', marginBottom: '8px' }} />
                <h4 style={styles.proOverlayTitle}>Disponível apenas no plano Pro</h4>
                <p style={styles.proOverlayText}>
                  Personalize a imagem e o nome do remetente das mensagens do bot para combinar com a identidade visual da sua comunidade.
                </p>
                <Link href={`/dashboard/${guildId}/subscription`} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                  Fazer Upgrade para Pro
                </Link>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={styles.submitBtn}
          >
            <Save size={16} aria-hidden="true" />
            {saving ? 'Salvando Painel...' : 'Salvar e Publicar no Discord'}
          </button>
        </form>
      </div>

      {/* Coluna 2: Preview em Tempo Real */}
      <div style={styles.previewCol}>
        <div style={styles.previewHeader}>
          <Eye size={16} aria-hidden="true" /> Preview no Discord (Tempo Real)
        </div>

        <div style={styles.discordMessageWrapper}>
          {/* Discord User Avatar */}
          <div style={styles.discordAvatar}>
            {isPro && webhookAvatar ? (
              <img src={webhookAvatar} alt="Webhook Avatar" style={styles.avatarImg} />
            ) : (
              <div style={styles.discordAvatarPlaceholder}>D</div>
            )}
          </div>

          {/* Discord Content */}
          <div style={styles.discordContent}>
            <div style={styles.discordUserHeader}>
              <span style={styles.discordUsername}>
                {isPro && webhookName ? webhookName : 'Dave'}
              </span>
              <span style={styles.discordBotTag}>BOT</span>
              <span style={styles.discordTimestamp}>Hoje às 19:40</span>
            </div>

            {/* Discord Embed */}
            <div style={{ ...styles.discordEmbed, borderLeftColor: accentColor }}>
              {title && <div style={styles.discordEmbedTitle}>{title}</div>}
              {description && (
                <div style={styles.discordEmbedDesc}>
                  {description.split('\n').map((line: string, idx: number) => (
                    <div key={idx}>{line}</div>
                  ))}
                </div>
              )}
              {bannerUrl && (
                <div style={styles.discordEmbedImageWrapper}>
                  <img src={bannerUrl} alt="Banner" style={styles.discordEmbedImage} />
                </div>
              )}
            </div>

            {/* Discord Buttons */}
            {(panelType.type === 'ticket_panel' || panelType.type === 'verification_panel') && (
              <div style={styles.discordButtons}>
                <div
                  style={{
                    ...styles.discordButton,
                    backgroundColor: panelType.type === 'ticket_panel' ? '#5865f2' : '#248046',
                  }}
                >
                  {buttonLabel || (panelType.type === 'ticket_panel' ? 'Criar Ticket' : 'Verificar-se')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  splitLayout: {
    display: 'flex',
    gap: '40px',
    flexWrap: 'wrap',
  },
  formCol: {
    flex: 1,
    minWidth: '340px',
  },
  previewCol: {
    flex: 1,
    minWidth: '340px',
    borderLeft: '1px solid rgba(255, 255, 255, 0.05)',
    paddingLeft: '40px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formTitle: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#ffffff',
    marginBottom: '8px',
  },
  formSubtitle: {
    fontSize: '13px',
    color: '#949ba4',
    marginBottom: '24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sectionHeader: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#5865f2',
    borderBottom: '1px solid rgba(88, 101, 242, 0.2)',
    paddingBottom: '8px',
    marginTop: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  row: {
    display: 'flex',
    gap: '16px',
  },
  colorPickerWrapper: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  colorInput: {
    width: '40px',
    height: '40px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    background: 'none',
    padding: 0,
  },
  submitBtn: {
    marginTop: '16px',
    padding: '12px',
    fontSize: '14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 700,
  },
  proBadge: {
    background: 'rgba(255, 196, 79, 0.15)',
    color: '#ffc44f',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  proDisabledWrapper: {
    position: 'relative',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  proOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(10, 11, 16, 0.9)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '20px',
    border: '1px solid rgba(255, 196, 79, 0.2)',
    borderRadius: '8px',
    zIndex: 10,
  },
  proOverlayTitle: {
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 700,
    marginBottom: '4px',
  },
  proOverlayText: {
    color: '#949ba4',
    fontSize: '12px',
    maxWidth: '260px',
    marginBottom: '16px',
    lineHeight: '1.4',
  },
  previewHeader: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#949ba4',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  discordMessageWrapper: {
    background: '#313338',
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    gap: '16px',
    fontFamily: 'Inter, sans-serif',
  },
  discordAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  discordAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    background: '#5865f2',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '18px',
  },
  discordContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  discordUserHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  discordUsername: {
    color: '#f2f3f5',
    fontWeight: 600,
    fontSize: '14px',
  },
  discordBotTag: {
    background: '#5865f2',
    color: '#ffffff',
    padding: '2px 4px',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: 700,
  },
  discordTimestamp: {
    color: '#949ba4',
    fontSize: '11px',
  },
  discordEmbed: {
    background: '#2b2d31',
    borderLeft: '4px solid #5865f2',
    borderRadius: '4px',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '450px',
  },
  discordEmbedTitle: {
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 700,
  },
  discordEmbedDesc: {
    color: '#dbdee1',
    fontSize: '13px',
    lineHeight: '1.4',
    whiteSpace: 'pre-wrap',
  },
  discordEmbedImageWrapper: {
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '4px',
  },
  discordEmbedImage: {
    width: '100%',
    maxHeight: '200px',
    objectFit: 'cover',
  },
  discordButtons: {
    display: 'flex',
    gap: '8px',
    marginTop: '6px',
  },
  discordButton: {
    padding: '8px 16px',
    borderRadius: '3px',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none',
  },
  errorAlert: {
    background: 'rgba(218, 55, 60, 0.15)',
    border: '1px solid rgba(218, 55, 60, 0.3)',
    color: '#f25c60',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '20px',
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: '#5865f2',
    cursor: 'pointer',
  },
  checkboxLabel: {
    fontSize: '13px',
    color: '#f2f3f5',
    fontWeight: 500,
    cursor: 'pointer',
  },
};
