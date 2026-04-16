"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

/** Serif, tabular-figure counter that tweens on every change. */
export function BalanceCounter({
  value,
  decimals = 2,
  prefix = "$",
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) =>
    prefix +
    v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
  );

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
    });
    return controls.stop;
  }, [value, mv]);

  return <motion.span className={className}>{display}</motion.span>;
}
