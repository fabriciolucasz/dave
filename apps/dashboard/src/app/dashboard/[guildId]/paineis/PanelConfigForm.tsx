// apps/dashboard/src/app/dashboard/[guildId]/paineis/PanelConfigForm.tsx
'use client';

import React, { useState } from 'react';
import { Sparkles, Save, Eye, Trash2, ArrowUp, ArrowDown, Info } from 'lucide-react';
import { getAvailablePlaceholders, resolvePlaceholders, DEFAULT_CONTAINER_PAYLOADS, type ContainerType as ContainerTypeId } from '@dave/discord-kit/browser';
import { saveContainer } from './actions';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

// Tipos que expõem um campo de "texto do botão interativo" no payload
// (todos exceto ranking_panel, que não tem botão — seu conteúdo é
// gerado dinamicamente pelo job de repost).
const BUTTON_LABEL_TYPES = [
  'ticket_panel',
  'verification_panel',
  'inventory_panel',
  'illegal_action_panel',
  'weekly_goal_panel',
  'registration_panel',
];

// Cores reais dos estilos de botão do Discord (ButtonStyle.Primary/Success/
// Secondary/Danger) usadas apenas para mimetizar fielmente a UI real do
// Discord dentro do mock de preview — não fazem parte da paleta de design
// do próprio dashboard, por isso não usam os tokens do sistema.
const DISCORD_BUTTON_COLOR: Record<string, string> = {
  ticket_panel: '#5865f2',
  verification_panel: '#248046',
  inventory_panel: '#4f545c',
  illegal_action_panel: '#da373c',
  weekly_goal_panel: '#248046',
  registration_panel: '#5865f2',
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

  const initialPayload =
    existingContainer?.payload || DEFAULT_CONTAINER_PAYLOADS[panelType.type as ContainerTypeId] || {};

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
  const [footerSignature, setFooterSignature] = useState(initialPayload.footerSignature || '');
  const [topN, setTopN] = useState<number>(initialPayload.topN || 10);

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

  const placeholders = getAvailablePlaceholders(panelType.type as ContainerTypeId);

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
    if (BUTTON_LABEL_TYPES.includes(panelType.type)) {
      payload.buttonLabel = buttonLabel || undefined;
    }
    if (panelType.type === 'registration_panel') {
      payload.footerSignature = footerSignature || undefined;
    }
    if (panelType.type === 'welcome') {
      payload.showMemberCount = showMemberCount;
    } else if (panelType.type === 'announcement') {
      payload.mentionRoleId = mentionRoleId || undefined;
    } else if (panelType.type === 'ranking_panel') {
      payload.topN = topN || 10;
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
    <div className="flex flex-col gap-10 md:flex-row">
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
      <div className="min-w-[340px] flex-1">
        <h3 className="mb-2 font-display text-lg font-extrabold text-foreground">
          Configurar Painel: {panelType.name}
        </h3>
        <p className="mb-6 text-sm text-muted-foreground">{panelType.description}</p>

        {error && (
          <div className="mb-5 rounded-md border border-destructive/30 bg-destructive/15 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <SectionHeading>Visual &amp; Estética</SectionHeading>

          {/* Toggle de Modo */}
          <div className="space-y-2">
            <Label>Modo de Renderização</Label>
            <div className="flex gap-1 rounded-md border border-border bg-black/20 p-1">
              <Button
                type="button"
                variant={renderMode === 'embed' ? 'default' : 'ghost'}
                className="flex-1"
                onClick={() => setRenderMode('embed')}
              >
                Embed Tradicional
              </Button>
              <Button
                type="button"
                variant={renderMode === 'container' ? 'default' : 'ghost'}
                className="flex-1"
                onClick={() => setRenderMode('container')}
              >
                Layout de Container
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {renderMode === 'embed'
                ? 'Estilo clássico do Discord estruturado via campos de EmbedBuilder.'
                : 'Interface modular flexível estruturada por blocos interativos reordenáveis.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-title">Título Geral do Painel</Label>
            <Input
              id="field-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Digite o título principal"
            />
          </div>

          {/* -------------------------------------------------------------------
              FORMULÁRIO DO MODO EMBED (Seção 20.1)
             ------------------------------------------------------------------- */}
          {renderMode === 'embed' && (
            <div className="flex flex-col gap-5">
              <div className="space-y-2">
                <Label htmlFor="field-embed-description">Descrição (Descrição do Embed)</Label>
                <Textarea
                  id="field-embed-description"
                  value={embedDescription}
                  onChange={(e) => setEmbedDescription(e.target.value)}
                  placeholder="Conteúdo descritivo. Aceita variáveis e markdown."
                  rows={4}
                  required
                />
                {placeholders.length > 0 && (
                  <PlaceholderChips placeholders={placeholders} onInsert={insertPlaceholderInDescription} />
                )}
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="min-w-[200px] flex-1 space-y-2">
                  <Label htmlFor="field-url">Link do Título (URL)</Label>
                  <Input id="field-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemplo.com" />
                </div>
                <div className="min-w-[200px] flex-1 space-y-2">
                  <Label htmlFor="field-thumb">Miniatura (Thumbnail URL)</Label>
                  <Input
                    id="field-thumb"
                    type="url"
                    value={thumbnailUrl}
                    onChange={(e) => setThumbnailUrl(e.target.value)}
                    placeholder="https://exemplo.com/thumb.png"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="min-w-[200px] flex-1 space-y-2">
                  <Label htmlFor="field-author">Nome do Autor</Label>
                  <Input id="field-author" type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Nome do Autor" />
                </div>
                <div className="min-w-[200px] flex-1 space-y-2">
                  <Label htmlFor="field-author-icon">Ícone do Autor (URL)</Label>
                  <Input
                    id="field-author-icon"
                    type="url"
                    value={authorIconUrl}
                    onChange={(e) => setAuthorIconUrl(e.target.value)}
                    placeholder="https://exemplo.com/icon.png"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="field-image">Imagem Principal (Image URL)</Label>
                <Input
                  id="field-image"
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://exemplo.com/banner.png"
                />
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="min-w-[200px] flex-1 space-y-2">
                  <Label htmlFor="field-footer-text">Texto do Rodapé</Label>
                  <Input id="field-footer-text" type="text" value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Texto do rodapé" />
                </div>
                <div className="min-w-[200px] flex-1 space-y-2">
                  <Label htmlFor="field-footer-icon">Ícone do Rodapé (URL)</Label>
                  <Input
                    id="field-footer-icon"
                    type="url"
                    value={footerIconUrl}
                    onChange={(e) => setFooterIconUrl(e.target.value)}
                    placeholder="https://exemplo.com/footer-icon.png"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch id="field-showTimestamp" checked={showTimestamp} onCheckedChange={setShowTimestamp} />
                <Label htmlFor="field-showTimestamp" className="cursor-pointer font-normal">
                  Exibir Horário Atual no Rodapé (Timestamp)
                </Label>
              </div>

              {/* Seção de Campos (Fields) */}
              <div className="rounded-md border border-border bg-black/10 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">Campos Customizados (Fields)</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFields([...fields, { name: '', value: '', inline: false }])}
                  >
                    + Adicionar Campo
                  </Button>
                </div>

                {fields.length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted-foreground">Nenhum campo adicionado.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {fields.map((f, fIdx) => (
                      <div key={fIdx} className="flex flex-wrap items-center gap-2 border-b border-white/[0.03] pb-2">
                        <Input
                          type="text"
                          placeholder="Nome"
                          value={f.name}
                          onChange={(e) => {
                            const updated = [...fields];
                            updated[fIdx] = { ...updated[fIdx], name: e.target.value };
                            setFields(updated);
                          }}
                          className="h-8 flex-1 min-w-[100px] text-xs"
                          required
                        />
                        <Input
                          type="text"
                          placeholder="Valor"
                          value={f.value}
                          onChange={(e) => {
                            const updated = [...fields];
                            updated[fIdx] = { ...updated[fIdx], value: e.target.value };
                            setFields(updated);
                          }}
                          className="h-8 min-w-[150px] flex-[2] text-xs"
                          required
                        />
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-foreground/80">
                          <Switch
                            checked={f.inline || false}
                            onCheckedChange={(checked) => {
                              const updated = [...fields];
                              updated[fIdx] = { ...updated[fIdx], inline: checked };
                              setFields(updated);
                            }}
                          />
                          Inline
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setFields(fields.filter((_, idx) => idx !== fIdx))}
                          title="Remover Campo"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </Button>
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
            <div className="flex flex-col gap-5">
              <span className="text-sm font-bold text-foreground">Blocos do Layout de Container</span>

              {blocks.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nenhum bloco no layout. Use o painel abaixo para começar.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {blocks.map((block, index) => {
                    const isEditing = editingBlockIndex === index;
                    return (
                      <div
                        key={index}
                        className={cn(
                          'overflow-hidden rounded-md border border-border',
                          isEditing ? 'bg-primary/5' : 'bg-white/[0.02]'
                        )}
                      >
                        {/* Header do Card do Bloco */}
                        <div className="flex items-center justify-between border-b border-white/[0.03] bg-black/15 px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="rounded text-[9px] uppercase tracking-wide">
                              {block.blockType === 'text' && 'Texto'}
                              {block.blockType === 'separator' && 'Divisor'}
                              {block.blockType === 'gallery' && 'Galeria'}
                              {block.blockType === 'section' && 'Seção'}
                              {block.blockType === 'file' && 'Anexo'}
                            </Badge>
                            <span className="max-w-[200px] truncate text-xs text-foreground/80">
                              {block.blockType === 'text' && (block.content || 'Vazio')}
                              {block.blockType === 'separator' && (block.divider ? 'Linha visível' : 'Espaço em branco')}
                              {block.blockType === 'gallery' && `${block.items?.length || 0} imagem(ns)`}
                              {block.blockType === 'section' && (block.text || 'Vazia')}
                              {block.blockType === 'file' && (block.url || 'Sem arquivo')}
                            </span>
                          </div>

                          {/* Ações do Bloco */}
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => moveBlock(index, 'up')}
                              disabled={index === 0}
                            >
                              <ArrowUp size={14} aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => moveBlock(index, 'down')}
                              disabled={index === blocks.length - 1}
                            >
                              <ArrowDown size={14} aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setEditingBlockIndex(isEditing ? null : index)}
                            >
                              {isEditing ? 'Fechar' : 'Editar'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeBlock(index)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </Button>
                          </div>
                        </div>

                        {/* Corpo/Editor Expandido */}
                        {isEditing && (
                          <div className="flex flex-col gap-3 p-4">
                            {/* Editor de Bloco de Texto */}
                            {block.blockType === 'text' && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label>Conteúdo do Texto</Label>
                                  {/* Toolbar de Formatação */}
                                  <div className="flex gap-1">
                                    <ToolbarButton onClick={() => insertMarkdownInBlock(index, '**', '**')} title="Negrito">B</ToolbarButton>
                                    <ToolbarButton onClick={() => insertMarkdownInBlock(index, '*', '*')} title="Itálico">I</ToolbarButton>
                                    <ToolbarButton onClick={() => insertMarkdownInBlock(index, '__', '__')} title="Sublinhado">U</ToolbarButton>
                                    <ToolbarButton onClick={() => insertMarkdownInBlock(index, '~~', '~~')} title="Riscado">S</ToolbarButton>
                                    <ToolbarButton onClick={() => insertMarkdownInBlock(index, '||', '||')} title="Spoiler">Spoiler</ToolbarButton>
                                    <ToolbarButton onClick={() => insertMarkdownInBlock(index, '`', '`')} title="Código Inline">`</ToolbarButton>
                                    <ToolbarButton onClick={() => insertMarkdownInBlock(index, '```\n', '\n```')} title="Bloco de Código">Bloco</ToolbarButton>
                                  </div>
                                </div>
                                <Textarea
                                  id={`block-editor-${index}`}
                                  value={block.content}
                                  onChange={(e) => {
                                    const updated = [...blocks];
                                    updated[index] = { ...block, content: e.target.value };
                                    setBlocks(updated);
                                  }}
                                  placeholder="Digite o texto. Suporta markdown."
                                  rows={4}
                                  required
                                />
                                {placeholders.length > 0 && (
                                  <PlaceholderChips placeholders={placeholders} onInsert={(ph) => insertPlaceholderInBlock(index, ph)} />
                                )}
                              </div>
                            )}

                            {/* Editor de Divisor */}
                            {block.blockType === 'separator' && (
                              <div className="flex items-center gap-5">
                                <div className="flex-1 space-y-2">
                                  <Label>Espaçamento</Label>
                                  <Select
                                    value={block.spacing || 'small'}
                                    onValueChange={(value) => {
                                      const updated = [...blocks];
                                      updated[index] = { ...block, spacing: value as 'small' | 'large' };
                                      setBlocks(updated);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="small">Pequeno (Small)</SelectItem>
                                      <SelectItem value="large">Grande (Large)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-center gap-2 pt-6">
                                  <Switch
                                    id={`sep-line-${index}`}
                                    checked={block.divider !== false}
                                    onCheckedChange={(checked) => {
                                      const updated = [...blocks];
                                      updated[index] = { ...block, divider: checked };
                                      setBlocks(updated);
                                    }}
                                  />
                                  <Label htmlFor={`sep-line-${index}`} className="cursor-pointer font-normal">
                                    Exibir linha divisória
                                  </Label>
                                </div>
                              </div>
                            )}

                            {/* Editor de Galeria */}
                            {block.blockType === 'gallery' && (
                              <div className="flex flex-col gap-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold">Imagens da Galeria</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[10px]"
                                    onClick={() => {
                                      const updated = [...blocks];
                                      const currentItems = block.items || [];
                                      updated[index] = { ...block, items: [...currentItems, { url: '', alt: '' }] };
                                      setBlocks(updated);
                                    }}
                                  >
                                    + Adicionar Imagem
                                  </Button>
                                </div>

                                {(block.items || []).map((item, imgIdx) => (
                                  <div key={imgIdx} className="flex items-center gap-2">
                                    <Input
                                      type="url"
                                      placeholder="URL da Imagem"
                                      value={item.url}
                                      onChange={(e) => {
                                        const updated = [...blocks];
                                        const newItems = [...(block.items || [])];
                                        newItems[imgIdx] = { ...newItems[imgIdx], url: e.target.value };
                                        updated[index] = { ...block, items: newItems };
                                        setBlocks(updated);
                                      }}
                                      className="h-8 flex-[2] text-xs"
                                      required
                                    />
                                    <Input
                                      type="text"
                                      placeholder="Alt Text (Acessibilidade)"
                                      value={item.alt}
                                      onChange={(e) => {
                                        const updated = [...blocks];
                                        const newItems = [...(block.items || [])];
                                        newItems[imgIdx] = { ...newItems[imgIdx], alt: e.target.value };
                                        updated[index] = { ...block, items: newItems };
                                        setBlocks(updated);
                                      }}
                                      className="h-8 flex-1 text-xs"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => {
                                        const updated = [...blocks];
                                        const newItems = (block.items || []).filter((_, iIdx) => iIdx !== imgIdx);
                                        updated[index] = { ...block, items: newItems };
                                        setBlocks(updated);
                                      }}
                                    >
                                      <Trash2 size={14} aria-hidden="true" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Editor de Seção */}
                            {block.blockType === 'section' && (
                              <div className="flex flex-col gap-3">
                                <div className="space-y-2">
                                  <Label>Texto da Seção</Label>
                                  <Input
                                    type="text"
                                    value={block.text}
                                    onChange={(e) => {
                                      const updated = [...blocks];
                                      updated[index] = { ...block, text: e.target.value };
                                      setBlocks(updated);
                                    }}
                                    placeholder="Texto descritivo principal"
                                    required
                                  />
                                </div>
                                <div className="rounded-md border border-dashed border-border bg-black/10 p-3">
                                  <span className="mb-2 block text-xs font-bold">Acessório Lateral (Opcional)</span>
                                  <div className="flex flex-wrap gap-4">
                                    <div className="flex-1 space-y-1.5">
                                      <Label className="text-xs">Tipo</Label>
                                      <Select
                                        value={block.accessory?.type || 'none'}
                                        onValueChange={(value) => {
                                          const updated = [...blocks];
                                          const type = value === 'none' ? undefined : (value as 'thumbnail' | 'button');
                                          updated[index] = {
                                            ...block,
                                            accessory: type
                                              ? { type, url: block.accessory?.url || '', label: block.accessory?.label || '' }
                                              : undefined,
                                          };
                                          setBlocks(updated);
                                        }}
                                      >
                                        <SelectTrigger className="h-9 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">Nenhum</SelectItem>
                                          <SelectItem value="thumbnail">Miniatura (Thumbnail)</SelectItem>
                                          <SelectItem value="button">Botão Acessório</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    {block.accessory?.type && (
                                      <div className="flex-[2] space-y-1.5">
                                        <Label className="text-xs">
                                          {block.accessory.type === 'thumbnail' ? 'URL da Imagem' : 'Rótulo / Label'}
                                        </Label>
                                        <Input
                                          type="text"
                                          className="h-9 text-xs"
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
                              <div className="space-y-2">
                                <Label>URL do Arquivo Anexo</Label>
                                <Input
                                  type="url"
                                  value={block.url}
                                  onChange={(e) => {
                                    const updated = [...blocks];
                                    updated[index] = { ...block, url: e.target.value };
                                    setBlocks(updated);
                                  }}
                                  placeholder="https://exemplo.com/documento.pdf"
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
              <div className="rounded-md border border-dashed border-border bg-black/10 p-3.5">
                <span className="mb-2 block text-center text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  + Adicionar Componente ao Layout
                </span>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock('text')}>+ Texto</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock('separator')}>+ Divisor</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock('gallery')}>+ Galeria</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock('section')}>+ Seção</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock('file')}>+ Anexo</Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <Label>Cor de Destaque</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded border border-border bg-transparent p-0"
                />
                <Input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="uppercase"
                />
              </div>
            </div>

            <div className="min-w-[200px] flex-[2] space-y-2">
              <Label>Canal de Destino</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um canal" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      #{ch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Configurações Específicas do Tipo */}
          <SectionHeading>Configurações de Função</SectionHeading>

          {BUTTON_LABEL_TYPES.includes(panelType.type) && (
            <div className="space-y-2">
              <Label htmlFor="field-button-label">Texto do Botão Interativo</Label>
              <Input
                id="field-button-label"
                type="text"
                value={buttonLabel}
                onChange={(e) => setButtonLabel(e.target.value)}
                placeholder={(DEFAULT_CONTAINER_PAYLOADS[panelType.type as ContainerTypeId] as any)?.buttonLabel || 'Ex: Continuar'}
              />
            </div>
          )}

          {panelType.type === 'registration_panel' && (
            <div className="space-y-2">
              <Label htmlFor="field-footer-signature">Assinatura do Rodapé</Label>
              <Input
                id="field-footer-signature"
                type="text"
                value={footerSignature}
                onChange={(e) => setFooterSignature(e.target.value)}
                placeholder="Ex: Sistema de Cadastro • Staff"
              />
            </div>
          )}

          {panelType.type === 'ranking_panel' && (
            <div className="space-y-2">
              <Label htmlFor="field-topn">Quantidade de Posições Exibidas (Top N)</Label>
              <Input
                id="field-topn"
                type="number"
                min={1}
                max={25}
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value) || 10)}
                className="max-w-[140px]"
              />
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                O conteúdo deste painel é atualizado automaticamente a cada repost com os dados de ranking mais
                recentes — diferente dos demais painéis, ele não é escrito manualmente aqui.
              </p>
            </div>
          )}

          {panelType.type === 'welcome' && (
            <div className="flex items-center gap-3">
              <Switch id="showMemberCount" checked={showMemberCount} onCheckedChange={setShowMemberCount} />
              <Label htmlFor="showMemberCount" className="cursor-pointer font-normal">
                Exibir contagem total de membros na mensagem
              </Label>
            </div>
          )}

          {panelType.type === 'announcement' && (
            <div className="space-y-2">
              <Label htmlFor="field-mention-role">ID da Role para Mencionador (Opcional)</Label>
              <Input
                id="field-mention-role"
                type="text"
                value={mentionRoleId}
                onChange={(e) => setMentionRoleId(e.target.value)}
                placeholder="Ex: 123456789012345678"
              />
            </div>
          )}

          {isSticky && (
            <div className="space-y-2">
              <Label>Intervalo de Repostagem (Segundos)</Label>
              <Select value={String(repostDelay)} onValueChange={(value) => setRepostDelay(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 segundos</SelectItem>
                  <SelectItem value="30">30 segundos (Recomendado)</SelectItem>
                  <SelectItem value="60">1 minuto</SelectItem>
                  <SelectItem value="300">5 minutos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Webhook customizado (PRO GATE) */}
          <div className="mt-3 flex items-center justify-between border-b border-primary/20 pb-2">
            <span className="font-display text-xs font-bold uppercase tracking-wide text-primary">
              Webhook Customizado (Identidade Própria)
            </span>
            {!isPro && (
              <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                <Sparkles size={10} aria-hidden="true" /> Recurso Pro
              </Badge>
            )}
          </div>

          <div className={cn('relative rounded-md', !isPro && 'overflow-hidden')}>
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="field-webhook-name">Nome do Webhook</Label>
                <Input
                  id="field-webhook-name"
                  type="text"
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  placeholder="Ex: Suporte Dave"
                  disabled={!isPro}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="field-webhook-avatar">URL da Imagem do Avatar</Label>
                <Input
                  id="field-webhook-avatar"
                  type="url"
                  value={webhookAvatar}
                  onChange={(e) => setWebhookAvatar(e.target.value)}
                  placeholder="https://exemplo.com/avatar.png"
                  disabled={!isPro}
                />
              </div>
            </div>

            {!isPro && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-md border border-primary/20 bg-background/90 p-5 text-center backdrop-blur-[3px]">
                <Sparkles size={24} className="mb-2 text-primary" aria-hidden="true" />
                <h4 className="mb-1 text-sm font-bold text-foreground">Disponível apenas no plano Pro</h4>
                <p className="mb-4 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
                  Personalize a imagem e o nome do remetente das mensagens do bot para combinar com a identidade
                  visual da sua comunidade.
                </p>
                <Button asChild size="sm">
                  <Link href={`/dashboard/${guildId}/subscription`}>Fazer Upgrade para Pro</Link>
                </Button>
              </div>
            )}
          </div>

          <Button type="submit" disabled={saving} size="lg" className="mt-2">
            <Save size={16} aria-hidden="true" />
            {saving ? 'Salvando Painel...' : 'Salvar e Publicar no Discord'}
          </Button>
        </form>
      </div>

      {/* Coluna 2: Preview em Tempo Real */}
      <div className="min-w-[340px] flex-1 md:border-l md:border-border md:pl-10">
        <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Eye size={16} aria-hidden="true" /> Preview no Discord (Tempo Real)
        </div>

        <div style={styles.discordMessageWrapper}>
          {/* Discord User Avatar */}
          <div style={styles.discordAvatar}>
            {botAvatar ? (
              <img src={botAvatar} alt="Bot Avatar" style={styles.avatarImg} />
            ) : (
              <div style={styles.discordAvatarPlaceholder}>{botName.slice(0, 1).toUpperCase()}</div>
            )}
          </div>

          {/* Discord Content */}
          <div style={styles.discordContent}>
            <div style={styles.discordUserHeader}>
              <span style={styles.discordUsername}>{botName}</span>
              <span style={styles.discordBotTag}>BOT</span>
              <span style={styles.discordTimestamp}>Hoje às 19:40</span>
            </div>

            {/* Discord Embed vs Layout de Container */}
            {renderMode === 'container' ? (
              <div style={styles.discordContainerLayout}>
                {title && <div style={styles.discordContainerTitle}>{title}</div>}
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

            {/* Discord Buttons — espelha resolveActionButton do renderer.ts */}
            {(DEFAULT_CONTAINER_PAYLOADS[panelType.type as ContainerTypeId] as any)?.buttonLabel && (
              <div style={styles.discordButtons}>
                <div
                  style={{
                    ...styles.discordButton,
                    backgroundColor: DISCORD_BUTTON_COLOR[panelType.type],
                  }}
                >
                  {buttonLabel || (DEFAULT_CONTAINER_PAYLOADS[panelType.type as ContainerTypeId] as any)?.buttonLabel}
                </div>
              </div>
            )}

            {/* Ranking não tem botão — conteúdo é gerado dinamicamente no repost */}
            {panelType.type === 'ranking_panel' && (
              <div className="mt-2 rounded border border-dashed border-white/10 px-3 py-2 text-xs italic text-white/50">
                O conteúdo deste painel (posições do ranking) é preenchido automaticamente pelo bot a cada repost.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 border-b border-primary/20 pb-2 font-display text-xs font-bold uppercase tracking-wide text-primary">
      {children}
    </div>
  );
}

function PlaceholderChips({ placeholders, onInsert }: { placeholders: string[]; onInsert: (placeholder: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {placeholders.map((ph) => (
        <Button
          type="button"
          key={ph}
          variant="outline"
          size="sm"
          className="h-7 px-2 font-mono text-[11px]"
          onClick={() => onInsert(ph)}
        >
          + {`\${${ph}}`}
        </Button>
      ))}
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-6 px-1.5 text-[10px] font-bold" onClick={onClick} title={title}>
      {children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Estilos do mock de preview do Discord — reproduzem fielmente a UI/paleta
// real do Discord (não são tokens do design system do próprio dashboard,
// por isso permanecem como cores/valores literais).
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
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
};
