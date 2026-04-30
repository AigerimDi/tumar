/**
 * Solana Pay helpers.
 *
 * We emit transaction-request URLs of the form:
 *   solana:https://<host>/api/solana-pay?vault=<addr>&amount=<usdc>
 *
 * Phantom / Solflare will GET that URL for metadata (label, icon), then POST
 * { account: payer } to receive the serialized transaction to sign.
 */

export function buildPayUrl(opts: {
  origin: string;
  vault: string;
  amount?: number;
  memo?: string;
}): string {
  const base = new URL(`${opts.origin}/api/solana-pay`);
  base.searchParams.set("vault", opts.vault);
  if (opts.amount) base.searchParams.set("amount", String(opts.amount));
  if (opts.memo) base.searchParams.set("memo", opts.memo);
  return `solana:${base.toString()}`;
}
