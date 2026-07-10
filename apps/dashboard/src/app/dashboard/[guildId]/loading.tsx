// apps/dashboard/src/app/dashboard/[guildId]/loading.tsx
import React from 'react';

// ---------------------------------------------------------------------------
// GuildLoading
//
// Esqueleto de carregamento (skeleton loader) exibido transitoriamente
// ao navegar entre as abas ou carregar dados do servidor.
// ---------------------------------------------------------------------------

export default function GuildLoading() {
  return (
    <div style={styles.container}>
      {/* Header Skeleton */}
      <div style={styles.headerBlock} className="skeleton-bg animate-pulse" />

      {/* Grid of Cards */}
      <div style={styles.grid}>
        <div style={styles.cardSkeleton} className="skeleton-bg animate-pulse" />
        <div style={styles.cardSkeleton} className="skeleton-bg animate-pulse" />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  headerBlock: {
    height: '120px',
    width: '100%',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: '24px',
  },
  cardSkeleton: {
    height: '240px',
    width: '100%',
  },
};
