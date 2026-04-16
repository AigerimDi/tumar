import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(value: number, opts?: { compact?: boolean; showSign?: boolean }) {
  const sign = opts?.showSign && value > 0 ? "+" : "";
  if (opts?.compact && Math.abs(value) >= 10_000) {
    return sign + new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }
  return sign + new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number, opts?: { showSign?: boolean }) {
  const sign = opts?.showSign && value > 0 ? "+" : "";
  return sign + new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value / 100);
}

export function shorten(pubkey: string, chars = 4) {
  if (pubkey.length <= chars * 2 + 2) return pubkey;
  return `${pubkey.slice(0, chars)}…${pubkey.slice(-chars)}`;
}

import { explorerAddressUrl, explorerTxUrl } from "@/lib/cluster";

export function explorerUrl(type: "tx" | "address", value: string) {
  return type === "tx" ? explorerTxUrl(value) : explorerAddressUrl(value);
}

export function relativeTime(unixSeconds: number) {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}
