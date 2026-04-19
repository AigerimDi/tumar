/**
 * Extract a usable error message from whatever the Solana stack just threw.
 *
 * Wallet-adapter wraps every transaction failure as `WalletSendTransactionError`
 * with a generic `"Unexpected error"` message - the useful information lives on
 * `.cause`, `.logs`, or `.transactionMessage`. Similarly, `SendTransactionError`
 * from `@solana/web3.js` keeps the program logs in a separate property.
 *
 * This prefers, in order:
 *   1. Human-friendly interpretation of common failure modes (no SOL, no USDC)
 *   2. Program logs from the simulation (the first "Program log:" or "Error:")
 *   3. The cause chain's message, if different from the wrapper's
 *   4. The wrapper's own message as a last resort
 *
 * The goal: "Unexpected error" → "Insufficient USDC balance" or
 * "Custom program error: 0x1770 (InvalidAllocation)".
 */
export function explainTxError(err: unknown): string {
  if (err == null) return "Unknown error";

  // Walk the cause chain so we get the innermost useful message.
  const chain: unknown[] = [];
  let cursor: unknown = err;
  while (cursor && chain.length < 5) {
    chain.push(cursor);
    cursor = (cursor as { cause?: unknown }).cause;
  }

  // Collect logs from any level of the chain. Wallet-adapter stashes them
  // on `.logs`, `.error.logs`, or nested inside `.cause`.
  const logs: string[] = [];
  for (const c of chain) {
    const cLogs = (c as { logs?: string[] }).logs;
    if (Array.isArray(cLogs)) logs.push(...cLogs);
    const inner = (c as { error?: { logs?: string[] } }).error?.logs;
    if (Array.isArray(inner)) logs.push(...inner);
  }

  const messages: string[] = [];
  for (const c of chain) {
    const m = (c as { message?: string }).message;
    if (m) messages.push(m);
    const tm = (c as { transactionMessage?: string }).transactionMessage;
    if (tm) messages.push(tm);
    const inner = (c as { error?: { message?: string } }).error?.message;
    if (inner) messages.push(inner);
  }
  const blob = [...messages, ...logs].join(" | ");

  // Common, friendly cases - map them to plain English.
  //
  // AccountNotInitialized (Anchor 3012, 0xbc4) - a seeds-constrained account
  // didn't exist. On record_contribution that's almost always the Member PDA,
  // i.e. the signer hasn't joined the vault yet.
  if (/AccountNotInitialized/i.test(blob) || /\b0xbc4\b/i.test(blob) || /\b3012\b/.test(blob)) {
    return "You need to join this vault before depositing. Open the invite link from whoever created it, then retry.";
  }
  // Anchor ConstraintSeeds (2006, 0x7d6) - server-computed PDA doesn't match
  // what the program re-derives. For us this is almost always the 1-sec
  // timestamp-seed race in record_contribution. Let the caller retry.
  if (/ConstraintSeeds/i.test(blob) || /\b0x7d6\b/i.test(blob)) {
    return "Transaction slipped past a one-second boundary. Try again - it almost always lands on the second attempt.";
  }
  if (/AccountOwnedByWrongProgram/i.test(blob) || /\b3007\b/.test(blob)) {
    return "Token account is owned by the wrong program. You may have switched mints - reload the page.";
  }
  // Raw RPC `AccountNotFound` during simulate - one of the accounts in the
  // tx doesn't exist on-chain. For record_contribution that's almost always
  // (a) Member PDA missing (signer hasn't joined) or (b) payer's USDC ATA
  // missing (never held USDC). The server precheck should catch both before
  // we get here, but keep this as a last-resort fallback.
  if (/AccountNotFound/i.test(blob)) {
    return "An account this transaction needs doesn't exist yet - most likely you haven't joined this vault with the connected wallet, or this wallet has never held USDC. Join the vault first, or top up USDC and retry.";
  }
  if (/custom program error: 0x1/i.test(blob) && /TokenAccount/i.test(blob)) {
    return "Your wallet has no USDC. Top up and retry.";
  }
  if (/insufficient (funds|lamports)/i.test(blob)) {
    return "Not enough SOL for transaction fees. Top up the connected wallet with a little SOL, then retry.";
  }
  if (/Attempt to debit an account but found no record of a prior credit/i.test(blob)) {
    return "This wallet has no SOL for fees. Top up with a little SOL, then retry.";
  }
  if (/TokenAccountNotFound/i.test(blob) || /could not find account/i.test(blob)) {
    return "You don't have a USDC token account yet. Send any amount of USDC to this wallet (even $1) to create the account, then retry.";
  }
  if (/0x1\b/.test(blob) && /insufficient funds/i.test(blob)) {
    return "Insufficient USDC balance.";
  }
  if (/User rejected/i.test(blob) || /was rejected/i.test(blob)) {
    return "Transaction rejected in wallet.";
  }
  if (/blockhash not found/i.test(blob)) {
    return "Network congestion - blockhash expired before the tx landed. Try again.";
  }
  // Common log-based signals, scanned in priority order. These catch things
  // the structured `err` field doesn't surface (e.g. System program Allocate
  // failures during ATA creation are in logs, not in `err`).
  const joinedLogs = logs.join("\n");
  // System program (11111...) logs "Transfer: insufficient lamports X, need Y"
  // when payer can't cover ATA rent or tx fees. This is the single most
  // common failure mode for a wallet that's never been topped up.
  if (/Transfer: insufficient lamports/i.test(joinedLogs)) {
    return "Not enough SOL in your wallet to cover transaction fees + rent. Top up the connected wallet with a little SOL, then retry.";
  }
  if (/Allocate:.*insufficient (funds|lamports)/i.test(joinedLogs)) {
    return "Not enough SOL to allocate a new account. Top up with a little SOL, then retry.";
  }
  if (/Allocate: account.*already in use/i.test(joinedLogs)) {
    return "A related account already exists with conflicting data - usually a stale PDA from a prior deploy. Try reloading.";
  }
  if (/Cross-program invocation with unauthorized signer/i.test(joinedLogs)) {
    return "The program couldn't sign on behalf of a PDA. This is a program bug, not a wallet problem.";
  }
  // Token program logs custom error 0x1 (InsufficientFunds) when the source
  // token account can't cover the amount. Distinct from System's lamport
  // error above - this one means "not enough USDC", not "not enough SOL".
  if (
    /Token\w*\s+\S+\s+failed: custom program error: 0x1\b/i.test(joinedLogs) ||
    /TokenError::InsufficientFunds/i.test(joinedLogs)
  ) {
    return "Not enough USDC in your wallet. Top up and retry.";
  }
  if (/Simulation failed/i.test(blob) && logs.length === 0) {
    // Wallet simulated locally and failed but didn't return logs. Usually
    // means the tx is structurally invalid (wrong mint, wrong owner).
    return "The wallet refused to sign: the transaction failed simulation. Check the dev console for details.";
  }

  // Fallback: find the most diagnostic log line. Skip lines that are just ix
  // labels ("Program log: Instruction: CreateIdempotent") or invoke markers
  // ("Program ... invoke [N]") - those tell you which ix ran, not what went
  // wrong. Prefer explicit "Error", "failed", or non-label Program log lines.
  const isIxLabel = (l: string) =>
    /^Program log:\s*Instruction:/i.test(l) ||
    /^Program log:\s*Create(Idempotent)?$/i.test(l);
  const isInvokeMarker = (l: string) => /invoke \[\d+\]$/i.test(l);
  const isSuccessMarker = (l: string) => /Program \S+ success$/i.test(l);
  const logLine =
    logs.find((l) => /(Error|failed)/i.test(l) && !isInvokeMarker(l) && !isSuccessMarker(l)) ??
    logs.find((l) => /Allocate:/i.test(l)) ??
    logs.find(
      (l) =>
        /^Program log:/i.test(l) && !isIxLabel(l) && !isInvokeMarker(l),
    );
  if (logLine) return logLine.replace(/^Program log:\s*/i, "");

  // Or the innermost non-generic message.
  const useful = messages.find(
    (m) => m && !/^Unexpected error$/i.test(m) && !/^Transaction failed$/i.test(m),
  );
  if (useful) return useful;

  // Last-resort: dump whatever identifying info we have so debugging in the
  // wild is at least possible. Better than "Unexpected error" appearing for
  // the fifth time on the user's screen.
  const name = (err as { name?: string }).name;
  if (name && name !== "Error") return `${name}: ${messages[0] ?? "no details"}`;
  return messages[0] ?? "Transaction failed (open the dev console for details)";
}
