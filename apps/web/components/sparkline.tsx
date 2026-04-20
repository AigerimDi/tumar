"use client";

type Props = {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** If omitted, auto-colors green/red based on last vs first. */
  color?: string;
  fill?: boolean;
  className?: string;
};

export function Sparkline({
  values,
  width = 96,
  height = 28,
  strokeWidth = 1,
  color,
  fill = false,
  className,
}: Props) {
  if (!values || values.length < 2) {
    return <div style={{ width, height }} className={className} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const auto =
    values[values.length - 1] >= values[0]
      ? "var(--color-up)"
      : "var(--color-down)";
  const stroke = color ?? auto;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
    >
      {fill && (
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={stroke}
          opacity={0.12}
        />
      )}
      <polyline
        points={points}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
