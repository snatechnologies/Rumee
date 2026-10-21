import { describe, expect, it } from 'vitest';
import {
  buildDeck,
  cardPoints,
  isJoker,
  parseCard,
  seededShuffle,
  shuffle,
  sortHand,
} from '../cards';
import {
  checkMeld,
  chooseTimeoutDiscard,
  hasPureSequence,
  scoreHand,
  validateDeclaration,
} from '../meld';

const c = (id: string) => parseCard(id);
const NO_WILD = 0; // wildRank 0 => no wild jokers in play

describe('deck', () => {
  it('builds exactly 3 decks with 2 printed jokers each (162 cards, unique ids)', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(3 * 52 + 3 * 2);
    expect(new Set(deck.map((d) => d.id)).size).toBe(deck.length);
    expect(deck.filter((d) => d.suit === 'J')).toHaveLength(6);
  });

  it('seeded shuffle is deterministic, random shuffle keeps all cards', () => {
    const deck = buildDeck().map((d) => d.id);
    expect(seededShuffle(deck, 'a')).toEqual(seededShuffle(deck, 'a'));
    expect(seededShuffle(deck, 'a')).not.toEqual(seededShuffle(deck, 'b'));
    expect([...shuffle(deck)].sort()).toEqual([...deck].sort());
  });
});

describe('sequences', () => {
  it('accepts pure low-ace and high-ace sequences', () => {
    expect(checkMeld([c('0:S1'), c('0:S2'), c('0:S3')], NO_WILD)).toMatchObject({
      valid: true,
      isSequence: true,
      isPureSequence: true,
    });
    expect(checkMeld([c('0:H12'), c('0:H13'), c('0:H1')], NO_WILD).valid).toBe(true);
  });

  it('rejects K-A-2 wrap-around and mixed suits', () => {
    expect(checkMeld([c('0:S13'), c('0:S1'), c('0:S2')], NO_WILD).valid).toBe(false);
    expect(checkMeld([c('0:S4'), c('0:H5'), c('0:S6')], NO_WILD).valid).toBe(false);
  });

  it('rejects duplicate ranks in one sequence even across decks', () => {
    expect(checkMeld([c('0:S5'), c('1:S5'), c('0:S6')], NO_WILD).valid).toBe(false);
  });

  it('jokers fill gaps and count as impure', () => {
    const g = checkMeld([c('0:D5'), c('0:J0'), c('0:D7')], NO_WILD);
    expect(g).toMatchObject({ valid: true, isSequence: true, isPureSequence: false });
    const g2 = checkMeld([c('0:C8'), c('1:C9'), c('0:H9')], 9); // 9♥ is wild
    expect(g2.valid).toBe(true);
    expect(g2.isPureSequence).toBe(false);
  });

  it('jokers can extend sequence ends', () => {
    expect(checkMeld([c('0:S3'), c('0:S4'), c('0:J0'), c('1:J1')], NO_WILD).valid).toBe(true);
  });
});

describe('sets', () => {
  it('accepts same rank with distinct suits (incl. across decks)', () => {
    expect(
      checkMeld([c('0:S9'), c('1:H9'), c('2:D9')], NO_WILD),
    ).toMatchObject({ valid: true, isSequence: false });
    expect(checkMeld([c('0:S13'), c('0:H13'), c('0:D13'), c('0:C13')], NO_WILD).valid).toBe(
      true,
    );
  });

  it('rejects duplicate suits and sets over 4 cards', () => {
    expect(checkMeld([c('0:S9'), c('1:S9'), c('0:H9')], NO_WILD).valid).toBe(false);
    expect(
      checkMeld([c('0:S9'), c('0:H9'), c('0:D9'), c('0:C9'), c('1:S9')], NO_WILD).valid,
    ).toBe(false);
  });

  it('accepts sets completed with jokers', () => {
    expect(checkMeld([c('0:S7'), c('0:H7'), c('0:J1')], NO_WILD).valid).toBe(true);
  });
});


describe('declaration', () => {
  // A23♠ pure | 5♥6♥+joker impure seq | 9♠9♥9♦ set | K♠K♥K♦K♣ set = 13 cards
  const validHand = [
    '0:S1', '0:S2', '0:S3',
    '0:H5', '0:H6', '0:J0',
    '0:S9', '0:H9', '0:D9',
    '0:S13', '0:H13', '0:D13', '0:C13',
  ];

  it('accepts a valid 13-card declaration', () => {
    const g = validateDeclaration(validHand, NO_WILD);
    expect(g).not.toBeNull();
    expect(g!.ungrouped).toHaveLength(0);
    expect(g!.sequenceCount).toBeGreaterThanOrEqual(2);
    expect(g!.pureSequenceCount).toBeGreaterThanOrEqual(1);
  });

  it('rejects a hand with no pure sequence', () => {
    const impure = [
      '0:S1', '0:S2', '0:J0',
      '0:H5', '0:H6', '0:J1',
      '0:S9', '0:H9', '0:D9',
      '0:S13', '0:H13', '0:D13', '0:C13',
    ];
    expect(validateDeclaration(impure, NO_WILD)).toBeNull();
  });

  it('rejects wrong hand size', () => {
    expect(validateDeclaration(validHand.slice(0, 12), NO_WILD)).toBeNull();
  });
});

describe('scoring', () => {
  it('no pure sequence -> full count, capped at 80', () => {
    const hand = [
      '0:S1', '0:H2', '0:D4', '0:C6',
      '0:S8', '0:H9', '0:D10', '0:C11',
      '0:S12', '0:H13', '0:D5', '1:C7',
      '1:S3',
    ];
    const r = scoreHand(hand, NO_WILD);
    expect(r.reason).toBe('no-pure-sequence');
    expect(r.points).toBe(80); // raw is well above the cap
  });

  it('pure seq + second sequence -> only ungrouped cards count', () => {
    const hand = [
      '0:S1', '0:S2', '0:S3', // pure
      '0:H5', '0:H6', '0:J0', // impure 2nd sequence
      '0:S9', '0:H9', '0:D9', // set
      '0:C4', '0:C7', '0:D12', '1:H11', // junk: 4+7+10+10 = 31
    ];
    const r = scoreHand(hand, NO_WILD);
    expect(r.reason).toBe('valid');
    expect(r.points).toBe(31);
  });

  it('pure seq but no second sequence -> everything except the pure seq counts', () => {
    const hand = [
      '0:S1', '0:S2', '0:S3', // pure seq (6 pts)
      '0:H13', '0:D13',
      '0:C5', '1:C6', '0:H8', '0:D9', '1:S10', '2:H11', '0:C12', '1:D7',
    ];
    const r = scoreHand(hand, NO_WILD);
    expect(r.reason).toBe('no-second-sequence');
    expect(r.ungrouped).toHaveLength(10);
  });

  it('jokers are worth zero, aces and faces are 10', () => {
    expect(cardPoints(c('0:J0'), NO_WILD)).toBe(0);
    expect(cardPoints(c('0:S1'), NO_WILD)).toBe(10);
    expect(cardPoints(c('0:S11'), NO_WILD)).toBe(10);
    expect(cardPoints(c('0:S7'), NO_WILD)).toBe(7);
    expect(isJoker(c('0:H5'), 5)).toBe(true);
    expect(cardPoints(c('0:H5'), 5)).toBe(0);
  });
});

describe('timeout behaviour', () => {
  it('discards the highest-point card, deterministic on ties', () => {
    const hand = ['0:S2', '0:H13', '1:D13', '0:C5'];
    expect(chooseTimeoutDiscard(hand, NO_WILD)).toBe('0:H13'); // '0:H13' < '1:D13'
  });
});

describe('sorting', () => {
  it('sorts by suit then rank', () => {
    expect(sortHand(['0:H5', '0:S2', '0:H3'], 'suit')).toEqual(['0:S2', '0:H3', '0:H5']);
  });
});

describe('wild-joker reveal (pure sequence gate)', () => {
  it('detects a natural run of 3, including Q-K-A and A-2-3', () => {
    expect(hasPureSequence(['0:S5', '0:S6', '0:S7'], NO_WILD)).toBe(true);
    expect(hasPureSequence(['0:H12', '0:H13', '0:H1'], NO_WILD)).toBe(true);
    expect(hasPureSequence(['0:D1', '0:D2', '0:D3'], NO_WILD)).toBe(true);
  });

  it('returns false with only pairs, joker-assisted runs, or wild-rank cards', () => {
    expect(hasPureSequence(['0:S5', '0:S6', '0:H9'], NO_WILD)).toBe(false);
    // printed joker completes the run visually but is not pure
    expect(hasPureSequence(['0:S5', '0:S6', '0:J0'], NO_WILD)).toBe(false);
    // 7♠ is wild when wildRank = 7, so 5-6-7♠ does not count as pure
    expect(hasPureSequence(['0:S5', '0:S6', '0:S7'], 7)).toBe(false);
  });
});
