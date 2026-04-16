import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-all duration-200 rounded-full disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 shadow-[0_12px_24px_-12px_rgba(238,201,74,0.4)] hover:from-gold-200 hover:to-gold-400 hover:-translate-y-px active:translate-y-0",
  secondary:
    "bg-white/5 text-ink-100 border border-white/10 backdrop-blur hover:bg-white/10 hover:border-white/20",
  ghost:
    "bg-transparent text-ink-200 hover:text-ink-100 hover:bg-white/5",
  destructive:
    "bg-[color:var(--color-down)]/15 text-[color:var(--color-down)] border border-[color:var(--color-down)]/30 hover:bg-[color:var(--color-down)]/25",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", size = "md", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    />
  );
});
