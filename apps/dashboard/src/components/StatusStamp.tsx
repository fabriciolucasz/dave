import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * StatusStamp — the "dispatch / case-file terminal" signature status badge.
 *
 * A small monospace, double-bordered, slightly rotated "rubber stamp".
 * Replaces the legacy `.badge`/`.badge-active`/`.badge-inactive`/`.badge-warning`
 * CSS classes everywhere in the new design system.
 *
 * `verified` is the ONLY variant allowed to use the teal accent color —
 * teal is intentionally not wired as a general shadcn color token.
 */
const statusStampVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5",
    "rounded-sm border-2 px-2.5 py-0.5",
    "font-mono text-[11px] font-semibold uppercase tracking-wider",
    "-rotate-2 select-none whitespace-nowrap",
  ].join(" "),
  {
    variants: {
      variant: {
        active: "border-primary/70 bg-primary/10 text-primary",
        pending: "border-muted-foreground/50 bg-transparent text-muted-foreground",
        inactive: "border-destructive/70 bg-destructive/10 text-destructive",
        danger: "border-destructive/70 bg-destructive/10 text-destructive",
        verified: "border-[#2FD9C4]/70 bg-[#2FD9C4]/10 text-[#2FD9C4]",
        mismatch: "border-destructive/70 bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: {
      variant: "pending",
    },
  }
);

export interface StatusStampProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusStampVariants> {}

function StatusStamp({ className, variant, children, ...props }: StatusStampProps) {
  return (
    <span className={cn(statusStampVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}

export { StatusStamp, statusStampVariants };
