// apps/dashboard/src/components/GuildSwitcher.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Guild {
  id: string;
  discordId: string;
  name: string;
  iconHash: string | null;
  isActive: boolean;
  botPresent: boolean;
}

export function GuildSwitcher({ guilds, currentGuildId }: { guilds: Guild[]; currentGuildId: string }) {
  const router = useRouter();

  // Servidores sem o bot ainda são "descobertos"/adicionados na página
  // /dashboard, não no switcher — ficariam quebrados se selecionados aqui.
  const selectableGuilds = guilds.filter((g) => g.botPresent);

  const handleChange = (value: string) => {
    if (value) {
      router.push(`/dashboard/${value}/overview`);
    }
  };

  return (
    <Select value={currentGuildId} onValueChange={handleChange}>
      <SelectTrigger className="w-full font-semibold">
        <SelectValue placeholder="Selecione um servidor" />
      </SelectTrigger>
      <SelectContent>
        {selectableGuilds.map((g) => (
          <SelectItem key={g.id} value={g.discordId}>
            {g.name}
            {!g.isActive && ' (Pendente)'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
