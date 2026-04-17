/**
 * Web token registry - thin re-export layer over @tumar/shared.
 *
 * The canonical mints + metadata live in `packages/shared/src/tokens.ts`
 * (so the Electron family app sees the same data). This file layers env
 * overrides on top - `NEXT_PUBLIC_USDC_MINT` for devnet mock USDC,
 * `NEXT_PUBLIC_KZTE_MINT` for whatever KZTE mint we eventually pick.
 *
 * Outside `apps/web` (i.e. in the Electron app), import from `@tumar/shared`
 * directly to skip the env-override layer.
 */

import {
  USDC as USDC_BASE,
  KZTE as KZTE_BASE,
  PUSD,
  JITOSOL,
  XSTOCKS,
  USDC_MAINNET_MINT,
  type Token,
  type AssetKind,
} from "./shared";

export type { Token, AssetKind };
export { JITOSOL, PUSD, XSTOCKS };

export const USDC: Token = {
  ...USDC_BASE,
  mint: process.env.NEXT_PUBLIC_USDC_MINT ?? USDC_BASE.mint,
};

export const KZTE: Token = {
  ...KZTE_BASE,
  mint: process.env.NEXT_PUBLIC_KZTE_MINT ?? KZTE_BASE.mint,
};

/** True when USDC.mint is our devnet mock, i.e. we control the authority. */
export const IS_DEVNET_USDC =
  process.env.NEXT_PUBLIC_USDC_MINT !== undefined &&
  process.env.NEXT_PUBLIC_USDC_MINT !== USDC_MAINNET_MINT;

export const ALL_TOKENS: readonly Token[] = [KZTE, USDC, PUSD, JITOSOL, ...XSTOCKS];

function xs(sym: string) {
  return XSTOCKS.find((t) => t.symbol === sym)!;
}

/** Default allocation - a realistic diaspora mix heavy in US equity / gold. */
export const DEFAULT_ALLOCATION: { token: Token; bps: number }[] = [
  { token: KZTE,           bps: 1500 },
  { token: xs("SPYx"),     bps: 2500 },
  { token: xs("NVDAx"),    bps: 1500 },
  { token: xs("GLDx"),     bps: 1000 },
  { token: JITOSOL,        bps: 1500 },
  { token: USDC,           bps: 2000 },
];

export function findToken(mint: string): Token | undefined {
  return ALL_TOKENS.find((t) => t.mint === mint);
}

export function tokenBySymbol(symbol: string): Token | undefined {
  return ALL_TOKENS.find((t) => t.symbol === symbol);
}
