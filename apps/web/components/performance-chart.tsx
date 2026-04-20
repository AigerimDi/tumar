"use client";

import { useMemo, useState } from "react";
import type { PortfolioPoint } from "@/lib/backtest";

type Props = {
  points: PortfolioPoint[];
  initial: number;
  height?: number;
};

export function PerformanceChart({ points, initial, height = 260 }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values, initial);
    const max = Math.max(...values, initial);
    const range = max - min || 1;
    const pad = range * 0.08;
    const loY = min - pad;
    const hiY = max + pad;
    return { min: loY, max: hiY, range: hiY - loY };
  }, [points, initial]);

  if (!geometry || points.length < 2) {
    return (
      <div
        style={{ height }}
        className="num-tab flex items-center justify-center text-[11px] text-[var(--color-ink-400)]"
      >
        Fetching historical closes…
      </div>
    );
  }

  const w = 1000;
  const h = height;
  const step = w / (points.length - 1);
  const toXY = (i: number, v: number) => {
    const x = i * step;
    const y = h - ((v - geometry.min) / geometry.range) * h;
    return { x, y };
  };

  const path = points
    .map((p, i) => {
      const { x, y } = toXY(i, p.value);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const finalAboveInitial = points[points.length - 1].value >= initial;
  const lineColor = finalAboveInitial ? "var(--color-up)" : "var(--color-down)";
  const baselineY = h - ((initial - geometry.min) / geometry.range) * h;

  const hover = hoverIdx != null ? points[hoverIdx] : null;
  const hoverXY = hover ? toXY(hoverIdx!, hover.value) : null;

  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-full w-full"
        preserveAspectRatio="none"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * w;
          const i = Math.max(0, Math.min(points.length - 1, Math.round(x / step)));
          setHoverIdx(i);
        }}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={w}
            y1={h * f}
            y2={h * f}
            stroke="var(--hairline)"
            strokeDasharray="2,3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1={0}
          x2={w}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--color-ink-500)"
          strokeDasharray="4,4"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`${path} L ${w} ${h} L 0 ${h} Z`}
          fill={lineColor}
          opacity={0.08}
        />
        <path
          d={path}
          stroke={lineColor}
          strokeWidth="1.5"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        {hoverXY && (
          <>
            <line
              x1={hoverXY.x}
              x2={hoverXY.x}
              y1={0}
              y2={h}
              stroke="var(--color-ink-400)"
              strokeDasharray="2,3"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hoverXY.x} cy={hoverXY.y} r="3" fill={lineColor} />
          </>
        )}
      </svg>
      {hover && (
        <div
          className="panel pointer-events-none absolute top-2 px-2 py-1.5 text-[10px]"
          style={{
            left: `min(calc(${(hoverIdx! / (points.length - 1)) * 100}% + 8px), calc(100% - 130px))`,
          }}
        >
          <div className="num-tab text-[var(--color-ink-300)]">
            {new Date(hover.t * 1000).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <div className="num-tab mt-0.5 font-semibold text-[var(--color-ink-50)]">
            ${hover.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      )}
    </div>
  );
}
