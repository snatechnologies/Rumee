/** Row shapes matching supabase/schema.sql. */

export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type GameStatus = 'playing' | 'round_end' | 'match_end';
export type TurnPhase = 'draw' | 'discard' | 'done';

export interface RoomRow {
  id: string;
  invite_token: string;
  status: RoomStatus;
  host_player_id: string | null;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  nickname: string;
  seat: number;
  is_host: boolean;
  is_ready: boolean;
  total_score: number;
  created_at: string;
}

export interface GameRow {
  id: string;
  room_id: string;
  round_number: number;
  status: GameStatus;
  /** Closed deck — card ids, top of deck is the LAST array element. */
  deck: string[];
  /** Open discard pile — top card is the LAST array element. */
  discard: string[];
  /** Rank (1-13) whose cards all act as wild jokers this round. */
  wild_rank: number;
  /** Seat of the player whose turn it is. */
  current_seat: number;
  phase: TurnPhase;
  /** Card drawn this turn (phase === 'discard'), for highlight + pile rule. */
  drawn_card: string | null;
  drawn_from: 'deck' | 'pile' | null;
  /** Server timestamp after which the deterministic timeout action applies. */
  turn_deadline: string;
  /** Optimistic-concurrency counter; every mutation bumps it. */
  version: number;
  reshuffles: number;
  declarer_id: string | null;
  created_at: string;
}

export interface HandRow {
  game_id: string;
  player_id: string;
  room_id: string;
  cards: string[];
  updated_at: string;
}

export interface RoundResultRow {
  id: string;
  room_id: string;
  round_number: number;
  player_id: string;
  points: number;
  multiplier: number;
  scored: number;
  is_declarer: boolean;
  groups: string[][];
  ungrouped: string[];
  created_at: string;
}

export interface MoveRow {
  id: string;
  room_id: string;
  round_number: number;
  player_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Identity persisted in localStorage so a refresh/revisit reconnects. */
export interface StoredIdentity {
  roomId: string;
  playerId: string;
  nickname: string;
}
