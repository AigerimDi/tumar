# Tumar - Frontier Hackathon submission

A family investment vault for the Kazakh diaspora. Built on Solana mainnet. Real proofs, real local inference, no mocked SDK calls.

**Six side tracks, one product.** This document goes deep on the two tracks with the highest integration-depth bar (Cloak and Tether QVAC). For the other four tracks, see:

- **Palm USD** - blurb in `decks/tumar-submission.pdf` (page 4); deck `decks/tumar-deck-palm.pdf`. PUSD as a first-class deposit asset for the UAE-side Muslim diaspora; direct-transfer fallback when no Jupiter route exists.
- **Superteam KZ general** - blurb in `decks/tumar-submission.pdf` (page 4); deck `decks/tumar-deck-kz.pdf`. Founder-first regional submission.
- **S1lkPay** - blurb in `decks/tumar-submission.pdf` (page 4); deck `decks/tumar-deck-s1lkpay.pdf`. Cross-border tenge remittance corridor, KZTE on-ramp.
- **Metaforra** - blurb in `decks/tumar-submission.pdf` (page 4); deck `decks/tumar-deck-metaforra.pdf`. RWA tokenization (xStocks productionalized today, real estate as next allocation slot).

Submission portals, deadlines, application blurbs, and the demo script all live in `decks/tumar-submission.pdf`.

The two deep-dive tracks below - Cloak and QVAC - load-bear most of the submission's technical novelty. Read them after the main README.

---

## Submission checklist

- [x] **Web app live**: <https://web-phi-drab-54.vercel.app>
- [x] **Family app**: macOS arm64 .dmg via `pnpm --filter family build:dmg`
- [x] **Anchor program deployed to mainnet**: `HfCmnXggSF2tVQkCrEdPNjUTBYvvC8tgbebXES2sp24Y`
- [x] **All SDK calls are real**: `@cloak.dev/sdk@0.1.5`, `@qvac/sdk@0.9.1`
- [x] **Code is open**: this repo
- [x] **Per-track decks built**: `decks/tumar-deck-{all,cloak,qvac,palm,kz,s1lkpay,metaforra}.pdf`
- [x] **Per-track application blurbs**: in `decks/tumar-submission.pdf` (page 4)
- [x] **Demo video script**: in `decks/tumar-submission.pdf` (page 6)
- [ ] Demo video filmed and uploaded - script + subtitles ready, recording pending

---

## Track 1 - Cloak (40 / 30 / 30)

> Integration depth (40), product (30), real-world use (30)

### Integration depth - 40%

Three independent Cloak surfaces, each calling distinct SDK primitives:

| Surface | SDK calls | Where |
|---|---|---|
| **Private deposit** ("anonymized source, public arrival") | `generateUtxoKeypair`, `createUtxo`, `createZeroUtxo`, `transact` (deposit), `partialWithdraw` (relay forward) | `apps/web/lib/cloak/private-deposit.ts` → `components/private-deposit.tsx` |
| **Shield-only USDC for later spend** | Same as above, minus the partialWithdraw - note saved to `localStorage` for swap consumption | `apps/web/lib/cloak/shield-usdc.ts` |
| **Private rebalance (Orca-routed)** | `selectUtxos`, `swapWithChange` with `swapDexes: ["Orca V2", "Orca"]` | `apps/web/lib/cloak/private-swap.ts` → `components/private-rebalance.tsx` |
| **Vault-scoped viewing keys** | `generateCloakKeys(seed)` → `expandSpendKey` → `deriveDiversifiedViewingKey(nsk, vaultPda.toBytes())` | `apps/web/lib/cloak/viewing-keys.ts` |
| **Family-side history decryption** | `scanTransactions({ viewingKeyNk })`, `toComplianceReport` | `apps/family/src/main/index.ts` (IPC `cloak:scan`) |

The proof-generation step is **visible in the UI** - `onProofProgress(percent)` drives a real progress bar, not a fake spinner. ~3-second Groth16 proofs in the browser become a demo beat: *"the privacy is doing visible work."*

Architectural honesty: Cloak's `transfer()` takes a UTXO bigint pubkey, not a Solana `PublicKey`, so we couldn't *shielded-transfer* directly to the vault PDA. We picked **option (a) - anonymized-source, public-arrival**: shield → relay-submitted withdraw. The depositor's wallet doesn't appear in the chain trace from Cloak Pool to Vault. We documented this trade-off in `lib/cloak/private-deposit.ts` so the next contributor doesn't have to re-derive the why.

### Product - 30%

The privacy story matches the threat model. Family vaults often serve diaspora workers sending home - the on-chain footprint of "who funds whose family" is exactly the kind of public ledger detail that should not be on Twitter. Tumar's contributions are recorded as the family wants them seen (memo, amount, timestamp) without exposing the source wallet's full transaction graph.

For rebalances, the public path (Jupiter) telegraphs allocation intent to anyone watching the vault. The Cloak path doesn't. That's a real product decision.

The viewing-key flow is the hackathon's "two-sided integration" - the same nk generated on the website is parsed and used by the Electron app. Both halves call official SDK functions; neither side fakes anything.

### Real-world use - 30%

- **Mainnet deployment**: every transaction in this submission spends real USDC and pays real Solana fees. No devnet / fork shortcuts.
- **The ~2.65 GB on-device download is the cost of the demo**: model weights cache once, then operate offline. We chose Qwen3 **1.7B** (~1 GB) over the spec's suggested 4B (~2.5 GB) to keep the first-launch UX tractable on hotel wifi; the SDK's `QWEN3_4B_Q4_K_M` constant is also wired up if a future build wants to upgrade.
- **No fork dependencies**: only the published `@cloak.dev/sdk` (0.1.5, npm). The devnet `@cloak.dev/sdk-devnet` fork is private; we don't depend on it.

---

## Track 2 - Tether QVAC (40 / 30 / 20 / 10)

> Technical depth (40), product value (30), innovation (20), demo (10)

### Technical depth - 40%

The `apps/family` Electron app is built per the canonical QVAC tutorial (`docs.qvac.tether.io/sdk/tutorials/electron`), with rigorous separation of concerns:

- **Main process (`src/main/index.ts`)** owns `@qvac/sdk` exclusively. Two models load in parallel via `loadModel`:
  - LLM: `QWEN3_1_7B_INST_Q4`, `ctx_size: 4096`, `device: "gpu"`, `gpu_layers: 99` - Metal on Apple Silicon.
  - Whisper: `WHISPER_TINY` (multilingual), `audio_format: "f32le"`, `flash_attn: true`, `use_gpu: true`.
- **Preload (`src/preload/index.ts`)** is a tight `contextBridge` surface. Renderer can't reach `ipcRenderer` directly - only the curated `window.tumar.*` methods.
- **Renderer (`src/renderer/`)** captures mic via `AudioWorkletNode` at 16 kHz mono f32 LE, ships the buffer over IPC, awaits `transcribe`. LLM tokens stream back via `webContents.send('completion-stream', token)`; the React `AskPanel` appends to the active assistant bubble character-by-character.

Native `.node` and Bare modules are correctly excluded from `asar` via electron-builder's `asarUnpack` rule - without that, the addons can't `dlopen` from inside the archive.

The system prompt builder (`lib/system-prompt.ts`) injects the live VaultState as JSON inside the system message and constrains Qwen3 with explicit guardrails: Russian only, no jargon, no investment advice, "don't know" if data is missing. We tested all four demo questions hit the right grounding paths.

### Product value - 30%

The use case is not "another chatbot." It's: **a Russian-speaking grandmother understanding her family's investments without trusting cloud anything.**

- **Russian-first** - the system prompt, UI, and demo questions are all in Russian. Whisper Tiny multilingual handles short Russian phrases adequately; numbers occasionally suffer (we flag this). Roadmap entry for Kazakh.
- **Air-gap-correct** - after model load, the *only* outbound call is the optional Cloak history decrypt (and that runs only when the user clicks "Расшифровать"). The LLM and STT paths are 100% local. We added an online/offline indicator that updates live so the demo video can show the network state changing while the conversation continues.
- **Hold-to-talk** - voice is faster than typing for long Russian queries. The mic button is a single hold-to-record gesture; release transcribes and submits in one move.

### Innovation - 20%

The cross-track surface - **Cloak viewing keys decoded by a fully offline LLM-aware app** - is the novel piece. The web app generates a vault-scoped nk; the Electron app accepts it and decrypts shielded history *on a device that cannot phone home*. The private deposits never leave the family circle.

Other niche choices:

- **Diversified viewing keys**: each vault gets its own scoped nk via `deriveDiversifiedViewingKey(nsk, vault.toBytes())` - leaking one viewing key reveals nothing about other Cloak activity.
- **`tumar-vk1.<base58>` envelope**: the human-readable prefix lets the Electron paste UI reject random base58 garbage at parse time, with a clean error message.
- **Splash + air-gap UX**: model download streams two parallel progress bars (LLM + Whisper), and the moment both hit 100% the splash dissolves into the dual-pane layout. After that the app is offline-first by construction - no warm-up calls.

### Demo - 10%

The four canonical demo questions are wired as one-tap buttons in the AskPanel (visible until the first user message, then they go away):

```
- "Сколько у меня сейчас в портфеле?"
- "Что такое SPYx?"
- "Сколько я получил в этом месяце?"
- "Что будет, если SPY упадёт на 20%?"
```

The portfolio JSON in `lib/mock-vault.ts` is structured so each question maps to a distinct field/derivation: `totalValueUsd`, the SPYx allocation row, the 30-day contribution sum, and a "20% drawdown of SPY exposure" computation respectively. The system prompt nudges the model to answer each in 2–4 sentences without preaching.

The unplug-ethernet demo: the indicator goes red, the LLM keeps streaming, the assistant bubble never wavers.

---

## Honest scope notes

- **Russian only** for v1. Kazakh is on the roadmap once we test how `WHISPER_TINY` handles its phonology. Whisper-Base (~140 MB) would help but isn't an SDK constant - needs a HuggingFace URL load.
- **No TTS.** Spec didn't ask for it; assistant output is text only.
- **No OCR.** Spec didn't ask for it.
- **No Windows/Linux .dmg.** macOS arm64 only, per spec.
- **The web's "Public rebalance" path is intentionally minimal** - Jupiter swap UI for the vault wasn't pre-existing, and we prioritized making the Cloak (private) path work end-to-end. The toggle exists; the public side will fill in next.
- **Cloak devnet is unavailable**: the published SDK doesn't bundle devnet circuits. We ship mainnet-only. Smoke testing costs cents per round-trip; not enough to be a dev-loop blocker, and judges can verify by inspecting tx signatures on Solscan.
- **Whisper Tiny on Russian** sometimes misreads numbers and proper nouns. We accept the lossy STT in exchange for a smaller (75 MB) download; the text-input path is always available as a fallback.

---

## Repo layout

```
tumar/
├── programs/tumar/             Anchor program - Vault, Member, Contribution + withdraw, close_vault, leave_vault
├── packages/shared/            TS-only - types, design tokens, mint registry
├── apps/web/                   Next.js site (Cloak integrations live here)
└── apps/family/                Electron .dmg (QVAC integration + Cloak viewing-key consumer)
```

Read the inline doc-comments - every file has a header explaining what's there and why. We optimized the codebase for being read by hackathon judges, not just for being run.
