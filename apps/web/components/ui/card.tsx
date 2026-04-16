import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  highlighted,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { highlighted?: boolean }) {
  return (
    <div
      className={cn(
        "relative p-6 sm:p-8",
        highlighted ? "glass-gold" : "glass",
        className,
      )}
      {...rest}
    />
  );
}

export function CardLabel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "text-[11px] uppercase tracking-[0.16em] text-ink-300",
        className,
      )}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("font-serif text-2xl tracking-tight text-ink-100", className)}
      {...rest}
    />
  );
}
