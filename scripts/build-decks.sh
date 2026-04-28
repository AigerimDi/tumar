#!/usr/bin/env bash
#
# Build the Tumar pitch decks - one PDF per Frontier side track + the
# universal "all" version. The slide source lives at apps/web/app/deck/page.tsx
# (a dev-only Next.js route) and the deck is rendered to PDF by headless
# Chrome via puppeteer-core.
#
# Usage:   ./scripts/build-decks.sh
# Output:  ./decks/tumar-deck-<track>.pdf  (also copies "all" to ./tumar-deck.pdf)
#
# Requirements:
#   - Google Chrome at the standard macOS path (override with CHROME=...)
#   - Node 18+ for puppeteer-core
#   - pnpm (Next.js dev server)
#
# Why this script exists:
#   The deck source got deleted twice during the hackathon push. This file
#   is the canonical entry point - keep it, commit it, never `rm -rf
#   apps/web/app/deck` again. To edit the deck, edit page.tsx and re-run
#   this. To add a new track variant, add the slug + slide order to
#   TRACK_ORDERS in page.tsx and append it to the TRACKS array below.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"
DECKS_DIR="$ROOT/decks"
PORT="${PORT:-3099}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TRACKS=(all cloak qvac palm kz s1lkpay metaforra)

mkdir -p "$DECKS_DIR"

# ---- 1. Set up the puppeteer-core driver in /tmp (cached between runs) ----
GEN_DIR="/tmp/tumar-pdf-gen"
mkdir -p "$GEN_DIR"
if [ ! -d "$GEN_DIR/node_modules/puppeteer-core" ]; then
  echo "→ installing puppeteer-core (one-time)"
  cd "$GEN_DIR"
  npm init -y >/dev/null 2>&1
  npm install --no-save puppeteer-core@latest 2>&1 | tail -3
  cd - >/dev/null
fi

cat > "$GEN_DIR/gen.mjs" <<'JS'
import puppeteer from "puppeteer-core";

const URL = process.env.DECK_URL;
const OUT = process.env.OUT;
const CHROME = process.env.CHROME;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60_000 });
  // Wait for the problem-slide chart to render (or skip if not on this variant).
  await page.waitForFunction(
    () => {
      const chart = document.querySelector('section[data-slide] svg');
      if (!chart) return true;
      return chart.querySelectorAll("path").length >= 2;
    },
    { timeout: 30_000 },
  );
  await new Promise((r) => setTimeout(r, 600));
  await page.pdf({
    path: OUT,
    width: "1280px",
    height: "720px",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
} finally {
  await browser.close();
}
JS

# ---- 2. Start the Next.js dev server in the background ----
echo "→ starting dev server on :$PORT"
cd "$WEB_DIR"
pnpm dev --turbopack -p "$PORT" > /tmp/tumar-deck-dev.log 2>&1 &
DEV_PID=$!
trap 'kill $DEV_PID 2>/dev/null || true' EXIT

# Wait until /deck responds
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://localhost:$PORT/deck"; then break; fi
  sleep 1
done

# ---- 3. Render each variant ----
for track in "${TRACKS[@]}"; do
  echo "→ render track=$track"
  DECK_URL="http://localhost:$PORT/deck?track=$track" \
    OUT="$DECKS_DIR/tumar-deck-$track.pdf" \
    CHROME="$CHROME" \
    node "$GEN_DIR/gen.mjs"
done

# Master copy at repo root (matches what was there before).
cp "$DECKS_DIR/tumar-deck-all.pdf" "$ROOT/tumar-deck.pdf"

echo
echo "✓ wrote:"
ls -la "$DECKS_DIR"/*.pdf "$ROOT/tumar-deck.pdf"
