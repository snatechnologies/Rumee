import { Card, cardPoints, isJoker, isPrintedJoker, isWildJoker, parseCard } from './cards';
import { GAME_CONFIG, type GameConfig } from './config';

export interface MeldInfo {
  valid: boolean;
  isSequence: boolean;
  /** True only for a sequence made purely of natural cards. */
  isPureSequence: boolean;
}

const NONE: MeldInfo = { valid: false, isSequence: false, isPureSequence: false };

/**
 * Validate a group of 3+ cards as a rummy meld.
 * Sequence: same suit, consecutive ranks, ace high or low (never wrapping).
 * Set: same rank, all different suits, 3-4 cards.
 * Printed + wild jokers substitute for any card.
 */
export function checkMeld(group: Card[], wildRank: number): MeldInfo {
  if (group.length < 3) return NONE;

  const jokers = group.filter((c) => isJoker(c, wildRank));
  const naturals = group.filter((c) => !isJoker(c, wildRank));
  const pure = jokers.length === 0;

  // --- Sequence? ---
  if (naturals.length > 0 && naturals.every((c) => c.suit === naturals[0].suit)) {
    for (const aceHigh of [false, true]) {
      const ranks = naturals
        .map((c) => (c.rank === 1 && aceHigh ? 14 : c.rank))
        .sort((a, b) => a - b);
      // Two naturals of the same rank cannot sequence together.
      if (new Set(ranks).size !== ranks.length) continue;
      // Two aces never belong to the same sequence.
      if (!aceHigh && ranks.filter((r) => r === 1).length > 1) continue;
      const span = ranks[ranks.length - 1] - ranks[0] + 1;
      if (span - naturals.length <= jokers.length) {
        return { valid: true, isSequence: true, isPureSequence: pure };
      }
    }
  }

  // --- Set? ---
  if (group.length <= 4 && naturals.length > 0) {
    const sameRank = naturals.every((c) => c.rank === naturals[0].rank);
    const suits = naturals.map((c) => c.suit);
    if (sameRank && new Set(suits).size === suits.length) {
      return { valid: true, isSequence: false, isPureSequence: false };
    }
  }

  return NONE;
}

export interface Grouping {
  groups: Card[][];
  ungrouped: Card[];
  /** Penalty points of the ungrouped cards. */
  points: number;
  sequenceCount: number;
  pureSequenceCount: number;
}

interface MeldMask {
  mask: number;
  isSeq: boolean;
  pureSeq: boolean;
}

/**
 * Partition `cards` to minimise ungrouped penalty points, subject to the
 * Indian-rummy requirement of at least `minSeq` sequences including at least
 * `minPure` pure ones. Returns null when no arrangement meets the sequence
 * requirements. Uses bitmask DP — fast for 13 cards.
 */
export function optimizeGrouping(
  cards: Card[],
  wildRank: number,
  minSeq = 2,
  minPure = 1,
  cfg: GameConfig = GAME_CONFIG,
): Grouping | null {
  const n = cards.length;
  const pts = cards.map((c) => cardPoints(c, wildRank, cfg));

  // Pre-compute every valid meld subset (size >= 3).
  const meldsContaining: MeldMask[][] = Array.from({ length: n }, () => []);
  const total = 1 << n;
  for (let mask = 0; mask < total; mask++) {
    let size = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) size++;
    if (size < 3) continue;
    const group: Card[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) group.push(cards[i]);
    const info = checkMeld(group, wildRank);
    if (!info.valid) continue;
    const m: MeldMask = { mask, isSeq: info.isSequence, pureSeq: info.isPureSequence };
    for (let i = 0; i < n; i++) if (mask & (1 << i)) meldsContaining[i].push(m);
  }

  const memo = new Map<string, Grouping | null>();

  function solve(mask: number, seq: number, pure: boolean): Grouping | null {
    if (mask === 0) {
      return seq >= minSeq && pure
        ? { groups: [], ungrouped: [], points: 0, sequenceCount: 0, pureSequenceCount: 0 }
        : null;
    }
    const key = `${mask}:${seq}:${pure ? 1 : 0}`;
    if (memo.has(key)) return memo.get(key)!;

    let lowest = 0;
    while (!(mask & (1 << lowest))) lowest++;
    const bit = 1 << lowest;

    let best: Grouping | null = null;
    const consider = (g: Grouping | null) => {
      if (!g) return;
      if (
        !best ||
        g.points < best.points ||
        (g.points === best.points && g.ungrouped.length < best.ungrouped.length)
      ) {
        best = g;
      }
    };

    // Option 1: leave the lowest card ungrouped.
    const rest = solve(mask ^ bit, seq, pure);
    if (rest) {
      consider({
        groups: rest.groups,
        ungrouped: [cards[lowest], ...rest.ungrouped],
        points: rest.points + pts[lowest],
        sequenceCount: rest.sequenceCount,
        pureSequenceCount: rest.pureSequenceCount,
      });
    }

    // Option 2: put the lowest card into a meld.
    for (const m of meldsContaining[lowest]) {
      if ((m.mask & ~mask) !== 0) continue;
      const next = solve(
        mask ^ m.mask,
        Math.min(minSeq, seq + (m.isSeq ? 1 : 0)),
        pure || m.pureSeq,
      );
      if (!next) continue;
      const groupCards: Card[] = [];
      for (let i = 0; i < n; i++) if (m.mask & (1 << i)) groupCards.push(cards[i]);
      consider({
        groups: [groupCards, ...next.groups],
        ungrouped: next.ungrouped,
        points: next.points,
        sequenceCount: next.sequenceCount + (m.isSeq ? 1 : 0),
        pureSequenceCount: next.pureSequenceCount + (m.pureSeq ? 1 : 0),
      });
    }

    memo.set(key, best);
    return best;
  }

  return solve(total - 1, 0, false);
}

/**
 * Validate a 13-card declaration: every card must belong to a meld, with at
 * least two sequences, at least one of them pure.
 */
export function validateDeclaration(
  handIds: string[],
  wildRank: number,
  cfg: GameConfig = GAME_CONFIG,
): Grouping | null {
  if (handIds.length !== cfg.handSize) return null;
  const cards = handIds.map(parseCard);
  const best = optimizeGrouping(cards, wildRank, 2, 1, cfg);
  if (!best || best.ungrouped.length > 0) return null;
  return best;
}

export interface ScoreResult {
  /** Penalty after the cap. */
  points: number;
  /** Penalty before the cap. */
  rawPoints: number;
  groups: Card[][];
  ungrouped: Card[];
  /** Why the score is what it is — handy for the result screen. */
  reason: 'valid' | 'no-pure-sequence' | 'no-second-sequence';
}

/**
 * Score a losing hand after someone declares.
 *  - No pure sequence             -> every card counts.
 *  - Pure seq but no 2nd sequence -> everything except the best pure seq counts.
 *  - Pure seq + another sequence  -> only cards that cannot be grouped count.
 * Capped at cfg.penaltyCap.
 */
export function scoreHand(
  handIds: string[],
  wildRank: number,
  cfg: GameConfig = GAME_CONFIG,
): ScoreResult {
  const cards = handIds.map(parseCard);
  const totalPoints = cards.reduce((s, c) => s + cardPoints(c, wildRank, cfg), 0);

  const full = optimizeGrouping(cards, wildRank, 2, 1, cfg);
  if (full) {
    return {
      points: Math.min(full.points, cfg.penaltyCap),
      rawPoints: full.points,
      groups: full.groups,
      ungrouped: full.ungrouped,
      reason: 'valid',
    };
  }

  // Best standalone pure sequence.
  let bestPure: Card[] | null = null;
  let bestPurePoints = -1;
  const n = cards.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    let size = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) size++;
    if (size < 3) continue;
    const group: Card[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) group.push(cards[i]);
    if (group.some((c) => isJoker(c, wildRank))) continue;
    const info = checkMeld(group, wildRank);
    if (!info.valid || !info.isPureSequence) continue;
    const p = group.reduce((s, x) => s + cardPoints(x, wildRank, cfg), 0);
    if (p > bestPurePoints) {
      bestPurePoints = p;
      bestPure = group;
    }
  }

  if (bestPure) {
    const used = new Set(bestPure.map((x) => x.id));
    const ungrouped = cards.filter((x) => !used.has(x.id));
    const raw = totalPoints - bestPurePoints;
    return {
      points: Math.min(raw, cfg.penaltyCap),
      rawPoints: raw,
      groups: [bestPure],
      ungrouped,
      reason: 'no-second-sequence',
    };
  }

  return {
    points: Math.min(totalPoints, cfg.penaltyCap),
    rawPoints: totalPoints,
    groups: [],
    ungrouped: cards,
    reason: 'no-pure-sequence',
  };
}

/** Deterministic auto-discard for timeouts: highest points, then smallest id. */
export function chooseTimeoutDiscard(handIds: string[], wildRank: number): string {
  let best: string | null = null;
  let bestPts = -1;
  for (const id of handIds) {
    const p = cardPoints(parseCard(id), wildRank);
    if (p > bestPts || (p === bestPts && best !== null && id < best)) {
      best = id;
      bestPts = p;
    }
  }
  return best!;
}

export function isPrintedJokerId(id: string): boolean {
  return isPrintedJoker(parseCard(id));
}

function hasRunOf3(sortedRanks: number[]): boolean {
  let run = 1;
  for (let i = 1; i < sortedRanks.length; i++) {
    run = sortedRanks[i] === sortedRanks[i - 1] + 1 ? run + 1 : 1;
    if (run >= 3) return true;
  }
  return false;
}

/**
 * True when the hand holds at least one pure sequence: 3+ consecutive cards
 * of one suit using only natural cards — no printed jokers and no wild-rank
 * cards. Ace works low (A-2-3) and high (Q-K-A).
 *
 * Used to gate the wild-joker reveal: a player only gets to see which rank
 * is wild once they have made their "first life" without any joker.
 */
export function hasPureSequence(handIds: string[], wildRank: number): boolean {
  const bySuit: Record<string, number[]> = { S: [], H: [], D: [], C: [] };
  for (const id of handIds) {
    const c = parseCard(id);
    if (c.suit === 'J' || isWildJoker(c, wildRank)) continue;
    bySuit[c.suit].push(c.rank);
  }
  for (const suit of Object.keys(bySuit)) {
    const ranks = [...new Set(bySuit[suit])].sort((a, b) => a - b);
    if (hasRunOf3(ranks)) return true;
    // Try again with ace high (1 -> 14).
    if (ranks.includes(1)) {
      const high = ranks.filter((r) => r !== 1).concat(14).sort((a, b) => a - b);
      if (hasRunOf3(high)) return true;
    }
  }
  return false;
}
