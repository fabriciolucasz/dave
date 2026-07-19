import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * NotchedCard — thin wrapper around shadcn's Card that clips a small
 * diagonal notch off the top-right corner (the design system's one
 * signature visual flourish). Replaces the legacy `.card-glass` class.
 *
 * Composes the existing Card/CardHeader/CardContent/CardFooter primitives
 * rather than hand-editing `card.tsx`.
 */
const NotchedCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <Card ref={ref} className={cn("notch-corner", className)} {...props} />
));
NotchedCard.displayName = "NotchedCard";

export {
  NotchedCard,
  CardHeader as NotchedCardHeader,
  CardTitle as NotchedCardTitle,
  CardDescription as NotchedCardDescription,
  CardContent as NotchedCardContent,
  CardFooter as NotchedCardFooter,
};
