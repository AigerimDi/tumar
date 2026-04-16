/**
 * Kazakh carpet ornament used as a divider and a decorative mark.
 *
 * The central motif is a stylized "qoshqar-múyiz" (ram's horn) - the most
 * common pattern on tús-kiiz felt carpets. Paired rhombi and braided edges
 * echo the textile's woven cadence. Drawn in thin gold hairlines to stay
 * editorial, not literal.
 */
import { cn } from "@/lib/utils";

export function OrnamentDivider({
  className,
  variant = "full",
}: {
  className?: string;
  variant?: "full" | "mark";
}) {
  if (variant === "mark") return <OrnamentMark className={className} />;
  return (
    <div className={cn("flex items-center gap-4 text-gold-300/60", className)}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold-500/30 to-gold-400/50" />
      <OrnamentMark className="h-6 w-24 shrink-0" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-gold-500/30 to-gold-400/50" />
    </div>
  );
}

function OrnamentMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-gold-300", className)}
      aria-hidden
    >
      {/* left echo */}
      <path
        d="M4 12 Q10 4 18 12 T32 12"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* central ram-horn pair */}
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M42 16 C 42 10, 46 8, 48 12 C 50 16, 54 14, 54 8" />
        <path d="M42 8  C 42 14, 46 16, 48 12 C 50 8,  54 10, 54 16" />
        <path d="M48 4 L48 20" opacity="0.35" />
      </g>
      {/* rhombus */}
      <path
        d="M66 12 L72 6 L78 12 L72 18 Z"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.55"
      />
      <path d="M72 9.5 L72 14.5 M69.5 12 L74.5 12" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
      {/* right echo */}
      <path
        d="M82 12 Q88 4 92 12"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* dots */}
      <circle cx="38" cy="12" r="0.8" fill="currentColor" opacity="0.7" />
      <circle cx="58" cy="12" r="0.8" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

/** Decorative corner ornament for panels - four ram-horn spirals. */
export function OrnamentCornerFrame({ className }: { className?: string }) {
  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 text-gold-400/15", className)}
      viewBox="0 0 400 240"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none">
        <path d="M12 12 C 12 22, 22 22, 22 12 M12 12 L12 30 M12 12 L30 12" />
        <path d="M388 12 C 388 22, 378 22, 378 12 M388 12 L388 30 M388 12 L370 12" />
        <path d="M12 228 C 12 218, 22 218, 22 228 M12 228 L12 210 M12 228 L30 228" />
        <path d="M388 228 C 388 218, 378 218, 378 228 M388 228 L388 210 M388 228 L370 228" />
      </g>
    </svg>
  );
}
