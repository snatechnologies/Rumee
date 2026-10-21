import { useCallback, useEffect, useRef, useState } from 'react';
import { getGame, getHands, getPlayers, getResults, syncServerClock } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import type { GameRow, PlayerRow, RoomRow, RoundResultRow } from '../lib/types';

export interface RoomState {
  room: RoomRow | null;
  players: PlayerRow[];
  game: GameRow | null;
  /** player_id -> card ids (hands are only rendered for the local player). */
  hands: Record<string, string[]>;
  results: RoundResultRow[];
  /** player ids currently connected (Supabase presence). */
  online: Set<string>;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Loads the full room state and keeps it in sync via Supabase Realtime.
 * Any change simply triggers a refetch — the game table is tiny and this
 * keeps every client consistent without merge logic.
 */
export function useRoom(roomId: string | undefined, playerId: string | undefined): RoomState {
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [game, setGame] = useState<GameRow | null>(null);
  const [hands, setHands] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<RoundResultRow[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (!roomId || refreshing.current) return;
    refreshing.current = true;
    try {
      const [p, g] = await Promise.all([getPlayers(roomId), getGame(roomId)]);
      setPlayers(p);
      setGame(g);
      if (g) {
        const [h, r] = await Promise.all([getHands(g.id), getResults(roomId)]);
        const map: Record<string, string[]> = {};
        for (const row of h) map[row.player_id] = row.cards;
        setHands(map);
        setResults(r);
      } else {
        setHands({});
        setResults([]);
      }
    } finally {
      refreshing.current = false;
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    const sb = supabase;
    if (!roomId || !sb) return;
    void syncServerClock();
    void refresh();

    const channel = sb
      .channel(`room:${roomId}`, { config: { presence: { key: playerId } } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            setRoom(payload.new as RoomRow);
          }
          void refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `room_id=eq.${roomId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_hands', filter: `room_id=eq.${roomId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'round_results', filter: `room_id=eq.${roomId}` },
        () => void refresh(),
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        for (const key of Object.keys(state)) {
          for (const p of state[key] as Array<{ player_id?: string }>) {
            if (p.player_id) ids.add(p.player_id);
          }
        }
        setOnline(ids);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && playerId) {
          await channel.track({ player_id: playerId });
        }
      });

    // Safety net: if realtime drops (flaky mobile network), poll anyway.
    const poll = setInterval(() => void refresh(), 15000);

    return () => {
      clearInterval(poll);
      void sb.removeChannel(channel);
    };
  }, [roomId, playerId, refresh]);

  // Fetch the room row itself (no realtime payload needed on first load).
  useEffect(() => {
    const sb = supabase;
    if (!roomId || !sb) return;
    void sb
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle()
      .then(({ data }) => setRoom((data as RoomRow) ?? null));
  }, [roomId]);

  return { room, players, game, hands, results, online, loading, refresh };
}
