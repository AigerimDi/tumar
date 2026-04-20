"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Slice = { label: string; bps: number; color: string };

export function AllocationRing({
  slices,
  centerLabel,
  centerValue,
  size = 220,
  thickness = 18,
  className,
}: {
  slices: Slice[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
          fill="transparent"
        />
        {slices.map((s, i) => {
          const frac = s.bps / 10_000;
          const dash = c * frac;
          const gap = c - dash;
          const segment = (
            <motion.circle
              key={`${s.label}-${i}`}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={s.color}
              strokeWidth={thickness}
              strokeLinecap="butt"
              fill="transparent"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              style={{ filter: `drop-shadow(0 0 8px ${s.color}40)` }}
            />
          );
          offset += dash;
          return segment;
        })}
      </svg>
      {(centerValue || centerLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerLabel && (
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-300">
              {centerLabel}
            </div>
          )}
          {centerValue && (
            <div className="num mt-1 text-2xl text-ink-100">{centerValue}</div>
          )}
        </div>
      )}
    </div>
  );
}
