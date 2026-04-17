/**
 * Annual CPI tables and compounding helper used by the landing chart
 * and the methodology page. Keep in sync with the source table on /methodology.
 */

export const KZ_CPI_ANNUAL: Record<number, number> = {
  2020: 0.075,
  2021: 0.084,
  2022: 0.203,
  2023: 0.098,
  2024: 0.086,
  2025: 0.08,
  2026: 0.075,
};

export const US_CPI_ANNUAL: Record<number, number> = {
  2020: 0.012,
  2021: 0.047,
  2022: 0.08,
  2023: 0.041,
  2024: 0.029,
  2025: 0.03,
  2026: 0.025,
};

export const CPI_SOURCES_KZ: Record<number, string> = {
  2020: "KZ National Bank",
  2021: "KZ National Bank",
  2022: "KZ National Bank / IMF WEO",
  2023: "KZ National Bank",
  2024: "KZ National Bank",
  2025: "IMF WEO (est.)",
  2026: "IMF WEO (forecast)",
};

export const CPI_SOURCES_US: Record<number, string> = {
  2020: "BLS CPI-U",
  2021: "BLS CPI-U",
  2022: "BLS CPI-U",
  2023: "BLS CPI-U",
  2024: "BLS CPI-U",
  2025: "BLS CPI-U (YTD)",
  2026: "BLS CPI-U (YTD)",
};

export function cpiMultiplier(
  tSec: number,
  startSec: number,
  table: Record<number, number>,
  defaultRate = 0.03,
): number {
  if (tSec <= startSec) return 1;
  const start = new Date(startSec * 1000);
  const end = new Date(tSec * 1000);
  let mult = 1;
  let cursor = new Date(start);
  while (cursor.getUTCFullYear() < end.getUTCFullYear()) {
    const nextYearStart = new Date(Date.UTC(cursor.getUTCFullYear() + 1, 0, 1));
    const years = (nextYearStart.getTime() - cursor.getTime()) / (365.25 * 86400 * 1000);
    const rate = table[cursor.getUTCFullYear()] ?? defaultRate;
    mult *= Math.pow(1 + rate, years);
    cursor = nextYearStart;
  }
  const years = (end.getTime() - cursor.getTime()) / (365.25 * 86400 * 1000);
  const rate = table[cursor.getUTCFullYear()] ?? defaultRate;
  mult *= Math.pow(1 + rate, years);
  return mult;
}
