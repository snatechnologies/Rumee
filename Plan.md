# Mobile Multiplayer Indian Rummy — Project Brief

## Goal
Build a mobile-first private Indian 13-card Rummy web app. A host creates a room and shares an invite link so close friends can join and play on their phones without installing an app.

## Recommended Stack
- **Frontend:** React + Vite + TypeScript
- **UI:** Tailwind CSS; portrait-first, touch-friendly design
- **Backend:** Supabase PostgreSQL + Supabase Realtime
- **Hosting:** Vercel
- **Installability:** Progressive Web App (PWA)

## Game Requirements
- **Variant:** Indian 13-card Rummy
- **Players:** 2–9 players per room; maximum 9
- **Decks:** Exactly 3 standard 52-card decks. Confirm whether jokers are included and how many.
- **Match:** 7 rounds/steps
- **Scoring multiplier:** Round 1 and Round 7 points are doubled; rounds 2–6 use normal scoring
- **Turn limit:** Maximum 2 minutes per player turn
- **Private rooms:** Join through a unique invite link. Keep room access private.
- **Mobile only:** Optimize for phone browsers; support optional Add to Home Screen via PWA.

## Main User Flow
1. Host creates a room and receives a shareable invite link.
2. Friends open the link, enter a nickname or authenticate, and join the lobby.
3. Host starts the game when ready.
4. Players take turns drawing and discarding cards; the server validates every move.
5. The server handles declarations, round results, scoring, and progression through all 7 rounds.
6. Show the final leaderboard and total scores.

## Core Screens
- Create/join room
- Lobby with players, ready status, and invite-link copy/share
- Game table with the player's private hand, draw/discard piles, current turn, and countdown
- Round result and match leaderboard

## Security and Multiplayer Rules
- make logics simple in client side, it will be used by closed group
- No RLS policy required
- Use server timestamps for turn deadlines. When 2 minutes expire, apply a deterministic timeout action and advance the game safely.
- Handle refreshes, reconnects, duplicate requests, and players who disconnect.
- Do not implement real-money betting, deposits, or payouts.

## Suggested Data Model
- `rooms`: host, invite token, status, settings
- `room_players`: room, player identity, nickname, ready/connection status
- `games`: room, current round, current turn, status, deadline, scores
- `player_hands`: private cards per player
- `game_moves`: validated move history and timestamps
- `round_results`: declarations, penalties, round scores, multiplier, final totals

Apply RLS policies to every exposed table. Keep authoritative deck state and move processing on the server.

## Rules to Confirm Before Implementation
Do not guess these rules; make them configurable or ask for clarification:
- Joker setup: printed jokers, wild joker selection, and number of jokers
- Exact dealing and draw/discard rules for 3 decks
- Valid sequence/set rules and declaration validation
- Point values, penalty cap, and scoring formula
- Whether the first/last-round multiplier doubles penalty points, round totals, or both
- Timeout behavior (e.g., automatic discard, penalty, or forfeiture)
- What happens when a player disconnects or leaves mid-game
- Whether all 7 rounds use the same rules and whether players can rejoin

## Acceptance Criteria
- A host can create a private room and share a working invite link.
- Up to 9 players can join one room from mobile browsers.
- A game uses exactly 3 decks and supports 13-card Indian Rummy.
- The match runs for 7 rounds; rounds 1 and 7 apply the configured 2× scoring multiplier.
- Each turn has a client-enforced 120-second deadline.
- Game state stays synchronized across players, while hands remain private.
- Validate moves on client side itself
- Reconnecting players can recover their current game view.
- The app is usable on common Android and iPhone screen sizes.

