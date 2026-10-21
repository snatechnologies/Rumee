import { GAME_CONFIG, type GameConfig } from './config';

export type Suit = 'S' | 'H' | 'D' | 'C';

export interface Card {
  /** Stable unique id, e.g. "0:S1" (deck 0, ace of spades) or "2:J1" (printed joker). */
  id: string;
  deck: number;
  suit: Suit | 'J';
  /** 1 = Ace ... 11 = J, 12 = Q, 13 = K. Printed jokers are rank 0. */
  rank: number;
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export const RANK_LABEL: Record<number, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

/** Build the full multi-deck shoe (3 decks + printed jokers by default). */
export function buildDeck(cfg: GameConfig = GAME_CONFIG): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < cfg.decks; d++) {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        cards.push({ id: `${d}:${suit}${rank}`, deck: d, suit, rank });
      }
    }
    for (let j = 0; j < cfg.printedJokersPerDeck; j++) {
      cards.push({ id: `${d}:J${j}`, deck: d, suit: 'J', rank: 0 });
    }
  }
  return cards;
}

export function parseCard(id: string): Card {
  const [deckStr, rest] = id.split(':');
  const deck = Number(deckStr);
  if (rest.startsWith('J')) return { id, deck, suit: 'J', rank: 0 };
  const suit = rest[0] as Suit;
  const rank = Number(rest.slice(1));
  return { id, deck, suit, rank };
}

export function cardMap(ids: string[]): Map<string, Card> {
  const m = new Map<string, Card>();
  for (const id of ids) m.set(id, parseCard(id));
  return m;
}

export function isPrintedJoker(c: Card): boolean {
  return c.suit === 'J';
}

/** A wild joker is any natural card whose rank equals the round's wild rank. */
export function isWildJoker(c: Card, wildRank: number): boolean {
  return c.suit !== 'J' && wildRank > 0 && c.rank === wildRank;
}

export function isJoker(c: Card, wildRank: number): boolean {
  return isPrintedJoker(c) || isWildJoker(c, wildRank);
}

/** Point value of a single card when left ungrouped. */
export function cardPoints(
  c: Card,
  wildRank: number,
  cfg: GameConfig = GAME_CONFIG,
): number {
  if (isJoker(c, wildRank)) return 0;
  if (c.rank === 1) return cfg.acePoints;
  if (c.rank >= 11) return cfg.faceCardPoints;
  return c.rank;
}

/** mulberry32 — small deterministic PRNG used for reproducible reshuffles. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deterministic shuffle used when the discard pile is recycled mid-round. */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  return shuffle(arr, mulberry32(hashSeed(seed)));
}

export function sortHand(ids: string[], by: 'suit' | 'rank'): string[] {
  const cards = ids.map(parseCard);
  const suitOrder: Record<string, number> = { S: 0, H: 1, C: 2, D: 3, J: 4 };
  cards.sort((a, b) => {
    if (by === 'suit') {
      return (
        suitOrder[a.suit] - suitOrder[b.suit] || a.rank - b.rank || a.deck - b.deck
      );
    }
    const ra = a.rank === 0 ? 99 : a.rank === 1 ? 14 : a.rank;
    const rb = b.rank === 0 ? 99 : b.rank === 1 ? 14 : b.rank;
    return rb - ra || suitOrder[a.suit] - suitOrder[b.suit] || a.deck - b.deck;
  });
  return cards.map((c) => c.id);
}
