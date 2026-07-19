// apps/dashboard/src/components/NavLink.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Sidebar nav item. Active state is a subtle left amber "signal tick"
 * rather than a filled pill background.
 */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-3 rounded-md py-3 pl-4 pr-3 text-sm font-semibold text-muted-foreground transition-colors',
        'before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity',
        'hover:bg-accent hover:text-accent-foreground',
        isActive && 'bg-accent/60 text-foreground before:opacity-100'
      )}
    >
      {children}
    </Link>
  );
}
