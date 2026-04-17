/**
 * Shared token registry for Tumar.
 *
 * Mirrors apps/web/lib/tokens.ts but without `process.env` reads - the web
 * app can override mints via env at build time, but the Electron family app
 * always uses canonical mainnet mints. This file is the SOURCE OF TRUTH for
 * mint addresses; apps/web's lib/tokens.ts re-exports from here and layers
 * the env override on top.
 *
 * Sources:
 *   - xStock mints: docs.xstocks.fi (Backed Finance on Solana)
 *   - USDC: Circle (mainnet)
 *   - jitoSOL: Jito Network
 */

export type AssetKind =
  | "stable-usd"
  | "stable-kzt"
  | "equity"
  | "etf"
  | "commodity"
  | "staked-sol";

export type Token = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  kind: AssetKind;
  underlying?: string;
  /** Hex color - used for the allocation ring and row accents. */
  color: string;
  /** Yahoo Finance ticker for historical + live price fetch. */
  yahoo?: string;
  /** If true, treat as USD-pegged (no historical fetch). */
  pegged?: boolean;
  /**
   * Which token program owns this mint. xStocks (Backed Finance) all sit on
   * Token-2022 because they need transfer hooks for compliance; USDC and
   * jitoSOL are on the legacy SPL Token program. ATA derivation and
   * createAssociatedTokenAccount* must use the matching program ID - passing
   * the wrong one trips `IncorrectProgramId` deep inside ATokenGPvb…
   * (the ATA program calls GetAccountDataSize on whatever token program you
   * passed; if it doesn't match the mint's owner, the call fails).
   *
   * Defaults to "legacy" when omitted.
   */
  tokenProgram?: "legacy" | "2022";
};

export const USDC_MAINNET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const USDC: Token = {
  symbol: "USDC",
  name: "USD Coin",
  mint: USDC_MAINNET_MINT,
  decimals: 6,
  kind: "stable-usd",
  underlying: "Reserve - US dollars",
  color: "#2775ca",
  pegged: true,
};

export const KZTE: Token = {
  symbol: "KZTE",
  name: "Tenge Stablecoin",
  // Placeholder until KZTE launches on mainnet. apps/web overrides via
  // NEXT_PUBLIC_KZTE_MINT at build time.
  mint: "TuMarPLaCeHoLdErKZTEMint1111111111111111111",
  decimals: 6,
  kind: "stable-kzt",
  underlying: "₸ Kazakhstani tenge",
  color: "#00b3a4",
  yahoo: "KZT=X",
};

/** Palm USD - fully-reserved, non-freezable USD stablecoin on Solana
 * (Token-2022). Mint locked; standard SPL semantics. No Jupiter route at
 * the time of writing, so index deposits fall back to USDC for any PUSD
 * slot - same as KZTE - until liquidity shows up. Useful as a USD-pegged
 * holding option for families who prefer Palm's Sharia-compliant reserve
 * structure (cash + commodity murabaha + sukuk) over Circle's. */
export const PUSD: Token = {
  symbol: "PUSD",
  name: "Palm USD",
  mint: "CZzgUBvxaMLwMhVSLgqJn3npmxoTo6nzMNQPAnwtHF3s",
  decimals: 6,
  kind: "stable-usd",
  underlying: "Reserve - Sharia-compliant USD basket",
  color: "#1faa84",
  pegged: true,
  tokenProgram: "2022",
};

export const JITOSOL: Token = {
  symbol: "jitoSOL",
  name: "Jito Staked SOL",
  mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  decimals: 9,
  kind: "staked-sol",
  underlying: "SOL + ~7.8% staking APY",
  color: "#14f195",
  yahoo: "SOL-USD",
};

/** Backed Finance xStocks on Solana. Mints verified against docs.xstocks.fi. */
export const XSTOCKS: readonly Token[] = [
  { symbol: "SPYx",   name: "S&P 500 ETF",      mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", decimals: 8, kind: "etf",       underlying: "SPDR S&P 500 ETF",         color: "#c8901e", yahoo: "SPY", tokenProgram: "2022" },
  { symbol: "QQQx",   name: "Invesco QQQ",      mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", decimals: 8, kind: "etf",       underlying: "Nasdaq-100 ETF",           color: "#b88c14", yahoo: "QQQ" , tokenProgram: "2022" },
  { symbol: "GLDx",   name: "Gold",             mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re", decimals: 8, kind: "commodity", underlying: "SPDR Gold Trust",          color: "#d4a73a", yahoo: "GLD" , tokenProgram: "2022" },
  { symbol: "AAPLx",  name: "Apple",            mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8, kind: "equity",    underlying: "Apple Inc. (AAPL)",        color: "#cccccc", yahoo: "AAPL" , tokenProgram: "2022" },
  { symbol: "NVDAx",  name: "NVIDIA",           mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", decimals: 8, kind: "equity",    underlying: "NVIDIA Corp (NVDA)",       color: "#76b900", yahoo: "NVDA" , tokenProgram: "2022" },
  { symbol: "TSLAx",  name: "Tesla",            mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", decimals: 8, kind: "equity",    underlying: "Tesla Inc. (TSLA)",        color: "#e31937", yahoo: "TSLA" , tokenProgram: "2022" },
  { symbol: "GOOGLx", name: "Alphabet",         mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", decimals: 8, kind: "equity",    underlying: "Alphabet Inc. (GOOGL)",    color: "#4285f4", yahoo: "GOOGL" , tokenProgram: "2022" },
  { symbol: "METAx",  name: "Meta",             mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", decimals: 8, kind: "equity",    underlying: "Meta Platforms (META)",    color: "#1877f2", yahoo: "META" , tokenProgram: "2022" },
  { symbol: "MSFTx",  name: "Microsoft",        mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", decimals: 8, kind: "equity",    underlying: "Microsoft (MSFT)",         color: "#00a4ef", yahoo: "MSFT" , tokenProgram: "2022" },
  { symbol: "AMZNx",  name: "Amazon",           mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", decimals: 8, kind: "equity",    underlying: "Amazon (AMZN)",            color: "#ff9900", yahoo: "AMZN" , tokenProgram: "2022" },
  { symbol: "COINx",  name: "Coinbase",         mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", decimals: 8, kind: "equity",    underlying: "Coinbase (COIN)",          color: "#0052ff", yahoo: "COIN" , tokenProgram: "2022" },
  { symbol: "MSTRx",  name: "MicroStrategy",    mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", decimals: 8, kind: "equity",    underlying: "MicroStrategy (MSTR)",     color: "#f7931a", yahoo: "MSTR" , tokenProgram: "2022" },
  { symbol: "HOODx",  name: "Robinhood",        mint: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg", decimals: 8, kind: "equity",    underlying: "Robinhood (HOOD)",         color: "#00c805", yahoo: "HOOD" , tokenProgram: "2022" },
  { symbol: "BRK.Bx", name: "Berkshire",        mint: "Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x", decimals: 8, kind: "equity",    underlying: "Berkshire B (BRK.B)",      color: "#8ea6c7", yahoo: "BRK-B" , tokenProgram: "2022" },
  { symbol: "LLYx",   name: "Eli Lilly",        mint: "Xsnuv4omNoHozR6EEW5mXkw8Nrny5rB3jVfLqi6gKMH", decimals: 8, kind: "equity",    underlying: "Eli Lilly (LLY)",          color: "#d52b1e", yahoo: "LLY" , tokenProgram: "2022" },
  { symbol: "JPMx",   name: "JPMorgan",         mint: "XsMAqkcKsUewDrzVkait4e5u4y8REgtyS7jWgCpLV2C", decimals: 8, kind: "equity",    underlying: "JPMorgan (JPM)",           color: "#0066b2", yahoo: "JPM" , tokenProgram: "2022" },
  { symbol: "PLTRx",  name: "Palantir",         mint: "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4", decimals: 8, kind: "equity",    underlying: "Palantir (PLTR)",          color: "#a9b4c2", yahoo: "PLTR" , tokenProgram: "2022" },
] as const;

export const ALL_TOKENS: readonly Token[] = [KZTE, USDC, PUSD, JITOSOL, ...XSTOCKS];

export function findToken(mint: string): Token | undefined {
  return ALL_TOKENS.find((t) => t.mint === mint);
}

export function tokenBySymbol(symbol: string): Token | undefined {
  return ALL_TOKENS.find((t) => t.symbol === symbol);
}
