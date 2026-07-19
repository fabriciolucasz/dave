// apps/dashboard/src/app/dashboard/[guildId]/paineis/PaineisList.tsx
'use client';

import React, { useState } from 'react';
import {
  Hand,
  Ticket,
  ScrollText,
  ShieldCheck,
  Megaphone,
  Archive,
  Swords,
  Trophy,
  Target,
  UserCheck,
  ArrowLeft,
  Pencil,
  Power,
  Inbox,
} from 'lucide-react';
import { disableContainer, saveContainer, getContainerPreview } from './actions';
import { PanelConfigForm } from './PanelConfigForm';
import {
  NotchedCard,
  NotchedCardContent,
  NotchedCardFooter,
  NotchedCardHeader,
} from '@/components/NotchedCard';
import { StatusStamp } from '@/components/StatusStamp';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
  guildName: string;
  panelTypes: ContainerType[];
  initialContainers: ContainerItem[];
  channels: Array<{ id: string; name: string }>;
  currentPlanCode: string;
  planFeatures: PlanFeatures;
  botIdentity?: { username: string; avatarURL: string };
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Hand,
  Ticket,
  ScrollText,
  ShieldCheck,
  Megaphone,
  Archive,
  Swords,
  Trophy,
  Target,
  UserCheck,
};

// Espelha os labels padrão de `resolveActionButton` (packages/discord-kit/src/containers/renderer.ts)
// para que a mini prévia nunca fique fora de sincronia com o que é realmente postado no Discord.
// `null` = o tipo não tem botão de ação.
const TYPE_PREVIEW_BUTTON: Record<string, string | null> = {
  welcome: null,
  ticket_panel: 'Criar Ticket',
  rules_panel: null,
  verification_panel: 'Verificar-se',
  announcement: null,
  inventory_panel: 'Ver Baú',
  illegal_action_panel: 'Registrar Ação',
  ranking_panel: null,
  weekly_goal_panel: 'Registrar Meta',
  registration_panel: 'Cadastrar Personagem',
};

export function PaineisList({
  guildId,
  guildName,
  panelTypes,
  initialContainers,
  channels,
  currentPlanCode,
  planFeatures,
  botIdentity,
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
        <Button variant="outline" onClick={() => setActiveConfigType(null)} className="mb-5">
          <ArrowLeft size={16} aria-hidden="true" /> Voltar para Painéis
        </Button>

        <NotchedCard>
          <NotchedCardContent className="pt-6">
            <PanelConfigForm
              guildId={guildId}
              guildName={guildName}
              channels={channels}
              panelType={selectedType}
              existingContainer={existingContainer}
              planFeatures={planFeatures}
              currentPlanCode={currentPlanCode}
              onSaveSuccess={handleSaveSuccess}
              botIdentity={botIdentity}
            />
          </NotchedCardContent>
        </NotchedCard>
      </div>
    );
  }

  return (
    <div className="flex animate-fade-in flex-col gap-8">
      <div className="mb-2 border-b border-border pb-4">
        <h2 className="font-display text-xl font-extrabold text-foreground">Painéis de Identidade Visual</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Personalize a identidade visual e o comportamento das mensagens fixas do bot em seu servidor.
        </p>
      </div>

      {/* Grid de Cards de Tipos de Painel */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
        {panelTypes.map((type) => {
          const IconComponent = ICON_MAP[type.icon] || Hand;
          const activeContainer = activeContainersByType.get(type.type);
          const isConfigured = !!activeContainer;
          const previewButtonLabel = TYPE_PREVIEW_BUTTON[type.type];
          const isRanking = type.type === 'ranking_panel';

          return (
            <NotchedCard key={type.type} className="flex h-full min-h-[280px] flex-col">
              <NotchedCardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-primary/25 bg-primary/15">
                  <IconComponent size={22} className="text-primary" aria-hidden="true" />
                </div>
                <StatusStamp variant={isConfigured ? 'active' : 'inactive'}>
                  {isConfigured ? 'Ativo' : 'Inativo'}
                </StatusStamp>
              </NotchedCardHeader>

              <NotchedCardContent className="flex flex-1 flex-col">
                <h3 className="mb-2 font-display text-base font-bold text-foreground">{type.name}</h3>
                <p className="mb-4 flex-1 text-sm leading-relaxed text-muted-foreground">{type.description}</p>

                {/* Mini preview do painel — espelha os dados reais do tipo, sem cores fixas */}
                <div className="mb-4 flex h-[100px] flex-col gap-2 overflow-hidden rounded-md border border-border bg-secondary/40 p-3">
                  <div className="flex items-center border-l-2 border-primary pl-2">
                    <span className="truncate text-[11px] font-bold text-foreground">{type.name}</span>
                  </div>
                  <div className="flex flex-1 flex-col justify-center gap-1.5">
                    <div className="h-1 w-4/5 rounded-full bg-muted-foreground/20" />
                    <div className="h-1 w-1/2 rounded-full bg-muted-foreground/15" />
                    {previewButtonLabel ? (
                      <div className="mt-1 self-start rounded bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
                        {previewButtonLabel}
                      </div>
                    ) : isRanking ? (
                      <div className="mt-1 self-start rounded border border-dashed border-border px-2 py-1 text-[10px] font-semibold italic text-muted-foreground">
                        Conteúdo dinâmico
                      </div>
                    ) : null}
                  </div>
                </div>

                {isConfigured && activeContainer && (
                  <div className="mb-4 rounded bg-black/15 px-2.5 py-1.5 text-xs text-muted-foreground">
                    <div>
                      <strong className="text-foreground">Canal:</strong> #{getChannelName(activeContainer.channelId)}
                    </div>
                    <div className="mt-1 text-[11px]">
                      <strong className="text-foreground">Renderização:</strong>{' '}
                      <span className="capitalize">{activeContainer.payload?.renderMode || 'embed'}</span>
                    </div>
                  </div>
                )}
              </NotchedCardContent>

              <NotchedCardFooter>
                <Button onClick={() => setActiveConfigType(type.type)} className="w-full">
                  <Pencil size={14} aria-hidden="true" />
                  {isConfigured ? 'Editar Painel' : 'Configurar'}
                </Button>
              </NotchedCardFooter>
            </NotchedCard>
          );
        })}
      </div>

      {/* Tabela de Painéis Ativos */}
      <NotchedCard>
        <NotchedCardHeader>
          <h3 className="font-display text-base font-extrabold text-foreground">Painéis Ativos no Discord</h3>
          <p className="text-sm text-muted-foreground">
            Lista de mensagens persistentes atualmente monitoradas pelo bot no seu servidor.
          </p>
        </NotchedCardHeader>

        <NotchedCardContent>
          {containers.filter((c) => c.isActive).length === 0 ? (
            <div className="flex flex-col items-center rounded-md border border-dashed border-border bg-black/10 px-4 py-12 text-center">
              <Inbox size={48} aria-hidden="true" className="mb-4 text-muted-foreground" />
              <h4 className="mb-2 text-base font-bold text-foreground">Nenhum painel ativo</h4>
              <p className="max-w-[340px] text-sm text-muted-foreground">
                Utilize os cards acima para configurar e postar o seu primeiro painel personalizado no servidor!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Painel</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Renderização</TableHead>
                    <TableHead>Mensagem ID</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {containers
                    .filter((c) => c.isActive)
                    .map((c) => {
                      const typeMeta = panelTypes.find((t) => t.type === c.type);
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            <span className="font-bold text-foreground">{typeMeta?.name || c.type}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold">#{getChannelName(c.channelId)}</span>
                          </TableCell>
                          <TableCell>
                            <StatusStamp variant="active" className="text-[11px] normal-case">
                              {c.payload?.renderMode || 'embed'}
                            </StatusStamp>
                          </TableCell>
                          <TableCell>
                            <code className="rounded bg-primary/5 px-2 py-1 font-mono text-xs text-primary">
                              {c.messageId || 'Aguardando repost...'}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveConfigType(c.type)}
                              >
                                <Pencil size={12} aria-hidden="true" /> Editar
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={disablingId === c.id}
                                onClick={() => handleDisable(c.id)}
                              >
                                <Power size={12} aria-hidden="true" /> Desativar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </NotchedCardContent>
      </NotchedCard>
    </div>
  );
}
