# Rumee 🂡

Mobile-first, private **Indian 13-card Rummy** for a closed group of friends.
The host creates a room, shares an invite link, and everyone plays from their
phone browser — no app install required (optional Add to Home Screen via PWA).

## Stack

- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS v4 (portrait-first)
- **Backend:** Supabase (PostgreSQL + Realtime). No RLS by design — closed
  group, invite-link access only (see `Plan.md`)
- **Game logic:** runs client-side in a shared, unit-tested engine
  (`src/lib/cards.ts`, `src/lib/meld.ts`) with optimistic-concurrency commits
  (`games.version`) so racing/duplicate moves are safely rejected
- **Hosting:** any static host (Vercel recommended). Hash routing means no
  rewrite rules are needed

## Quick start

```bash
# 1. Create a free project at https://supabase.com
# 2. In the Supabase SQL editor, run:  supabase/schema.sql
# 3. Configure env vars
cp .env.example .env       # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

npm install
npm run dev                # develop
npm test                   # 19 engine unit tests
npm run build              # production build -> dist/
```

### Deploy to Vercel

Import the repo, set the two env vars above, and deploy (framework preset:
Vite). Share the URL with your friends.

## How a game works

1. **Host** opens the app → *Create private room* → shares the invite link.
2. **Friends** open the link, pick a nickname, tap *I'm ready* (2–9 players).
3. Host taps *Start game*. The host's device shuffles 3 decks and deals 13
   cards each; every other device syncs instantly over Supabase Realtime.
4. On your turn: tap the **deck** or **pile** to draw, select a card, then
   **Discard** — or **Declare** if your remaining 13 cards are valid.
5. After each round a scoreboard appears; the host deals the next round.
   After round 7 the final leaderboard is shown (lowest total wins) and the
   host can reset the room to play again.

## Rule decisions (configurable in `src/lib/config.ts`)

These were "to confirm" in `Plan.md`; sensible standard defaults are built in:

| Rule | Default |
| --- | --- |
| Decks | 3 × 52 cards + **2 printed jokers per deck** (162 total) |
| Wild joker | One indicator card after dealing; all cards of that rank are wild. If the indicator is a printed joker, **all Aces are wild** |
| Dealing | 13 cards each, one card face-up starts the discard pile, first turn rotates each round |
| Turn | Draw from closed deck **or** open pile, then discard. You may not discard the card you just took from the pile |
| Declaration | All 13 cards in melds; **≥ 2 sequences, ≥ 1 pure sequence**; the 14th card is discarded to close |
| Sets | 3–4 cards, same rank, all **different suits** (with 3 decks, duplicate suits are rejected) |
| Points | Ace & face cards = 10, numbers = face value, jokers = 0, **cap 80** |
| Losing score | No pure sequence → full hand counts; pure but no 2nd sequence → everything except the pure sequence counts; otherwise only ungrouped cards count |
| Multiplier | Rounds **1 and 7 double the round penalty** (×2) |
| Turn limit | 120 s, enforced with **server timestamps**. On expiry: auto-draw from the deck (if not drawn) and auto-discard the highest-point card — deterministic, so any connected client can apply it safely |
| Disconnects | The game keeps moving via the timeout auto-play; reopening the invite link on the same browser reconnects you to your seat and hand (identity in `localStorage`) |
| Rejoin | Possible at any time, even mid-round; new players can only join while the room is in the lobby |

## Data model (see `supabase/schema.sql`)

`rooms`, `room_players`, `games` (deck, discard pile, wild rank, current seat,
turn deadline, version), `player_hands` (one row per player per game),
`game_moves` (move history), `round_results` (points, multiplier, meld
groups per player per round).

## Project layout

```
src/
  lib/
    config.ts        # all tunable rules
    cards.ts         # deck building, shuffling, card helpers
    meld.ts          # sequence/set validation, declaration solver, scoring
    api.ts           # room/lobby/game actions against Supabase (guarded writes)
    supabaseClient.ts
  hooks/useRoom.ts   # realtime sync + presence + polling fallback
  pages/             # Home, RoomPage (join/reconnect), Lobby, Game
  components/        # CardView, TurnTimer, RoundOverlay
supabase/schema.sql  # tables + server_now() + realtime publication
```

No real-money features are implemented.
