"use client";

import { cn } from "@/lib/utils";

export function Slider({
  value,
  onChange,
  color,
  disabled,
  max = 10000,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  color?: string;
  disabled?: boolean;
  max?: number;
  className?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const trackColor = color ?? "rgb(238, 201, 74)";
  return (
    <div className={cn("relative h-8 w-full", className)}>
      <input
        type="range"
        min={0}
        max={max}
        step={50}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        // Hide the native thumb + track on all engines so only our custom
        // thumb/fill are visible. Without these, WebKit/Chromium keep the
        // default thumb painted on top of our overlay, producing a
        // "double thumb" artifact where the native thumb follows the
        // cursor instantly and the custom one lags behind.
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none bg-transparent outline-none disabled:cursor-not-allowed [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent"
      />
      <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/8" />
      <div
        className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${trackColor}66, ${trackColor})`,
          boxShadow: `0 0 16px -4px ${trackColor}80`,
        }}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-ink-100 shadow-lg"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
