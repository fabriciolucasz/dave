// apps/dashboard/src/app/dashboard/[guildId]/paineis/PanelConfigForm.tsx
'use client';

import React, { useState } from 'react';
import { Sparkles, Save, Eye, Trash2, ArrowUp, ArrowDown, Plus } from 'lucide-react';
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
  guildName: string;
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
  botIdentity?: { username: string; avatarURL: string };
}

type ContainerBlock =
  | { blockType: 'text'; content: string }
  | { blockType: 'separator'; spacing?: 'small' | 'large'; divider?: boolean }
  | { blockType: 'gallery'; items: Array<{ url: string; alt?: string }> }
  | { blockType: 'section'; text: string; accessory?: { type: 'thumbnail' | 'button'; url?: string; label?: string } }
  | { blockType: 'file'; url: string };

const getAvailablePlaceholders = (type: string): string[] => {
  switch (type) {
    case 'welcome':
      return ['welcomeUser', 'serverName', 'memberCount'];
    case 'ticket_panel':
    case 'rules_panel':
    case 'verification_panel':
      return ['serverName'];
    case 'announcement':
      return ['serverName', 'authorName'];
    default:
      return [];
  }
};

const resolvePlaceholders = (text: string, context: Record<string, string>): string => {
  if (!text) return text;
  let resolved = text;
  for (const [key, value] of Object.entries(context)) {
    resolved = resolved.split(`\${${key}}`).join(value);
  }
  return resolved;
};

export function PanelConfigForm({
  guildId,
  guildName,
  channels,
  panelType,
  existingContainer,
  planFeatures,
  currentPlanCode,
  onSaveSuccess,
  botIdentity,
}: PanelConfigFormProps) {
  const isPro = planFeatures.customWebhookEnabled;
  const isSticky = panelType.isSticky;

  const initialPayload = existingContainer?.payload || {};

  // Form States
  const [renderMode, setRenderMode] = useState<'embed' | 'container'>(initialPayload.renderMode || 'embed');
  const [title, setTitle] = useState(initialPayload.title || '');
  const [accentColor, setAccentColor] = useState(initialPayload.accentColor || '#5865f2');
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

  // ---------------------------------------------------------------------------
  // Modo Embed States (Seção 20.1)
  // ---------------------------------------------------------------------------
  const [embedDescription, setEmbedDescription] = useState(initialPayload.description || '');
  const [url, setUrl] = useState(initialPayload.url || '');
  const [imageUrl, setImageUrl] = useState(initialPayload.imageUrl || initialPayload.bannerUrl || '');
  const [thumbnailUrl, setThumbnailUrl] = useState(initialPayload.thumbnailUrl || '');
  const [authorName, setAuthorName] = useState(initialPayload.authorName || '');
  const [authorIconUrl, setAuthorIconUrl] = useState(initialPayload.authorIconUrl || '');
  const [footerText, setFooterText] = useState(initialPayload.footerText || '');
  const [footerIconUrl, setFooterIconUrl] = useState(initialPayload.footerIconUrl || '');
  const [showTimestamp, setShowTimestamp] = useState(!!initialPayload.showTimestamp);
  const [fields, setFields] = useState<Array<{ name: string; value: string; inline?: boolean }>>(initialPayload.fields || []);

  // ---------------------------------------------------------------------------
  // Modo Container States (Seção 20.2)
  // ---------------------------------------------------------------------------
  const [blocks, setBlocks] = useState<ContainerBlock[]>(() => {
    if (initialPayload.blocks && initialPayload.blocks.length > 0) {
      return initialPayload.blocks;
    }
    // Converte legado se houver
    const migrated: ContainerBlock[] = [];
    if (initialPayload.description) {
      migrated.push({ blockType: 'text', content: initialPayload.description });
    }
    if (initialPayload.bannerUrl) {
      migrated.push({ blockType: 'gallery', items: [{ url: initialPayload.bannerUrl }] });
    }
    return migrated.length > 0 ? migrated : [{ blockType: 'text', content: '' }];
  });

  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(0);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeholders = getAvailablePlaceholders(panelType.type);

  // Remetente do Preview
  const botName = webhookName || botIdentity?.username || 'Dave';
  const botAvatar = webhookAvatar || botIdentity?.avatarURL || '';

  const mockContext = {
    welcomeUser: '@Fulano',
    serverName: guildName,
    memberCount: '1,234',
    authorName: 'Administrador',
  };

  const insertPlaceholderInDescription = (placeholder: string) => {
    const input = document.getElementById('field-embed-description') as HTMLTextAreaElement | null;
    if (!input) {
      setEmbedDescription((prev: string) => prev + `\${${placeholder}}`);
      return;
    }
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const text = input.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const newValue = before + `\${${placeholder}}` + after;
    setEmbedDescription(newValue);

    setTimeout(() => {
      input.focus();
      const newPos = start + placeholder.length + 3;
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const insertPlaceholderInBlock = (index: number, placeholder: string) => {
    const input = document.getElementById(`block-editor-${index}`) as HTMLTextAreaElement | null;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const text = input.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const newValue = before + `\${${placeholder}}` + after;
    
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], content: newValue } as any;
    setBlocks(newBlocks);

    setTimeout(() => {
      input.focus();
      const newPos = start + placeholder.length + 3;
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const insertMarkdownInBlock = (index: number, syntaxBefore: string, syntaxAfter: string) => {
    const input = document.getElementById(`block-editor-${index}`) as HTMLTextAreaElement | null;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const text = input.value;
    const selected = text.substring(start, end);
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const newValue = before + syntaxBefore + selected + syntaxAfter + after;

    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], content: newValue } as any;
    setBlocks(newBlocks);

    setTimeout(() => {
      input.focus();
      const newStart = start + syntaxBefore.length;
      const newEnd = newStart + selected.length;
      input.setSelectionRange(newStart, newEnd);
    }, 0);
  };

  const addBlock = (type: ContainerBlock['blockType']) => {
    let newBlock: ContainerBlock;
    if (type === 'text') {
      newBlock = { blockType: 'text', content: '' };
    } else if (type === 'separator') {
      newBlock = { blockType: 'separator', spacing: 'small', divider: true };
    } else if (type === 'gallery') {
      newBlock = { blockType: 'gallery', items: [{ url: '', alt: '' }] };
    } else if (type === 'section') {
      newBlock = { blockType: 'section', text: '' };
    } else {
      newBlock = { blockType: 'file', url: '' };
    }
    const updated = [...blocks, newBlock];
    setBlocks(updated);
    setEditingBlockIndex(updated.length - 1);
  };

  const removeBlock = (index: number) => {
    setBlocks(blocks.filter((_, idx) => idx !== index));
    if (editingBlockIndex === index) {
      setEditingBlockIndex(null);
    }
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= blocks.length) return;
    const updated = [...blocks];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setBlocks(updated);
    if (editingBlockIndex === index) setEditingBlockIndex(targetIdx);
    else if (editingBlockIndex === targetIdx) setEditingBlockIndex(index);
  };

  const renderDiscordMarkdown = (text: string) => {
    if (!text) return null;

    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Spoilers: ||texto||
    html = html.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="discord-spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

    // Code blocks: ```js ... ```
    html = html.replace(/```([\s\S]+?)```/g, '<pre class="discord-codeblock">$1</pre>');

    // Inline code: `código`
    html = html.replace(/`([^`\n]+?)`/g, '<code class="discord-inlinecode">$1</code>');

    // Bold: **texto**
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');

    // Italic: *texto* or _texto_
    html = html.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');
    html = html.replace(/_([\s\S]+?)_/g, '<em>$1</em>');

    // Underline: __texto__
    html = html.replace(/__([\s\S]+?)__/g, '<u>$1</u>');

    // Strike: ~~texto~~
    html = html.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');

    // Quotes: > texto
    html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote class="discord-quote">$1</blockquote>');

    // Headers: ## texto
    html = html.replace(/^##\s+(.*)$/gm, '<h2 class="discord-h2">$1</h2>');
    html = html.replace(/^#\s+(.*)$/gm, '<h1 class="discord-h1">$1</h1>');

    // Mentions
    html = html.replace(/&lt;#(\d+)&gt;/g, '<span class="discord-mention">#canal</span>');
    html = html.replace(/&lt;@&amp;?(\d+)&gt;/g, '<span class="discord-mention">@cargo</span>');
    html = html.replace(/&lt;@(!?\d+)&gt;/g, '<span class="discord-mention">@membro</span>');

    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelId && isSticky) {
      setError('Por favor, selecione o canal de destino.');
      return;
    }

    setSaving(true);
    setError(null);

    // Constrói payload dinâmico
    const payload: Record<string, any> = {
      type: panelType.type,
      renderMode,
      accentColor,
      customWebhook: isPro && (webhookName || webhookAvatar) ? {
        name: webhookName || undefined,
        avatarUrl: webhookAvatar || undefined,
      } : undefined,
    };

    if (renderMode === 'embed') {
      payload.title = title || undefined;
      payload.description = embedDescription || undefined;
      payload.url = url || undefined;
      payload.imageUrl = imageUrl || undefined;
      payload.thumbnailUrl = thumbnailUrl || undefined;
      payload.authorName = authorName || undefined;
      payload.authorIconUrl = authorIconUrl || undefined;
      payload.footerText = footerText || undefined;
      payload.footerIconUrl = footerIconUrl || undefined;
      payload.showTimestamp = showTimestamp;
      payload.fields = fields.length > 0 ? fields : undefined;
    } else {
      payload.title = title || undefined;
      payload.blocks = blocks;
    }

    // Campos adicionais específicos por tipo
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
      <style>{`
        .discord-spoiler {
          background: #1e1f22;
          color: #1e1f22;
          border-radius: 3px;
          padding: 0 4px;
          cursor: pointer;
          transition: background 0.1s ease, color 0.1s ease;
          user-select: none;
        }
        .discord-spoiler.revealed {
          background: rgba(255, 255, 255, 0.1);
          color: inherit;
          user-select: text;
        }
        .discord-codeblock {
          background: #1e1f22;
          border: 1px solid #2b2d31;
          border-radius: 4px;
          padding: 8px;
          font-family: Consolas, monospace;
          font-size: 12px;
          color: #dbdee1;
          margin: 6px 0;
          white-space: pre-wrap;
        }
        .discord-inlinecode {
          background: #1e1f22;
          padding: 2px 4px;
          border-radius: 3px;
          font-family: Consolas, monospace;
          font-size: 12px;
          color: #dbdee1;
        }
        .discord-mention {
          background: rgba(88, 101, 242, 0.3);
          color: #c9cdfb;
          font-weight: 500;
          padding: 0 4px;
          border-radius: 3px;
        }
        .discord-quote {
          border-left: 4px solid #4e5058;
          padding-left: 8px;
          margin: 4px 0;
          color: #949ba4;
        }
        .discord-h1 {
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
          margin-top: 8px;
          margin-bottom: 4px;
        }
        .discord-h2 {
          font-size: 16px;
          font-weight: 700;
          color: #ffffff;
          margin-top: 6px;
          margin-bottom: 4px;
        }
      `}</style>

      {/* Coluna 1: Formulário */}
      <div style={styles.formCol}>
        <h3 style={styles.formTitle}>Configurar Painel: {panelType.name}</h3>
        <p style={styles.formSubtitle}>{panelType.description}</p>

        {error && <div style={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.sectionHeader}>Visual & Estética</div>

          {/* Toggle de Modo */}
          <div className="form-group">
            <label className="form-label">Modo de Renderização</label>
            <div style={styles.toggleGroup}>
              <button
                type="button"
                onClick={() => setRenderMode('embed')}
                style={{
                  ...styles.toggleBtn,
                  ...(renderMode === 'embed' ? styles.toggleBtnActive : {}),
                }}
              >
                Embed Tradicional
              </button>
              <button
                type="button"
                onClick={() => setRenderMode('container')}
                style={{
                  ...styles.toggleBtn,
                  ...(renderMode === 'container' ? styles.toggleBtnActive : {}),
                }}
              >
                Layout de Container
              </button>
            </div>
            <p style={styles.helpText}>
              {renderMode === 'embed'
                ? 'Estilo clássico do Discord estruturado via campos de EmbedBuilder.'
                : 'Interface modular flexível estruturada por blocos interativos reordenáveis.'}
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Título Geral do Painel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Digite o título principal"
              className="form-control"
            />
          </div>

          {/* -------------------------------------------------------------------
              FORMULÁRIO DO MODO EMBED (Seção 20.1)
             ------------------------------------------------------------------- */}
          {renderMode === 'embed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group">
                <label className="form-label">Descrição (Descrição do Embed)</label>
                <textarea
                  id="field-embed-description"
                  value={embedDescription}
                  onChange={(e) => setEmbedDescription(e.target.value)}
                  placeholder="Conteúdo descritivo. Aceita variáveis e markdown."
                  className="form-control"
                  rows={4}
                  required
                />
                {placeholders.length > 0 && (
                  <div style={styles.placeholdersContainer}>
                    {placeholders.map((ph) => (
                      <button
                        type="button"
                        key={ph}
                        onClick={() => insertPlaceholderInDescription(ph)}
                        style={styles.placeholderBtn}
                      >
                        + {`\${${ph}}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={styles.row}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Link do Título (URL)</label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://exemplo.com"
                    className="form-control"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Miniatura (Thumbnail URL)</label>
                  <input
                    type="url"
                    value={thumbnailUrl}
                    onChange={(e) => setThumbnailUrl(e.target.value)}
                    placeholder="https://exemplo.com/thumb.png"
                    className="form-control"
                  />
                </div>
              </div>

              <div style={styles.row}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Nome do Autor</label>
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Nome do Autor"
                    className="form-control"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Ícone do Autor (URL)</label>
                  <input
                    type="url"
                    value={authorIconUrl}
                    onChange={(e) => setAuthorIconUrl(e.target.value)}
                    placeholder="https://exemplo.com/icon.png"
                    className="form-control"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Imagem Principal (Image URL)</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://exemplo.com/banner.png"
                  className="form-control"
                />
              </div>

              <div style={styles.row}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Texto do Rodapé</label>
                  <input
                    type="text"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="Texto do rodapé"
                    className="form-control"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Ícone do Rodapé (URL)</label>
                  <input
                    type="url"
                    value={footerIconUrl}
                    onChange={(e) => setFooterIconUrl(e.target.value)}
                    placeholder="https://exemplo.com/footer-icon.png"
                    className="form-control"
                  />
                </div>
              </div>

              <div className="form-group" style={styles.checkboxGroup}>
                <input
                  type="checkbox"
                  id="field-showTimestamp"
                  checked={showTimestamp}
                  onChange={(e) => setShowTimestamp(e.target.checked)}
                  style={styles.checkbox}
                />
                <label htmlFor="field-showTimestamp" style={styles.checkboxLabel}>
                  Exibir Horário Atual no Rodapé (Timestamp)
                </label>
              </div>

              {/* Seção de Campos (Fields) */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', background: 'rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>Campos Customizados (Fields)</span>
                  <button
                    type="button"
                    onClick={() => setFields([...fields, { name: '', value: '', inline: false }])}
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                  >
                    + Adicionar Campo
                  </button>
                </div>

                {fields.length === 0 ? (
                  <p style={{ fontSize: '11px', color: '#949ba4', textAlign: 'center', padding: '12px 0' }}>Nenhum campo adicionado.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {fields.map((f, fIdx) => (
                      <div key={fIdx} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '8px' }}>
                        <input
                          type="text"
                          placeholder="Nome"
                          value={f.name}
                          onChange={(e) => {
                            const updated = [...fields];
                            updated[fIdx].name = e.target.value;
                            setFields(updated);
                          }}
                          className="form-control"
                          style={{ flex: 1, minWidth: '100px', fontSize: '12px', padding: '6px' }}
                          required
                        />
                        <input
                          type="text"
                          placeholder="Valor"
                          value={f.value}
                          onChange={(e) => {
                            const updated = [...fields];
                            updated[fIdx].value = e.target.value;
                            setFields(updated);
                          }}
                          className="form-control"
                          style={{ flex: 2, minWidth: '150px', fontSize: '12px', padding: '6px' }}
                          required
                        />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#dbdee1', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={f.inline || false}
                            onChange={(e) => {
                              const updated = [...fields];
                              updated[fIdx].inline = e.target.checked;
                              setFields(updated);
                            }}
                          />
                          Inline
                        </label>
                        <button
                          type="button"
                          onClick={() => setFields(fields.filter((_, idx) => idx !== fIdx))}
                          style={{ background: 'none', border: 'none', color: '#da373c', cursor: 'pointer', padding: '4px' }}
                          title="Remover Campo"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------------
              CONSTRUTOR DE BLOCOS INTERATIVO (Seção 20.2)
             ------------------------------------------------------------------- */}
          {renderMode === 'container' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>Blocos do Layout de Container</span>

              {blocks.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '8px', color: '#949ba4' }}>
                  Nenhum bloco no layout. Use o painel abaixo para começar.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {blocks.map((block, index) => {
                    const isEditing = editingBlockIndex === index;
                    return (
                      <div key={index} style={{ border: '1px solid var(--border)', borderRadius: '8px', background: isEditing ? 'rgba(88, 101, 242, 0.05)' : 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                        {/* Header do Card do Bloco */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ textTransform: 'uppercase', fontSize: '9px', fontWeight: 800, background: '#4e5058', padding: '2px 6px', borderRadius: '3px', color: '#ffffff' }}>
                              {block.blockType === 'text' && 'Texto'}
                              {block.blockType === 'separator' && 'Divisor'}
                              {block.blockType === 'gallery' && 'Galeria'}
                              {block.blockType === 'section' && 'Seção'}
                              {block.blockType === 'file' && 'Anexo'}
                            </span>
                            <span style={{ fontSize: '12px', color: '#dbdee1', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {block.blockType === 'text' && (block.content || 'Vazio')}
                              {block.blockType === 'separator' && (block.divider ? 'Linha visível' : 'Espaço em branco')}
                              {block.blockType === 'gallery' && `${block.items?.length || 0} imagem(ns)`}
                              {block.blockType === 'section' && (block.text || 'Vazia')}
                              {block.blockType === 'file' && (block.url || 'Sem arquivo')}
                            </span>
                          </div>

                          {/* Ações do Bloco */}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => moveBlock(index, 'up')}
                              disabled={index === 0}
                              style={{ background: 'none', border: 'none', color: index === 0 ? '#4e5058' : '#ffffff', cursor: index === 0 ? 'default' : 'pointer', padding: '4px' }}
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveBlock(index, 'down')}
                              disabled={index === blocks.length - 1}
                              style={{ background: 'none', border: 'none', color: index === blocks.length - 1 ? '#4e5058' : '#ffffff', cursor: index === blocks.length - 1 ? 'default' : 'pointer', padding: '4px' }}
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingBlockIndex(isEditing ? null : index)}
                              className="btn btn-secondary"
                              style={{ padding: '2px 8px', fontSize: '10px' }}
                            >
                              {isEditing ? 'Fechar' : 'Editar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeBlock(index)}
                              style={{ background: 'none', border: 'none', color: '#da373c', cursor: 'pointer', padding: '4px' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Corpo/Editor Expandido */}
                        {isEditing && (
                          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Editor de Bloco de Texto */}
                            {block.blockType === 'text' && (
                              <div className="form-group">
                                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>Conteúdo do Texto</span>
                                  {/* Toolbar de Formatação */}
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button type="button" onClick={() => insertMarkdownInBlock(index, '**', '**')} style={styles.toolbarBtn} title="Negrito">B</button>
                                    <button type="button" onClick={() => insertMarkdownInBlock(index, '*', '*')} style={styles.toolbarBtn} title="Itálico">I</button>
                                    <button type="button" onClick={() => insertMarkdownInBlock(index, '__', '__')} style={styles.toolbarBtn} title="Sublinhado">U</button>
                                    <button type="button" onClick={() => insertMarkdownInBlock(index, '~~', '~~')} style={styles.toolbarBtn} title="Riscado">S</button>
                                    <button type="button" onClick={() => insertMarkdownInBlock(index, '||', '||')} style={styles.toolbarBtn} title="Spoiler">Spoiler</button>
                                    <button type="button" onClick={() => insertMarkdownInBlock(index, '`', '`')} style={styles.toolbarBtn} title="Código Inline">`</button>
                                    <button type="button" onClick={() => insertMarkdownInBlock(index, '```\n', '\n```')} style={styles.toolbarBtn} title="Bloco de Código">Bloco</button>
                                  </div>
                                </label>
                                <textarea
                                  id={`block-editor-${index}`}
                                  value={block.content}
                                  onChange={(e) => {
                                    const updated = [...blocks];
                                    updated[index] = { ...block, content: e.target.value };
                                    setBlocks(updated);
                                  }}
                                  placeholder="Digite o texto. Suporta markdown."
                                  className="form-control"
                                  rows={4}
                                  required
                                />
                                {placeholders.length > 0 && (
                                  <div style={styles.placeholdersContainer}>
                                    {placeholders.map((ph) => (
                                      <button
                                        type="button"
                                        key={ph}
                                        onClick={() => insertPlaceholderInBlock(index, ph)}
                                        style={styles.placeholderBtn}
                                      >
                                        + {`\${${ph}}`}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Editor de Divisor */}
                            {block.blockType === 'separator' && (
                              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                  <label className="form-label">Espaçamento</label>
                                  <select
                                    value={block.spacing || 'small'}
                                    onChange={(e) => {
                                      const updated = [...blocks];
                                      updated[index] = { ...block, spacing: e.target.value as any };
                                      setBlocks(updated);
                                    }}
                                    className="form-control"
                                  >
                                    <option value="small">Pequeno (Small)</option>
                                    <option value="large">Grande (Large)</option>
                                  </select>
                                </div>
                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '24px' }}>
                                  <input
                                    type="checkbox"
                                    id={`sep-line-${index}`}
                                    checked={block.divider !== false}
                                    onChange={(e) => {
                                      const updated = [...blocks];
                                      updated[index] = { ...block, divider: e.target.checked };
                                      setBlocks(updated);
                                    }}
                                    style={styles.checkbox}
                                  />
                                  <label htmlFor={`sep-line-${index}`} style={styles.checkboxLabel}>Exibir linha divisória</label>
                                </div>
                              </div>
                            )}

                            {/* Editor de Galeria */}
                            {block.blockType === 'gallery' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 700 }}>Imagens da Galeria</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...blocks];
                                      const currentItems = (block.items || []);
                                      updated[index] = { ...block, items: [...currentItems, { url: '', alt: '' }] };
                                      setBlocks(updated);
                                    }}
                                    className="btn btn-secondary"
                                    style={{ padding: '2px 8px', fontSize: '9px' }}
                                  >
                                    + Adicionar Imagem
                                  </button>
                                </div>

                                {(block.items || []).map((item, imgIdx) => (
                                  <div key={imgIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input
                                      type="url"
                                      placeholder="URL da Imagem"
                                      value={item.url}
                                      onChange={(e) => {
                                        const updated = [...blocks];
                                        const newItems = [...(block.items || [])];
                                        newItems[imgIdx].url = e.target.value;
                                        updated[index] = { ...block, items: newItems };
                                        setBlocks(updated);
                                      }}
                                      className="form-control"
                                      style={{ flex: 2, fontSize: '12px' }}
                                      required
                                    />
                                    <input
                                      type="text"
                                      placeholder="Alt Text (Acessibilidade)"
                                      value={item.alt}
                                      onChange={(e) => {
                                        const updated = [...blocks];
                                        const newItems = [...(block.items || [])];
                                        newItems[imgIdx].alt = e.target.value;
                                        updated[index] = { ...block, items: newItems };
                                        setBlocks(updated);
                                      }}
                                      className="form-control"
                                      style={{ flex: 1, fontSize: '12px' }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...blocks];
                                        const newItems = (block.items || []).filter((_, iIdx) => iIdx !== imgIdx);
                                        updated[index] = { ...block, items: newItems };
                                        setBlocks(updated);
                                      }}
                                      style={{ background: 'none', border: 'none', color: '#da373c', cursor: 'pointer' }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Editor de Seção */}
                            {block.blockType === 'section' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div className="form-group">
                                  <label className="form-label">Texto da Seção</label>
                                  <input
                                    type="text"
                                    value={block.text}
                                    onChange={(e) => {
                                      const updated = [...blocks];
                                      updated[index] = { ...block, text: e.target.value };
                                      setBlocks(updated);
                                    }}
                                    placeholder="Texto descritivo principal"
                                    className="form-control"
                                    required
                                  />
                                </div>
                                <div style={{ border: '1px dashed var(--border)', borderRadius: '6px', padding: '12px', background: 'rgba(0,0,0,0.1)' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 700, display: 'block', marginBottom: '8px' }}>Acessório Lateral (Opcional)</span>
                                  <div style={styles.row}>
                                    <div className="form-group" style={{ flex: 1 }}>
                                      <label className="form-label" style={{ fontSize: '11px' }}>Tipo</label>
                                      <select
                                        value={block.accessory?.type || ''}
                                        onChange={(e) => {
                                          const updated = [...blocks];
                                          const type = e.target.value as 'thumbnail' | 'button' | '';
                                          updated[index] = {
                                            ...block,
                                            accessory: type ? { type, url: block.accessory?.url || '', label: block.accessory?.label || '' } : undefined,
                                          };
                                          setBlocks(updated);
                                        }}
                                        className="form-control"
                                        style={{ fontSize: '12px' }}
                                      >
                                        <option value="">Nenhum</option>
                                        <option value="thumbnail">Miniatura (Thumbnail)</option>
                                        <option value="button">Botão Acessório</option>
                                      </select>
                                    </div>
                                    {block.accessory?.type && (
                                      <div className="form-group" style={{ flex: 2 }}>
                                        <label className="form-label" style={{ fontSize: '11px' }}>
                                          {block.accessory.type === 'thumbnail' ? 'URL da Imagem' : 'Rótulo / Label'}
                                        </label>
                                        <input
                                          type="text"
                                          value={block.accessory.type === 'thumbnail' ? block.accessory.url : block.accessory.label}
                                          onChange={(e) => {
                                            const updated = [...blocks];
                                            const val = e.target.value;
                                            if (block.accessory) {
                                              const newAcc = { ...block.accessory };
                                              if (block.accessory.type === 'thumbnail') newAcc.url = val;
                                              else newAcc.label = val;
                                              updated[index] = { ...block, accessory: newAcc };
                                            }
                                            setBlocks(updated);
                                          }}
                                          placeholder={block.accessory.type === 'thumbnail' ? 'https://example.com/img.png' : 'Clique Aqui'}
                                          className="form-control"
                                          style={{ fontSize: '12px' }}
                                          required
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Editor de Anexo */}
                            {block.blockType === 'file' && (
                              <div className="form-group">
                                <label className="form-label">URL do Arquivo Anexo</label>
                                <input
                                  type="url"
                                  value={block.url}
                                  onChange={(e) => {
                                    const updated = [...blocks];
                                    updated[index] = { ...block, url: e.target.value };
                                    setBlocks(updated);
                                  }}
                                  placeholder="https://exemplo.com/documento.pdf"
                                  className="form-control"
                                  required
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Adicionar Blocos Menu */}
              <div style={{ border: '1px dashed var(--border)', borderRadius: '8px', padding: '14px', background: 'rgba(0,0,0,0.1)' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#949ba4', textTransform: 'uppercase', display: 'block', marginBottom: '8px', textAlign: 'center' }}>+ Adicionar Componente ao Layout</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                  <button type="button" onClick={() => addBlock('text')} className="btn btn-secondary" style={styles.addBlockBtn}>+ Texto</button>
                  <button type="button" onClick={() => addBlock('separator')} className="btn btn-secondary" style={styles.addBlockBtn}>+ Divisor</button>
                  <button type="button" onClick={() => addBlock('gallery')} className="btn btn-secondary" style={styles.addBlockBtn}>+ Galeria</button>
                  <button type="button" onClick={() => addBlock('section')} className="btn btn-secondary" style={styles.addBlockBtn}>+ Seção</button>
                  <button type="button" onClick={() => addBlock('file')} className="btn btn-secondary" style={styles.addBlockBtn}>+ Anexo</button>
                </div>
              </div>
            </div>
          )}

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
            {botAvatar ? (
              <img src={botAvatar} alt="Bot Avatar" style={styles.avatarImg} />
            ) : (
              <div style={styles.discordAvatarPlaceholder}>
                {botName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          {/* Discord Content */}
          <div style={styles.discordContent}>
            <div style={styles.discordUserHeader}>
              <span style={styles.discordUsername}>
                {botName}
              </span>
              <span style={styles.discordBotTag}>BOT</span>
              <span style={styles.discordTimestamp}>Hoje às 19:40</span>
            </div>

            {/* Discord Embed vs Layout de Container */}
            {renderMode === 'container' ? (
              <div style={styles.discordContainerLayout}>
                {title && (
                  <div style={styles.discordContainerTitle}>
                    {title}
                  </div>
                )}
                {blocks.map((block, bIdx) => {
                  if (block.blockType === 'text') {
                    return (
                      <div key={bIdx} style={{ display: 'contents' }}>
                        <div style={styles.discordContainerSeparator} />
                        <div style={styles.discordContainerDesc}>
                          {renderDiscordMarkdown(resolvePlaceholders(block.content, mockContext))}
                        </div>
                      </div>
                    );
                  }
                  if (block.blockType === 'separator') {
                    return (
                      <div
                        key={bIdx}
                        style={{
                          ...styles.discordContainerSeparator,
                          margin: block.spacing === 'large' ? '20px 0' : '10px 0',
                          background: block.divider ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                        }}
                      />
                    );
                  }
                  if (block.blockType === 'gallery' && block.items && block.items.length > 0) {
                    return (
                      <div key={bIdx} style={{ display: 'contents' }}>
                        <div style={styles.discordContainerSeparator} />
                        <div style={{ display: 'grid', gridTemplateColumns: block.items.length > 1 ? '1fr 1fr' : '1fr', gap: '8px', marginTop: '4px' }}>
                          {block.items.map((item, imgIdx) => item.url && (
                            <div key={imgIdx} style={styles.discordEmbedImageWrapper}>
                              <img src={item.url} alt={item.alt || 'Gallery item'} style={styles.discordEmbedImage} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  if (block.blockType === 'section') {
                    return (
                      <div key={bIdx} style={{ display: 'contents' }}>
                        <div style={styles.discordContainerSeparator} />
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={styles.discordContainerDesc}>
                            {renderDiscordMarkdown(resolvePlaceholders(block.text, mockContext))}
                          </div>
                          {block.accessory?.type === 'thumbnail' && block.accessory.url && (
                            <img src={block.accessory.url} alt="Accessory" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} />
                          )}
                          {block.accessory?.type === 'button' && block.accessory.label && (
                            <div style={{ ...styles.discordButton, backgroundColor: '#4f545c', padding: '6px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                              {block.accessory.label}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (block.blockType === 'file' && block.url) {
                    return (
                      <div key={bIdx} style={{ display: 'contents' }}>
                        <div style={styles.discordContainerSeparator} />
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#2b2d31', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ fontSize: '12px', color: '#5865f2', textDecoration: 'underline', wordBreak: 'break-all' }}>
                            {block.url}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            ) : (
              // Embed Tradicional Preview
              <div style={{ ...styles.discordEmbed, borderLeftColor: accentColor }}>
                {authorName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    {authorIconUrl && <img src={authorIconUrl} alt="Author Icon" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />}
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>{authorName}</span>
                  </div>
                )}
                {title && (
                  <div style={{ ...styles.discordEmbedTitle, color: url ? '#00b0f4' : '#ffffff', textDecoration: url ? 'underline' : 'none', cursor: url ? 'pointer' : 'default' }}>
                    {title}
                  </div>
                )}
                {embedDescription && (
                  <div style={styles.discordEmbedDesc}>
                    {renderDiscordMarkdown(resolvePlaceholders(embedDescription, mockContext))}
                  </div>
                )}
                {fields.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginTop: '8px' }}>
                    {fields.map((f, idx) => (
                      <div key={idx} style={{ gridColumn: f.inline ? 'span 1' : 'span 3' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff', marginBottom: '2px' }}>{f.name}</div>
                        <div style={{ fontSize: '12px', color: '#dbdee1' }}>{renderDiscordMarkdown(resolvePlaceholders(f.value, mockContext))}</div>
                      </div>
                    ))}
                  </div>
                )}
                {imageUrl && (
                  <div style={styles.discordEmbedImageWrapper}>
                    <img src={imageUrl} alt="Embed Media" style={styles.discordEmbedImage} />
                  </div>
                )}
                {thumbnailUrl && (
                  <img src={thumbnailUrl} alt="Thumbnail" style={{ position: 'absolute', top: '16px', right: '16px', width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover' }} />
                )}
                {(footerText || showTimestamp) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '10px', color: '#949ba4', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '6px' }}>
                    {footerIconUrl && <img src={footerIconUrl} alt="Footer Icon" style={{ width: '14px', height: '14px', borderRadius: '50%' }} />}
                    <span>{footerText}</span>
                    {footerText && showTimestamp && <span>•</span>}
                    {showTimestamp && <span>Hoje às 19:40</span>}
                  </div>
                )}
              </div>
            )}

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
    flexWrap: 'wrap',
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
    background: 'linear-gradient(135deg, #5865f2 0%, #2b2d31 100%)',
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
    position: 'relative',
  },
  discordEmbedTitle: {
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
  toggleGroup: {
    display: 'flex',
    background: 'rgba(0, 0, 0, 0.2)',
    padding: '4px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    gap: '4px',
  },
  toggleBtn: {
    flex: 1,
    padding: '10px',
    background: 'none',
    border: 'none',
    borderRadius: '6px',
    color: '#949ba4',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  toggleBtnActive: {
    background: '#5865f2',
    color: '#ffffff',
    boxShadow: '0 2px 8px rgba(88, 101, 242, 0.3)',
  },
  helpText: {
    fontSize: '12px',
    color: '#6e7681',
    marginTop: '6px',
  },
  placeholdersContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '8px',
  },
  placeholderBtn: {
    fontSize: '11px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: '#f2f3f5',
    padding: '4px 8px',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'all 0.1s ease',
  },
  discordContainerLayout: {
    background: '#2b2d31',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '450px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  discordContainerTitle: {
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 800,
    lineHeight: '1.3',
  },
  discordContainerSeparator: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.06)',
    margin: '10px 0',
  },
  discordContainerDesc: {
    color: '#dbdee1',
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
  },
  toolbarBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--border)',
    color: '#ffffff',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '10px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  addBlockBtn: {
    fontSize: '11px',
    padding: '6px 12px',
  },
  fieldRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
};
