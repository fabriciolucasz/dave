// apps/dashboard/src/app/dashboard/[guildId]/layout.tsx
import { redirect } from 'next/navigation';
import { apiRequest } from '../../../lib/api';
import { GuildSwitcher } from '../../../components/GuildSwitcher';
import { NavLink } from '../../../components/NavLink';
import { StatusStamp } from '@/components/StatusStamp';
import { Button } from '@/components/ui/button';
import { clearAuthSession } from '../../auth/actions';
import Link from 'next/link';
import {
  LayoutDashboard,
  Settings,
  LayoutGrid,
  CreditCard,
  User,
  TriangleAlert,
  Archive,
  Swords,
  UserCheck,
} from 'lucide-react';

interface Guild {
  id: string;
  discordId: string;
  name: string;
  iconHash: string | null;
  isActive: boolean;
  botPresent: boolean;
}

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  let guilds: Guild[] = [];

  try {
    const res = await apiRequest<{ guilds: Guild[] }>('/guilds');
    guilds = res.guilds;
  } catch (error) {
    console.error('[GuildLayout] Erro ao carregar servidores:', error);
    redirect('/login');
  }

  const currentGuild = guilds.find((g) => g.discordId === guildId);

  if (!currentGuild) {
    // Guilda não pertence ao usuário ou não existe
    redirect('/dashboard');
  }

  if (!currentGuild.botPresent) {
    // Defesa em profundidade: navegação direta para uma guild "fantasma"
    // (bot nunca adicionado) é redirecionada para a página de convite.
    redirect('/dashboard');
  }

  let activeSubscription = null;
  try {
    const resGuild = await apiRequest<{ guild: any }>(`/guilds/${guildId}`);
    activeSubscription = resGuild.guild.subscriptions[0] || null;
  } catch (err) {
    console.warn('[GuildLayout] Erro ao buscar assinatura:', err);
  }

  const isExpired =
    !activeSubscription ||
    activeSubscription.status === 'EXPIRED' ||
    activeSubscription.status === 'PAST_DUE';

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed bottom-0 left-0 top-0 z-[100] flex w-[280px] flex-col border-r border-border bg-[#101119]">
        <div className="border-b border-border/60 px-6 py-6">
          <Link href="/dashboard" className="flex items-baseline no-underline">
            <span className="font-display text-2xl font-extrabold tracking-tight text-foreground">dave</span>
            <span className="font-display text-2xl font-extrabold text-primary">.</span>
          </Link>
        </div>

        <div className="border-b border-border/60 px-6 py-5">
          <GuildSwitcher guilds={guilds} currentGuildId={guildId} />
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-4">
          <NavLink href={`/dashboard/${guildId}/overview`}>
            <LayoutDashboard size={16} aria-hidden="true" /> Visão Geral
          </NavLink>
          <NavLink href={`/dashboard/${guildId}/settings`}>
            <Settings size={16} aria-hidden="true" /> Configurações
          </NavLink>
          <NavLink href={`/dashboard/${guildId}/paineis`}>
            <LayoutGrid size={16} aria-hidden="true" /> Painéis
          </NavLink>
          <NavLink href={`/dashboard/${guildId}/bau`}>
            <Archive size={16} aria-hidden="true" /> Baú (Estoque)
          </NavLink>
          <NavLink href={`/dashboard/${guildId}/central`}>
            <Swords size={16} aria-hidden="true" /> Central (Ações)
          </NavLink>
          <NavLink href={`/dashboard/${guildId}/cadastros`}>
            <UserCheck size={16} aria-hidden="true" /> Cadastros
          </NavLink>
          <NavLink href={`/dashboard/${guildId}/subscription`}>
            <CreditCard size={16} aria-hidden="true" /> Assinatura
          </NavLink>
        </nav>

        <div className="flex flex-col gap-3 border-t border-border/60 p-4">
          <Link
            href="/account"
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-foreground no-underline"
          >
            <User size={16} aria-hidden="true" /> Minha Conta
          </Link>
          <form action={clearAuthSession} className="w-full">
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Sair
            </Button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-[280px] flex min-h-screen flex-1 flex-col">
        <div className="sticky top-0 z-[90] flex h-[72px] items-center justify-between border-b border-border bg-background/60 px-10 backdrop-blur">
          <div className="flex items-center gap-4">
            <h2 className="font-display text-xl font-extrabold text-foreground">{currentGuild.name}</h2>
            <StatusStamp variant={currentGuild.isActive ? 'active' : 'pending'}>
              {currentGuild.isActive ? 'Ativo' : 'Pendente'}
            </StatusStamp>
          </div>
        </div>

        {isExpired && (
          <div className="flex items-center gap-2 border-b border-destructive/25 bg-destructive/10 px-10 py-3 text-sm font-semibold text-destructive animate-fade-in">
            <TriangleAlert size={16} aria-hidden="true" /> Este servidor não possui uma assinatura Pro ativa. Alguns
            recursos premium podem estar bloqueados ou limitados.
            <Link href={`/dashboard/${guildId}/subscription`} className="ml-1.5 font-bold text-foreground underline">
              Assinar Pro
            </Link>
          </div>
        )}

        <div className="flex-1 p-10">{children}</div>
      </main>
    </div>
  );
}
