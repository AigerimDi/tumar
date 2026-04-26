/**
 * Mock VaultState for the local app demo.
 *
 * In a real deploy this would be either:
 *   (a) fetched from the same `/api/vault/[address]` endpoint apps/web uses, or
 *   (b) decrypted on-device from a Cloak viewing-key scan (the headline
 *       privacy feature - only the family ever sees real numbers).
 *
 * For the hackathon submission we hardcode a realistic family vault that
 * matches the Tumar default allocation. The LLM answers questions about
 * THIS state, so the values are picked to be diagnosable from the four
 * demo questions in SUBMISSION.md:
 *   - "Сколько у меня сейчас в портфеле?"   → totalValueUsd
 *   - "Что такое SPYx?"                      → SPYx allocation row
 *   - "Сколько я получил в этом месяце?"     → recentContributions sum
 *   - "Что будет, если SPY упадёт на 20%?"   → derive from SPYx exposure
 */

import {
  KZTE,
  USDC,
  JITOSOL,
  XSTOCKS,
  type VaultState,
} from "@tumar/shared";

const SPYx = XSTOCKS.find((t) => t.symbol === "SPYx")!;
const NVDAx = XSTOCKS.find((t) => t.symbol === "NVDAx")!;
const GLDx = XSTOCKS.find((t) => t.symbol === "GLDx")!;

export const MOCK_VAULT: VaultState = {
  address: "Hf6BXbuS1G3pqPgwaR7M2SyVB1eDQyznZBvL2UAfM4Jt",
  creator: "BgZQVm6ezo32dGN4cCKpz3Vdu1vhG6KFKvwqMiy7XsaP",
  name: "Дом Сатпаевых",
  // 30% SPY, 18% NVDA, 12% Gold, 18% jitoSOL, 12% USDC, 10% KZTE.
  // Adds to 10000 bps = 100%.
  allocation: [
    { mint: SPYx.mint, bps: 3000 },
    { mint: NVDAx.mint, bps: 1800 },
    { mint: GLDx.mint, bps: 1200 },
    { mint: JITOSOL.mint, bps: 1800 },
    { mint: USDC.mint, bps: 1200 },
    { mint: KZTE.mint, bps: 1000 },
  ],
  usdcDeposited: 24_750,
  memberCount: 6,
  createdAt: Math.floor(Date.parse("2026-01-12T10:00:00Z") / 1000),
  totalValueUsd: 26_180.42, // current valuation including unrealized gains
  recentContributions: [
    {
      signature: "5JmK4f9xq3wFkBn2hKmRvgqTdqXtZ8YyjLwPa6kZv4nHXfRvK1cBjqEeVcBkLsPrZbSdKdFvJqBwTpY1mY3WqL2x",
      vault: "Hf6BXbuS1G3pqPgwaR7M2SyVB1eDQyznZBvL2UAfM4Jt",
      contributor: "Da8hgCJ6S3PZpqU8EKzXmFcPgCbF1Wat2tSCLp9qD3sR",
      amount: 1500,
      timestamp: Math.floor(Date.parse("2026-04-14T17:32:00Z") / 1000),
      memo: "Апрельский взнос от папы",
    },
    {
      signature: "3Hv8Pq2cYr7tF5nAdWbXkM1EgUjQzBmKvJqRpL4hVfNnSdZcJqWxYbAtPrFkLmDgCkVeBtRvNfJsTcXqYpZ7BcK1",
      vault: "Hf6BXbuS1G3pqPgwaR7M2SyVB1eDQyznZBvL2UAfM4Jt",
      contributor: "9JmMvhqRpWzKcXfYbAtPrFkLmDgCkVeBtRvNfJsTcXqY",
      amount: 800,
      timestamp: Math.floor(Date.parse("2026-04-08T09:15:00Z") / 1000),
      memo: "За учёбу Айданы",
    },
    {
      signature: "2Wq4Hp1mZj9aKvSrNbTfXcEgUjQzBmKvJqRpL4hVfNnSdZcJqWxYbAtPrFkLmDgCkVeBtRvNfJsTcXqYpZBcK7Vt",
      vault: "Hf6BXbuS1G3pqPgwaR7M2SyVB1eDQyznZBvL2UAfM4Jt",
      contributor: "Da8hgCJ6S3PZpqU8EKzXmFcPgCbF1Wat2tSCLp9qD3sR",
      amount: 2100,
      timestamp: Math.floor(Date.parse("2026-03-28T14:50:00Z") / 1000),
      memo: "Бонус с работы",
    },
  ],
};
