// apps/dashboard/src/components/GuildSwitcher.tsx
'use client';

import { useRouter } from 'next/navigation';

interface Guild {
  id: string;
  discordId: string;
  name: string;
  iconHash: string | null;
  isActive: boolean;
}

export function GuildSwitcher({ guilds, currentGuildId }: { guilds: Guild[]; currentGuildId: string }) {
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val) {
      router.push(`/dashboard/${val}/overview`);
    }
  };

  return (
    <div style={styles.wrapper}>
      <select
        value={currentGuildId}
        onChange={handleChange}
        className="form-control"
        style={styles.select}
      >
        {guilds.map((g) => (
          <option key={g.id} value={g.discordId} style={styles.option}>
            {g.name} {g.isActive ? '' : ' (Pendente)'}
          </option>
        ))}
      </select>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    width: '100%',
    position: 'relative',
  },
  select: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
    paddingRight: '32px',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23949ba4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '16px',
  },
  option: {
    background: '#11131c',
    color: '#ffffff',
  },
};
