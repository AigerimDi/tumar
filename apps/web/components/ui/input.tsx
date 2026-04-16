import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-ink-100 placeholder:text-ink-400",
          "focus:outline-none focus:border-gold-400/40 focus:bg-white/[0.07] transition-colors",
          className,
        )}
        {...rest}
      />
    );
  },
);
