/**
 * Central, tweakable game rules.
 *
 * These are the defaults chosen for the rules marked "to confirm" in Plan.md.
 * Everything below is applied client-side by the shared engine, so every
 * player validates with exactly the same configuration.
 */
export const GAME_CONFIG = {
  /** Exactly 3 standard 52-card decks. */
  decks: 3,
  /** Printed jokers shipped with each deck (2 per deck => 6 total). */
  printedJokersPerDeck: 2,
  /** Cards dealt to each player. */
  handSize: 13,
  /** Match length in rounds ("steps"). */
  rounds: 7,
  /** Rounds whose penalty points are doubled. */
  doubledRounds: [1, 7] as number[],
  /** Multiplier applied on doubledRounds. Multiplies the round penalty points. */
  doubledMultiplier: 2,
  /** Hard per-turn limit in seconds. */
  turnSeconds: 120,
  minPlayers: 2,
  maxPlayers: 9,
  /** Points for Ace and face cards (K/Q/J). */
  acePoints: 10,
  faceCardPoints: 10,
  /** Maximum penalty a player can take in one round. */
  penaltyCap: 80,
  /**
   * If the wild-joker indicator card is a printed joker, every Ace becomes
   * wild instead (standard Indian rummy house rule).
   */
  acesWildWhenIndicatorIsPrintedJoker: true,
  /**
   * A card picked from the open discard pile may not be discarded again on
   * the same turn.
   */
  cannotDiscardPickedFromPile: true,
  /**
   * Timeout behaviour: if the player has not drawn yet, auto-draw from the
   * closed deck; then (always) auto-discard the highest-point card in hand.
   * Fully deterministic so any client can safely apply it.
   */
  timeoutAutoPlay: true,
} as const;

export type GameConfig = typeof GAME_CONFIG;
