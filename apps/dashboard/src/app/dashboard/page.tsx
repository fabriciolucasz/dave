// apps/dashboard/src/app/dashboard/page.tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { clearAuthSession } from '../auth/actions';
import { getBotInviteUrl } from '../../lib/discord';
import {
  NotchedCard,
  NotchedCardContent,
  NotchedCardHeader,
  NotchedCardTitle,
} from '@/components/NotchedCard';
import { StatusStamp } from '@/components/StatusStamp';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Dashboard Page (/dashboard)
//
// Roteador de entrada pós-login:
//   - 0 servidores administrados → Tela de convite para adicionar o bot.
//   - 1 servidor com bot presente → Redireciona direto para overview.
//   - Demais casos (múltiplos servidores, ou o único servidor não tem o bot
//     adicionado ainda) → Grade dividida em "Ativos" e "Bot não adicionado".
// ---------------------------------------------------------------------------

interface Guild {
  id: string;
  discordId: string;
  name: string;
  iconHash: string | null;
  isActive: boolean;
  botPresent: boolean;
}

export default async function DashboardPage() {
  let guilds: Guild[] = [];

  try {
    const res = await apiRequest<{ guilds: Guild[] }>('/guilds');
    guilds = res.guilds;
  } catch (error) {
    console.error('[DashboardRouter] Erro ao carregar servidores:', error);
    if (error instanceof ApiError && error.status === 401) {
      // Token inválido/expirado, limpa sessão e envia para home
      await clearAuthSession();
    }
    // Fallback de erro geral
    redirect('/');
  }

  const inviteUrl = getBotInviteUrl();

  // Cenário 1: nenhum servidor onde o usuário é admin tem o bot presente
  if (guilds.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,hsl(var(--card))_0%,hsl(var(--background))_100%)] p-6">
        <NotchedCard className="w-full max-w-md text-center">
          <NotchedCardHeader>
            <NotchedCardTitle className="font-display text-2xl font-extrabold tracking-tight">
              Nenhum servidor encontrado
            </NotchedCardTitle>
          </NotchedCardHeader>
          <NotchedCardContent className="flex flex-col items-center gap-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Você é administrador de servidores, mas o bot do <strong>Dave</strong> ainda não foi adicionado a
              nenhum deles.
            </p>
            <Button asChild size="lg">
              <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                <Plus size={16} aria-hidden="true" />
                Adicionar Bot ao Servidor
              </a>
            </Button>
          </NotchedCardContent>
        </NotchedCard>
      </div>
    );
  }

  const withBot = guilds.filter((g) => g.botPresent);
  const withoutBot = guilds.filter((g) => !g.botPresent);

  // Cenário 2: único servidor administrado e o bot já está presente nele
  if (guilds.length === 1 && withBot.length === 1) {
    redirect(`/dashboard/${withBot[0]!.discordId}/overview`);
  }

  // Cenário 3: múltiplos servidores, e/ou o(s) único(s) servidor(es) ainda
  // sem o bot adicionado — renderizados em seções separadas.
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-4">
        <div className="flex select-none items-baseline">
          <span className="font-display text-3xl font-extrabold tracking-tight text-foreground">dave</span>
          <span className="font-display text-3xl font-extrabold text-primary">.</span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Selecione um Servidor</h1>
      </header>

      {withBot.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Ativos ({withBot.length})
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {withBot.map((guild) => (
              <Link key={guild.id} href={`/dashboard/${guild.discordId}/overview`} className="group block">
                <NotchedCard className="flex flex-col items-center gap-4 p-8 text-center transition-colors group-hover:border-primary/50">
                  <GuildIcon guild={guild} />
                  <h3 className="font-display text-lg font-bold text-foreground">{guild.name}</h3>
                  <StatusStamp variant={guild.isActive ? 'active' : 'pending'}>
                    {guild.isActive ? 'Ativo' : 'Pendente'}
                  </StatusStamp>
                </NotchedCard>
              </Link>
            ))}
          </div>
        </section>
      )}

      {withoutBot.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Bot não adicionado ({withoutBot.length})
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {withoutBot.map((guild) => (
              <NotchedCard key={guild.id} className="flex flex-col items-center gap-4 p-8 text-center opacity-80">
                <GuildIcon guild={guild} />
                <h3 className="font-display text-lg font-bold text-foreground">{guild.name}</h3>
                <StatusStamp variant="inactive">Bot Ausente</StatusStamp>
                <Button asChild size="sm" variant="outline">
                  <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                    <Plus size={14} aria-hidden="true" />
                    Adicionar Bot
                  </a>
                </Button>
              </NotchedCard>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GuildIcon({ guild }: { guild: Guild }) {
  const iconUrl = guild.iconHash
    ? `https://cdn.discordapp.com/icons/${guild.discordId}/${guild.iconHash}.png`
    : null;

  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={iconUrl}
        alt={guild.name}
        className="h-20 w-20 rounded-full border-2 border-border object-cover"
      />
    );
  }

  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-border bg-secondary font-display text-2xl font-extrabold text-foreground">
      {guild.name.charAt(0)}
    </div>
  );
}
