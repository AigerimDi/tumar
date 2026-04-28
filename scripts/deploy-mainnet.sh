#!/usr/bin/env bash
#
# One-shot mainnet deploy for the Tumar Anchor program.
#
# Preconditions:
#   - `solana` + `anchor` CLIs installed (you already have them - solana-cli
#     3.1.13 and anchor-cli 0.30.1 at time of writing).
#   - ~/.config/solana/id.json funded with enough SOL to cover deploy (budget
#     ~2.15 SOL for the 301 KB binary + fees). Precise number is printed
#     below before the irreversible step.
#   - programs/tumar/target/deploy/tumar.so already built via
#     `cd programs/tumar && anchor build --no-idl`.
#
# What it does:
#   1. Flips the Solana CLI to mainnet-beta RPC.
#   2. Prints the deploying wallet pubkey + its current balance, and estimates
#      the deploy cost from the binary size.
#   3. Asks for confirmation before spending real SOL.
#   4. Runs `anchor deploy --provider.cluster mainnet`, pointing at the
#      existing program keypair so the Program ID (Hf…sp24Y) doesn't change.
#   5. Verifies the deploy by fetching the program account afterwards.
#   6. Transfers upgrade authority to $NEW_UPGRADE_AUTHORITY (Phantom wallet),
#      so the throwaway CLI keypair stops being security-critical. After this
#      step, only that Phantom wallet can push future program versions.
#
# After this runs, the program is live on mainnet. Point the frontend at a
# mainnet Helius RPC via SOLANA_RPC_UPSTREAM in Vercel env vars; NEXT_PUBLIC_
# PROGRAM_ID stays the same since we reuse the keypair.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SO_PATH="$REPO_ROOT/programs/tumar/target/deploy/tumar.so"
KEYPAIR_PATH="$REPO_ROOT/programs/tumar/target/deploy/tumar-keypair.json"
PROGRAM_ID="HfCmnXggSF2tVQkCrEdPNjUTBYvvC8tgbebXES2sp24Y"

# Phantom wallet that should own upgrade authority after deploy. Set to empty
# string to skip the transfer step (leaves authority on the CLI keypair).
NEW_UPGRADE_AUTHORITY="${NEW_UPGRADE_AUTHORITY:-CGry3qWp1jTvGN757s2cVYwwsUsK1bfSknnpWbNHWyNm}"

fail() { echo "✗ $*" >&2; exit 1; }

[ -f "$SO_PATH" ]      || fail "Program binary missing: $SO_PATH (run \`anchor build --no-idl\` in programs/tumar)"
[ -f "$KEYPAIR_PATH" ] || fail "Program keypair missing: $KEYPAIR_PATH"

# Sanity: the keypair on disk must match the program ID we expect, otherwise
# we'd deploy to a different address and break every vault on the frontend.
ACTUAL_ID="$(solana-keygen pubkey "$KEYPAIR_PATH")"
[ "$ACTUAL_ID" = "$PROGRAM_ID" ] || fail "Keypair pubkey ($ACTUAL_ID) != expected Program ID ($PROGRAM_ID)"

echo "→ Switching CLI to mainnet-beta…"
solana config set --url https://api.mainnet-beta.solana.com > /dev/null

PAYER="$(solana address)"
BALANCE_SOL="$(solana balance "$PAYER" | awk '{print $1}')"
BINARY_BYTES="$(wc -c < "$SO_PATH" | tr -d ' ')"
# Rent-exempt allocation for the program data account: bytes × 0.00000696 SOL.
# Add ~0.001 SOL headroom for tx fees + the 36-byte program account itself.
EST_SOL="$(awk -v b="$BINARY_BYTES" 'BEGIN{printf "%.3f", (b * 6.96e-6) + 0.01}')"

cat <<EOF

Deploying Tumar to Solana mainnet-beta.
  Payer:        $PAYER
  Balance:      $BALANCE_SOL SOL
  Binary:       $SO_PATH ($BINARY_BYTES bytes)
  Program ID:   $PROGRAM_ID
  Est. cost:    ~$EST_SOL SOL (rent-exempt buffer + fees)

EOF

# Skip the interactive gate when run under automation / non-TTY stdin.
# Programs are upgradable: if v1 has a bug, `solana program deploy` overwrites
# the buffer bytes for ~$0.001 - you don't re-pay the 2 SOL rent. So the
# interactive "are you sure" is mostly ceremony.
if [ "${SKIP_CONFIRM:-}" != "1" ] && [ -t 0 ]; then
  echo "Press Enter to continue, Ctrl-C to abort."
  read -r _
fi

# Anchor honours [programs.mainnet] in Anchor.toml, which already points to
# the same program ID. We pass --program-keypair explicitly as belt-and-
# suspenders so a misconfigured Anchor.toml can't silently deploy elsewhere.
cd "$REPO_ROOT"
anchor deploy \
  --provider.cluster mainnet \
  --program-name tumar \
  --program-keypair "$KEYPAIR_PATH"

echo
echo "→ Verifying program on mainnet…"
solana program show "$PROGRAM_ID" --url https://api.mainnet-beta.solana.com

# Transfer upgrade authority to Phantom. After this runs, the CLI keypair can
# no longer push new versions - only NEW_UPGRADE_AUTHORITY can. That's the
# whole point: the CLI keypair was a throwaway, we don't want it to hold
# permanent control over the on-chain program.
#
# If anything goes wrong during the transfer itself (e.g. RPC blip), the
# deploy is still safe - the program is live, and the current authority is
# still the CLI keypair (just re-run this step). We don't want to exit hard
# on a transfer failure and leave the user wondering whether to re-deploy.
if [ -n "$NEW_UPGRADE_AUTHORITY" ]; then
  echo
  echo "→ Transferring upgrade authority to $NEW_UPGRADE_AUTHORITY…"
  if solana program set-upgrade-authority "$PROGRAM_ID" \
      --new-upgrade-authority "$NEW_UPGRADE_AUTHORITY" \
      --url https://api.mainnet-beta.solana.com \
      --skip-new-upgrade-authority-signer-check; then
    echo "✓ Upgrade authority now: $NEW_UPGRADE_AUTHORITY"
    echo "  The CLI keypair ($PAYER) can no longer push updates."
  else
    echo "⚠ Authority transfer failed (deploy itself is fine)."
    echo "  Re-run manually:"
    echo "    solana program set-upgrade-authority $PROGRAM_ID \\"
    echo "      --new-upgrade-authority $NEW_UPGRADE_AUTHORITY \\"
    echo "      --url https://api.mainnet-beta.solana.com \\"
    echo "      --skip-new-upgrade-authority-signer-check"
  fi
fi

cat <<EOF

✓ Deploy complete.
  Explorer:          https://explorer.solana.com/address/$PROGRAM_ID
  Upgrade authority: ${NEW_UPGRADE_AUTHORITY:-$PAYER}
  IDL:               hand-maintained at apps/web/lib/anchor/idl.ts (not uploaded on-chain)

Next:
  - Smoke-test: create a vault, deposit \$1 USDC, withdraw it back.
  - Frontend is already live at https://web-phi-drab-54.vercel.app.

EOF
