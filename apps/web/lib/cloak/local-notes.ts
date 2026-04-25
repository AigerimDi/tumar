/**
 * Shielded note persistence for the demo.
 *
 * Cloak's pool is UTXO-based: a shielded deposit produces a Utxo that the
 * depositor must remember in order to spend later. We layer a tiny "list
 * by mint" capability on top of the SDK's storage so the rebalance UI can
 * say "you have $X shielded USDC available."
 *
 * Storage shape: `cloak.notes.<wallet>` → JSON array of:
 *   { mint, amount, serializedHex, createdAt }
 * where `serializedHex` mirrors the SDK's `serializeUtxo` (Uint8Array)
 * encoded as hex for JSON storage.
 *
 * Caveats: browser-local; cleared if the user clears site data. Not
 * encrypted at rest - anyone reading localStorage can spend the notes.
 * Acceptable for a hackathon demo, not for production.
 */

const STORAGE_PREFIX = "cloak.notes.";

export type StoredNote = {
  mint: string;
  amount: string; // bigint serialized
  serializedHex: string;
  createdAt: number;
};

export function noteBytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function noteHexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function key(walletBase58: string): string {
  return STORAGE_PREFIX + walletBase58;
}

export function loadShieldedNotes(walletBase58: string): StoredNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(walletBase58));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveShieldedNote(walletBase58: string, note: StoredNote): void {
  if (typeof window === "undefined") return;
  const existing = loadShieldedNotes(walletBase58);
  existing.push(note);
  window.localStorage.setItem(key(walletBase58), JSON.stringify(existing));
}

export function removeShieldedNote(walletBase58: string, serializedHex: string): void {
  if (typeof window === "undefined") return;
  const remaining = loadShieldedNotes(walletBase58).filter(
    (n) => n.serializedHex !== serializedHex,
  );
  window.localStorage.setItem(key(walletBase58), JSON.stringify(remaining));
}

export function totalShieldedBalance(walletBase58: string, mint: string): bigint {
  return loadShieldedNotes(walletBase58)
    .filter((n) => n.mint === mint)
    .reduce((sum, n) => sum + BigInt(n.amount), 0n);
}
