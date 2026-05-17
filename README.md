# Parlay Tracker

NBA playoff milestone parlay simulator. Strict 5/5 hit-rate discovery, adjustable 3–8 leg parlays, bankroll tracking.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and add optional `BALLDONTLIE_API_KEY`
3. `npm run dev` → http://localhost:3000

**Stats:** Uses BallDontLie when a key is set; otherwise falls back to stats.nba.com for playoff game logs.

**Odds:** FanDuel player milestone odds require BDL GOAT tier. The app estimates odds from buffer when live props are unavailable.

**Storage:** Local dev uses `.data/parlay_state.json`. On Vercel, connect KV (or Upstash Redis) and set `KV_REST_API_URL` / `KV_REST_API_TOKEN`.

## Daily use

1. ~3pm: open the app — tonight's games and full team rosters load automatically (BallDontLie + NBA fallback)
2. Set parlay leg slider (3–8), tap **Create Parlay**
3. Enter legs manually on FanDuel
4. After games: tap **Settle**

No manual player list needed. Uses Eastern Time for "tonight."

## iPhone PWA

Deploy to Vercel → open in Safari → Share → Add to Home Screen.

## Deploy (Vercel)

1. Push to GitHub and import in Vercel
2. Add env vars: `BALLDONTLIE_API_KEY`, `NBA_SEASON=2025`, KV credentials
3. Add PWA icons: `public/icon-192.png` and `public/icon-512.png`
