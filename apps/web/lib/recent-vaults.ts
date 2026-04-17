/**
 * Recent vaults - localStorage-tracked.
 *
 * "How does a user get back to a vault they created or joined?" - until we
 * scan member PDAs on chain (server-side, with a real indexer), we keep a
 * lightweight list in the browser. Each visit to a vault page saves it,
 * each creation saves it, the /vaults page reads it.
 *
 * Caveat: cleared if the user clears site data. Production would back this
 * with a getProgramAccounts scan filtered by member.user == wallet.
 */

const STORAGE_KEY = "tumar.recent_vaults";
const MAX_ENTRIES = 50;

export type RecentVault = {
  /** Vault PDA, base58. */
  address: string;
  /** Display name from the on-chain vault account. */
  name: string;
  /** Creator wallet, base58 - useful for showing "created by you" badge. */
  creator?: string;
  /** Last visited / created at, ms epoch. */
  touchedAt: number;
};

export function loadRecentVaults(): RecentVault[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Newest first.
    return parsed
      .filter((v): v is RecentVault => v && typeof v.address === "string")
      .sort((a, b) => (b.touchedAt ?? 0) - (a.touchedAt ?? 0));
  } catch {
    return [];
  }
}

export function rememberVault(entry: Omit<RecentVault, "touchedAt"> & { touchedAt?: number }): void {
  if (typeof window === "undefined") return;
  try {
    const list = loadRecentVaults().filter((v) => v.address !== entry.address);
    list.unshift({ ...entry, touchedAt: entry.touchedAt ?? Date.now() });
    const trimmed = list.slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* localStorage unavailable / quota - non-fatal */
  }
}

export function forgetVault(address: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = loadRecentVaults().filter((v) => v.address !== address);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* */
  }
}
