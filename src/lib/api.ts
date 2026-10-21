import { buildDeck, seededShuffle, shuffle } from './cards';
import { GAME_CONFIG as CFG } from './config';
import { chooseTimeoutDiscard, scoreHand, validateDeclaration } from './meld';
import { requireSupabase } from './supabaseClient';
import type {
  GameRow,
  HandRow,
  PlayerRow,
  RoomRow,
  RoundResultRow,
  StoredIdentity,
} from './types';

/* ------------------------------------------------------------------ */
/* Identity (localStorage) — lets a refreshed/reopened browser rejoin  */
/* ------------------------------------------------------------------ */

const idKey = (token: string) => `rumee:identity:${token}`;

export function saveIdentity(token: string, identity: StoredIdentity): void {
  localStorage.setItem(idKey(token), JSON.stringify(identity));
}

export function loadIdentity(token: string): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(idKey(token));
    return raw ? (JSON.parse(raw) as StoredIdentity) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Server clock — deadlines are based on Postgres time, not the phone  */
/* ------------------------------------------------------------------ */

let clockOffsetMs: number | null = null;

/**
 * Work out the offset between the device clock and the server clock.
 * Primary source: the `server_now()` RPC (Postgres `now()`).
 * Fallback: the HTTP `Date` header that PostgREST sends on every response —
 * always available, so turn deadlines stay server-based even if the RPC
 * is missing. If both fail we silently use the device clock.
 */
export async function syncServerClock(): Promise<void> {
  const midpoint = (before: number) => Math.round((before + Date.now()) / 2);

  try {
    const sb = requireSupabase();
    const before = Date.now();
    const { data, error } = await sb.rpc('server_now');
    if (error) throw error;
    clockOffsetMs = new Date(data as string).getTime() - midpoint(before);
    return;
  } catch {
    /* RPC unavailable — try the HTTP Date header instead */
  }

  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const before = Date.now();
    const res = await fetch(`${url}/rest/v1/`, { method: 'HEAD', headers: { apikey: key } });
    const date = res.headers.get('date');
    clockOffsetMs = date ? new Date(date).getTime() - midpoint(before) : null;
  } catch {
    clockOffsetMs = null;
  }
}

/** Best estimate of the current server time. */
export function serverNow(): Date {
  return new Date(Date.now() + (clockOffsetMs ?? 0));
}

export function freshDeadline(): string {
  return new Date(serverNow().getTime() + CFG.turnSeconds * 1000).toISOString();
}

/* ------------------------------------------------------------------ */
/* Rooms & lobby                                                       */
/* ------------------------------------------------------------------ */

export async function getRoomByToken(token: string): Promise<RoomRow | null> {
  const sb = requireSupabase();
  const { data } = await sb
    .from('rooms')
    .select('*')
    .eq('invite_token', token)
    .maybeSingle();
  return (data as RoomRow) ?? null;
}

export async function getPlayers(roomId: string): Promise<PlayerRow[]> {
  const sb = requireSupabase();
  const { data } = await sb
    .from('room_players')
    .select('*')
    .eq('room_id', roomId)
    .order('seat', { ascending: true });
  return (data as PlayerRow[]) ?? [];
}

export async function createRoom(nickname: string): Promise<{ room: RoomRow; player: PlayerRow }> {
  const sb = requireSupabase();
  const invite_token = crypto.randomUUID();
  const { data: room, error: roomErr } = await sb
    .from('rooms')
    .insert({ invite_token, status: 'lobby' })
    .select()
    .single();
  if (roomErr) throw roomErr;
  const { data: player, error: playerErr } = await sb
    .from('room_players')
    .insert({ room_id: room.id, nickname, seat: 0, is_host: true, is_ready: true })
    .select()
    .single();
  if (playerErr) throw playerErr;
  await sb.from('rooms').update({ host_player_id: player.id }).eq('id', room.id);
  saveIdentity(invite_token, { roomId: room.id, playerId: player.id, nickname });
  return { room: room as RoomRow, player: player as PlayerRow };
}

export async function joinRoom(
  token: string,
  nickname: string,
): Promise<{ room: RoomRow; player: PlayerRow }> {
  const sb = requireSupabase();
  const room = await getRoomByToken(token);
  if (!room) throw new Error('Room not found. Check the invite link.');
  if (room.status !== 'lobby') throw new Error('This game has already started.');
  const players = await getPlayers(room.id);
  if (players.length >= CFG.maxPlayers) throw new Error('This room is full (9 players).');
  const seat = players.reduce((m, p) => Math.max(m, p.seat), -1) + 1;
  const { data: player, error } = await sb
    .from('room_players')
    .insert({ room_id: room.id, nickname, seat, is_host: false, is_ready: false })
    .select()
    .single();
  if (error) throw error;
  saveIdentity(token, { roomId: room.id, playerId: player.id, nickname });
  return { room, player: player as PlayerRow };
}

export async function setReady(playerId: string, ready: boolean): Promise<void> {
  const sb = requireSupabase();
  await sb.from('room_players').update({ is_ready: ready }).eq('id', playerId);
}

/* ------------------------------------------------------------------ */
/* Game state helpers                                                  */
/* ------------------------------------------------------------------ */

export async function getGame(roomId: string): Promise<GameRow | null> {
  const sb = requireSupabase();
  const { data } = await sb
    .from('games')
    .select('*')
    .eq('room_id', roomId)
    .maybeSingle();
  return (data as GameRow) ?? null;
}

export async function getHands(gameId: string): Promise<HandRow[]> {
  const sb = requireSupabase();
  const { data } = await sb.from('player_hands').select('*').eq('game_id', gameId);
  return (data as HandRow[]) ?? [];
}

export async function getResults(roomId: string): Promise<RoundResultRow[]> {
  const sb = requireSupabase();
  const { data } = await sb
    .from('round_results')
    .select('*')
    .eq('room_id', roomId)
    .order('round_number', { ascending: true });
  return (data as RoundResultRow[]) ?? [];
}

async function logMove(
  roomId: string,
  round: number,
  playerId: string | null,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const sb = requireSupabase();
    await sb
      .from('game_moves')
      .insert({ room_id: roomId, round_number: round, player_id: playerId, type, payload });
  } catch {
    /* history is best-effort */
  }
}

/**
 * Guarded update: only succeeds if nobody else mutated the game first.
 * Returns the number of updated rows (0 => lost the race; caller refetches).
 */
async function commitGame(game: GameRow, patch: Partial<GameRow>): Promise<boolean> {
  const sb = requireSupabase();
  const { count } = await sb
    .from('games')
    .update({ ...patch, version: game.version + 1 }, { count: 'exact' })
    .eq('id', game.id)
    .eq('version', game.version);
  return (count ?? 0) === 1;
}

/** Recycle the discard pile (minus its top card) into the deck, deterministically. */
function reshuffleIfNeeded(game: GameRow): { deck: string[]; discard: string[]; reshuffles: number } {
  let { deck, discard, reshuffles } = game;
  if (deck.length > 0) return { deck, discard, reshuffles };
  const top = discard[discard.length - 1];
  const rest = discard.slice(0, -1);
  reshuffles += 1;
  deck = seededShuffle(rest, `${game.room_id}:${game.round_number}:${reshuffles}`);
  return { deck, discard: [top], reshuffles };
}

function nextSeat(players: PlayerRow[], currentSeat: number): number {
  const seats = players.map((p) => p.seat).sort((a, b) => a - b);
  const idx = seats.indexOf(currentSeat);
  return seats[(idx + 1) % seats.length];
}

/* ------------------------------------------------------------------ */
/* Dealing (host device builds the shoe; everyone verifies via sync)   */
/* ------------------------------------------------------------------ */

export async function dealRound(room: RoomRow, players: PlayerRow[], roundNumber: number): Promise<void> {
  const sb = requireSupabase();
  const ordered = [...players].sort((a, b) => a.seat - b.seat);

  let shoe = shuffle(buildDeck(CFG));
  const hands = new Map<string, string[]>(ordered.map((p) => [p.id, []]));
  for (let i = 0; i < CFG.handSize; i++) {
    for (const p of ordered) hands.get(p.id)!.push(shoe.pop()!.id);
  }

  // Wild-joker indicator. A printed joker => all aces are wild.
  const indicator = shoe.pop()!;
  const wildRank =
    indicator.suit === 'J' ? (CFG.acesWildWhenIndicatorIsPrintedJoker ? 1 : 0) : indicator.rank;

  const openCard = shoe.pop()!;
  const discard = [openCard.id];
  const deck = shoe.map((c) => c.id);
  const firstSeat = ordered[(roundNumber - 1) % ordered.length].seat;

  const existing = await getGame(room.id);
  const patch = {
    round_number: roundNumber,
    status: 'playing' as const,
    deck,
    discard,
    wild_rank: wildRank,
    current_seat: firstSeat,
    phase: 'draw' as const,
    drawn_card: null,
    drawn_from: null,
    turn_deadline: freshDeadline(),
    reshuffles: 0,
    declarer_id: null,
  };

  let gameId: string;
  if (!existing) {
    const { data, error } = await sb
      .from('games')
      .insert({ room_id: room.id, ...patch, version: 1 })
      .select()
      .single();
    if (error) throw error;
    gameId = data.id;
  } else {
    const ok = await commitGame(existing, patch);
    if (!ok) throw new Error('Round is already being started — please wait.');
    gameId = existing.id;
  }

  await sb.from('player_hands').delete().eq('game_id', gameId);
  const rows = ordered.map((p) => ({
    game_id: gameId,
    room_id: room.id,
    player_id: p.id,
    cards: hands.get(p.id)!,
  }));
  const { error: handErr } = await sb.from('player_hands').insert(rows);
  if (handErr) throw handErr;

  await logMove(room.id, roundNumber, null, 'deal', { wildRank, firstSeat });
}

export async function startMatch(room: RoomRow): Promise<void> {
  const sb = requireSupabase();
  const players = await getPlayers(room.id);
  await dealRound(room, players, 1);
  await sb.from('rooms').update({ status: 'playing' }).eq('id', room.id);
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Turn actions — validated client-side, committed with version guard  */
/* ------------------------------------------------------------------ */

export async function drawCard(
  roomId: string,
  playerId: string,
  source: 'deck' | 'pile',
): Promise<ActionResult> {
  const sb = requireSupabase();
  const [game, players] = await Promise.all([getGame(roomId), getPlayers(roomId)]);
  if (!game || game.status !== 'playing') return { ok: false, error: 'Round is over.' };
  const me = players.find((p) => p.id === playerId);
  if (!me || me.seat !== game.current_seat) return { ok: false, error: 'Not your turn.' };
  if (game.phase !== 'draw') return { ok: false, error: 'You already drew a card.' };

  let card: string | undefined;
  let deck = game.deck;
  let discard = game.discard;
  let reshuffles = game.reshuffles;
  if (source === 'pile') {
    if (discard.length === 0) return { ok: false, error: 'Discard pile is empty.' };
    card = discard[discard.length - 1];
    discard = discard.slice(0, -1);
  } else {
    ({ deck, discard, reshuffles } = reshuffleIfNeeded(game));
    card = deck[deck.length - 1];
    deck = deck.slice(0, -1);
    if (!card) return { ok: false, error: 'No cards left to draw.' };
  }

  const hands = await getHands(game.id);
  const myHand = hands.find((h) => h.player_id === playerId);
  if (!myHand) return { ok: false, error: 'Hand not found.' };
  await sb
    .from('player_hands')
    .update({ cards: [...myHand.cards, card], updated_at: new Date().toISOString() })
    .eq('game_id', game.id)
    .eq('player_id', playerId);

  const ok = await commitGame(game, {
    deck,
    discard,
    reshuffles,
    phase: 'discard',
    drawn_card: card,
    drawn_from: source,
  });
  if (!ok) return { ok: false, error: 'Conflict — state changed, try again.' };
  await logMove(roomId, game.round_number, playerId, 'draw', { source });
  return { ok: true };
}

export async function discardCard(
  roomId: string,
  playerId: string,
  cardId: string,
): Promise<ActionResult> {
  const sb = requireSupabase();
  const [game, players] = await Promise.all([getGame(roomId), getPlayers(roomId)]);
  if (!game || game.status !== 'playing') return { ok: false, error: 'Round is over.' };
  const me = players.find((p) => p.id === playerId);
  if (!me || me.seat !== game.current_seat) return { ok: false, error: 'Not your turn.' };
  if (game.phase !== 'discard') return { ok: false, error: 'Draw a card first.' };
  if (
    CFG.cannotDiscardPickedFromPile &&
    game.drawn_from === 'pile' &&
    game.drawn_card === cardId
  ) {
    return { ok: false, error: "You can't discard the card you just picked from the pile." };
  }

  const hands = await getHands(game.id);
  const myHand = hands.find((h) => h.player_id === playerId);
  if (!myHand || !myHand.cards.includes(cardId)) return { ok: false, error: 'Card not in hand.' };

  await sb
    .from('player_hands')
    .update({ cards: myHand.cards.filter((c) => c !== cardId), updated_at: new Date().toISOString() })
    .eq('game_id', game.id)
    .eq('player_id', playerId);

  const ok = await commitGame(game, {
    discard: [...game.discard, cardId],
    current_seat: nextSeat(players, game.current_seat),
    phase: 'draw',
    drawn_card: null,
    drawn_from: null,
    turn_deadline: freshDeadline(),
  });
  if (!ok) return { ok: false, error: 'Conflict — state changed, try again.' };
  await logMove(roomId, game.round_number, playerId, 'discard', { card: cardId });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Declaration & scoring                                               */
/* ------------------------------------------------------------------ */

export function roundMultiplier(round: number): number {
  return CFG.doubledRounds.includes(round) ? CFG.doubledMultiplier : 1;
}

export async function declareHand(
  roomId: string,
  playerId: string,
  closingCardId: string,
): Promise<ActionResult> {
  const sb = requireSupabase();
  const [game, players] = await Promise.all([getGame(roomId), getPlayers(roomId)]);
  if (!game || game.status !== 'playing') return { ok: false, error: 'Round is over.' };
  const me = players.find((p) => p.id === playerId);
  if (!me || me.seat !== game.current_seat) return { ok: false, error: 'Not your turn.' };
  if (game.phase !== 'discard') return { ok: false, error: 'Draw a card before declaring.' };
  if (
    CFG.cannotDiscardPickedFromPile &&
    game.drawn_from === 'pile' &&
    game.drawn_card === closingCardId
  ) {
    return { ok: false, error: "You can't close with the card you just picked from the pile." };
  }

  const hands = await getHands(game.id);
  const myHand = hands.find((h) => h.player_id === playerId);
  if (!myHand || !myHand.cards.includes(closingCardId)) {
    return { ok: false, error: 'Card not in hand.' };
  }
  const remaining = myHand.cards.filter((c) => c !== closingCardId);
  const declaration = validateDeclaration(remaining, game.wild_rank, CFG);
  if (!declaration) {
    return {
      ok: false,
      error:
        'Invalid declaration: you need at least two sequences (one pure) and every card grouped.',
    };
  }

  const mult = roundMultiplier(game.round_number);
  const results = players.map((p) => {
    if (p.id === playerId) {
      return {
        room_id: roomId,
        round_number: game.round_number,
        player_id: p.id,
        points: 0,
        multiplier: mult,
        scored: 0,
        is_declarer: true,
        groups: declaration.groups.map((g) => g.map((c) => c.id)),
        ungrouped: [] as string[],
      };
    }
    const hand = hands.find((h) => h.player_id === p.id);
    const scored = scoreHand(hand?.cards ?? [], game.wild_rank, CFG);
    return {
      room_id: roomId,
      round_number: game.round_number,
      player_id: p.id,
      points: scored.points,
      multiplier: mult,
      scored: scored.points * mult,
      is_declarer: false,
      groups: scored.groups.map((g) => g.map((c) => c.id)),
      ungrouped: scored.ungrouped.map((c) => c.id),
    };
  });

  // Idempotent: replace any results already written for this round.
  await sb.from('round_results').delete().eq('room_id', roomId).eq('round_number', game.round_number);
  const { error: resErr } = await sb.from('round_results').insert(results);
  if (resErr) return { ok: false, error: resErr.message };

  for (const r of results) {
    const p = players.find((pl) => pl.id === r.player_id)!;
    await sb
      .from('room_players')
      .update({ total_score: p.total_score + r.scored })
      .eq('id', r.player_id);
  }

  const isLastRound = game.round_number >= CFG.rounds;
  const ok = await commitGame(game, {
    status: isLastRound ? 'match_end' : 'round_end',
    phase: 'done',
    declarer_id: playerId,
    discard: [...game.discard, closingCardId],
  });
  if (!ok) return { ok: false, error: 'Conflict — state changed, try again.' };

  await sb
    .from('player_hands')
    .update({ cards: remaining, updated_at: new Date().toISOString() })
    .eq('game_id', game.id)
    .eq('player_id', playerId);

  if (isLastRound) await sb.from('rooms').update({ status: 'finished' }).eq('id', roomId);
  await logMove(roomId, game.round_number, playerId, 'declare', { closingCard: closingCardId });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Timeout — deterministic, safe for any client to apply               */
/* ------------------------------------------------------------------ */

export async function applyTimeout(roomId: string): Promise<void> {
  if (!CFG.timeoutAutoPlay) return;
  const sb = requireSupabase();
  const [game, players] = await Promise.all([getGame(roomId), getPlayers(roomId)]);
  if (!game || game.status !== 'playing') return;
  if (serverNow().getTime() < new Date(game.turn_deadline).getTime()) return;

  const current = players.find((p) => p.seat === game.current_seat);
  if (!current) return;
  const hands = await getHands(game.id);
  const hand = hands.find((h) => h.player_id === current.id);
  if (!hand) return;

  let deck = game.deck;
  let discard = game.discard;
  let reshuffles = game.reshuffles;
  let cards = [...hand.cards];
  let drawn: string | null = null;

  if (game.phase === 'draw') {
    ({ deck, discard, reshuffles } = reshuffleIfNeeded(game));
    const card = deck[deck.length - 1];
    if (card) {
      deck = deck.slice(0, -1);
      cards.push(card);
      drawn = card;
    }
  }

  const throwaway = chooseTimeoutDiscard(cards, game.wild_rank);
  cards = cards.filter((c) => c !== throwaway);
  discard = [...discard, throwaway];

  await sb
    .from('player_hands')
    .update({ cards, updated_at: new Date().toISOString() })
    .eq('game_id', game.id)
    .eq('player_id', current.id);

  const ok = await commitGame(game, {
    deck,
    discard,
    reshuffles,
    current_seat: nextSeat(players, game.current_seat),
    phase: 'draw',
    drawn_card: null,
    drawn_from: null,
    turn_deadline: freshDeadline(),
  });
  if (ok) {
    await logMove(roomId, game.round_number, current.id, 'timeout', { drawn, discarded: throwaway });
  }
}

/* ------------------------------------------------------------------ */
/* Round / match progression                                           */
/* ------------------------------------------------------------------ */

export async function nextRound(room: RoomRow): Promise<ActionResult> {
  const game = await getGame(room.id);
  if (!game || game.status !== 'round_end') return { ok: false, error: 'Round not finished yet.' };
  const players = await getPlayers(room.id);
  await dealRound(room, players, game.round_number + 1);
  return { ok: true };
}

/** Reset the room back to the lobby so the same group can play again. */
export async function playAgain(room: RoomRow): Promise<void> {
  const sb = requireSupabase();
  const game = await getGame(room.id);
  if (game) {
    await sb.from('player_hands').delete().eq('game_id', game.id);
    await sb.from('games').delete().eq('id', game.id);
  }
  await sb.from('round_results').delete().eq('room_id', room.id);
  await sb.from('game_moves').delete().eq('room_id', room.id);
  await sb
    .from('room_players')
    .update({ total_score: 0, is_ready: false })
    .eq('room_id', room.id);
  if (room.host_player_id) {
    await sb.from('room_players').update({ is_ready: true }).eq('id', room.host_player_id);
  }
  await sb.from('rooms').update({ status: 'lobby' }).eq('id', room.id);
}
