# Tumar

Most of what a Kazakh worker abroad sends home ends up in tenge - a currency that's lost roughly a third of its value against the dollar in the last five years. Meanwhile a US brokerage account compounds. There is no clean way today for a family scattered across Almaty, Dubai, Seoul, Berlin to pool money together and hold what actually grows.

Tumar is that missing layer. One on-chain vault on Solana the whole family deposits into - in whichever stablecoin they actually hold: USDC, USDT, the Kazakh tenge stablecoin (KZTE), or **halal Palm USD** for Muslim families that won't accept yield-bearing dollars. The vault ends up holding real US equities (tokenized via Backed Finance xStocks), gold, staked SOL - the assets the family chose, not the assets the rails forced on them. Privacy via Cloak when a transfer shouldn't be a permanent public record. An offline macOS companion through Tether QVAC so that the grandmother in the village can ask in Kazakh how much someone deposited this month, without a single byte leaving her laptop.

*Tumar* (тұмар) is the small protective charm a Kazakh grandmother sews into a baby's clothes before they go out into the world. We're building the digital version: a wealth box the family keeps together, no matter where its members end up.

## What it does

- **Named Family Vaults.** Create one, name it (e.g. *Bussler Family*), and invite relatives by link. On-chain PDA; anyone with the address can see it; only members can contribute.
- **Custom portfolio.** Compose the mix yourself - Kazakh tenge stablecoin (KZTE), Palm USD (halal, non-freezable), any xStock from Backed Finance (SPYx, AAPLx, NVDAx, TSLAx, GOOGLx, METAx, MSTRx, …), staked SOL (jitoSOL), USDC reserve. Drag the sliders until the allocation matches the family's plan.
- **Multi-stablecoin on-ramp.** USDC, USDT, KZTE, and PUSD all flow through the same per-asset deposit path - same code, same UX, same single contribution record. PUSD has no Jupiter route at the time of writing, so the deposit flow detects it and routes through a direct `transferChecked` instead of forcing a swap.
- **Per-asset deposit.** "I want $100 of NVDAx in the vault, not idle USDC." Two user signatures: Jupiter swaps your stable, then a small tx transfers the asset into the vault's ATA + records the contribution. Token-2022 transfer hooks (xStocks compliance) are resolved on-chain. The vault ends up holding the actual stock, not waiting to be rebalanced.
- **Deposit by QR or privately.** Each vault has a Solana Pay code (public path) **and** a Cloak-shielded path that breaks the on-chain link between the depositor and the asset they bought. The relay submits the swap; the depositor's wallet doesn't link to the purchase.
- **Private rebalance + private buy.** Convert shielded USDC into xStocks/jitoSOL via Cloak's `swapWithChange` (Orca-routed) - treasury moves don't telegraph what the family is doing.
- **Family-side viewing keys.** Generate a vault-scoped Cloak nk on the website, paste it into the Electron desktop app to decrypt shielded history. Read-only - never can spend.
- **Offline LLM companion.** macOS Electron app (`apps/family`) runs Qwen3-1.7B-Instruct + Whisper Tiny *fully on-device* via Tether QVAC. Ask portfolio questions in Russian or Kazakh, by voice or text. **Zero network calls** after model load - the demo unplugs the ethernet.
- **Live on-chain dashboard.** Portfolio value reads real ATA balances × Jupiter spot prices (not target × deposited fiction). Per-asset rows show actual holdings. Contributions feed pulls from on-chain. Solana Explorer link for every move.

## Stack

| Layer         | Choice                                                          |
| ------------- | --------------------------------------------------------------- |
| Program       | Anchor 0.30 (Rust), deployed to Solana mainnet                  |
| Web frontend  | Next.js 15 (App Router), React 19, TypeScript                   |
| Family app    | Electron 33 + Vite + React 19 + TypeScript (macOS arm64 .dmg)   |
| Privacy       | `@cloak.dev/sdk` - shielded UTXO pool, viewing keys, swapWithChange |
| On-device LLM | `@qvac/sdk` - Qwen3-1.7B-Instruct (Q4) + Whisper Tiny, Metal    |
| Wallets       | `@solana/wallet-adapter-*` - Phantom, Solflare, Backpack        |
| Swaps         | Jupiter v6 quote + swap API; Cloak relay (Orca-routed) for private |
| Payments      | `@solana/pay` - transaction-request QR                          |
| Staked SOL    | jitoSOL mint (configurable)                                     |
| Tokenized eq. | Backed Finance xStocks (live mint list in `packages/shared`)    |
| Prices        | Jupiter price API, 60s cache                                    |
| Styling       | Tailwind v4 (web) / v3 (electron) + shared CSS-var tokens       |

## Getting started

```bash
pnpm install
cp .env.example apps/web/.env.local    # fill in RPC URL + program ID
pnpm --filter web dev                  # localhost:3000
```

### Build the macOS family app (.dmg)

```bash
pnpm --filter family build:dmg
# → apps/family/dist/Tumar-Family-0.1.0-arm64.dmg
```

First launch downloads ~1.2 GB of model weights (Qwen3-1.7B Q4 + Whisper Tiny) into `~/.qvac/models`; subsequent launches go fully offline. The .dmg is unsigned - right-click → Open the first time to bypass Gatekeeper, or run from `pnpm --filter family dev` against your own dev environment.

### Deploy the Solana program

```bash
./scripts/deploy-mainnet.sh
```

Needs ~2.2 SOL in the wallet whose pubkey is at `~/.config/solana/id.json`. Reuses the existing `tumar-keypair.json` so the program ID `HfCmnXggSF2tVQkCrEdPNjUTBYvvC8tgbebXES2sp24Y` doesn't change. After deploy, the script transfers upgrade authority to whatever Phantom pubkey is set as `NEW_UPGRADE_AUTHORITY` in the script (default points at the project owner's wallet - change before someone else runs it).

### Program IDs

| Program         | Mainnet                                                 |
| --------------- | ------------------------------------------------------- |
| Tumar           | `HfCmnXggSF2tVQkCrEdPNjUTBYvvC8tgbebXES2sp24Y`          |
| Cloak (resolved by SDK)                | `Zc1KmmiMYVDDBfiVmm7p5JTwZqrWyMhyc3RYqTHTus27h`     |
| USDC (Circle)   | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`         |

## Demo

- Web: https://web-phi-drab-54.vercel.app
- Family app: build the .dmg per the steps above (or `pnpm --filter family dev` for a live-reload window).


## Architecture

```
tumar/
├── programs/tumar/             Anchor program (Vault, Member, Contribution; withdraw, close_vault, leave_vault)
├── packages/shared/            TS-only - Vault/Token/Allocation types, design tokens, mint registry
├── apps/web/                   Next.js 15 site
│   ├── app/                    Routes: landing, /create, /vault/[address]/{deposit,rebalance,invite}, /terminal
│   ├── components/             PrivateDeposit, PrivateRebalance, ViewingKeyExportPanel, …
│   └── lib/cloak/              Cloak SDK lazy-loader, private-deposit/swap helpers, viewing keys, local notes
└── apps/family/                Electron 33 .dmg companion
    ├── src/main/               @qvac/sdk model lifecycle, Cloak history scan, IPC
    ├── src/preload/            contextBridge surface (window.tumar)
    └── src/renderer/           PortfolioPanel + AskPanel (Russian, voice + text, fully offline after load)
```

### Accounts

- `Vault` - PDA seeded by `[b"vault", creator, name]`. Holds name, allocation (8 slots × {mint, bps}), total deposited, member count, bump. The PDA itself owns all asset ATAs.
- `Member` - PDA seeded by `[b"member", vault, pubkey]`. Tracks joined-at, contribution running total.
- `Contribution` - PDA seeded by `[b"contrib", vault, signature_hash]`. Records who deposited, when, and how much (for the history feed).

### Deposit flow

1. Family dashboard generates a Solana Pay URL → `solana:https://tumar.app/api/solana-pay?vault=<addr>&amount=<usdc>`.
2. Contributor scans with Phantom → hits the tx-request endpoint.
3. API builds an unsigned tx: USDC transfer to vault ATA + `record_contribution` CPI.
4. Phantom signs; tx lands; vault USDC balance ticks up.
5. Any member (or the API crank) can press **Rebalance** - the vault authority signs Jupiter swap instructions that redistribute USDC into the target allocation.

The split-at-deposit flow (transfer + swap in one tx) is possible but hits instruction size limits on Jupiter routes > ~4 hops, so Tumar defaults to the two-step flow and keeps single-hop same-tx as an opt-in for simple pairs.

## Future work

- **Off-ramp partnerships.** Wire vault withdrawals into payment rails the diaspora already uses on the Kazakhstan side - Kaspi, S1lkPay, the local KZT mobile money apps. The mechanic isn't novel; it's coordination work between the vault's withdraw flow and an issuer's funding API.
- **Fiat onramp.** USD → USDC in-app (MoonPay / Transak widget in the deposit sheet) so the worker abroad doesn't need a separate step.
- **Tokenized real estate.** A slider slot for Almaty / Astana property tokens once a credible SPV-backed issuer is live on Solana. Yield lands back in the vault as USDC rent. Same allocation system, same per-asset deposit path.

## License

MIT
