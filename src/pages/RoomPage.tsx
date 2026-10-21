import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPlayers, getRoomByToken, joinRoom, loadIdentity } from '../lib/api';
import { useRoom } from '../hooks/useRoom';
import type { RoomRow, StoredIdentity } from '../lib/types';
import Game from './Game';
import Lobby from './Lobby';

/**
 * Route /r/:token — resolves the invite link into either a join form
 * (new visitor) or the room itself (returning player, even mid-game).
 */
export default function RoomPage() {
  const { token = '' } = useParams();
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [identity, setIdentity] = useState<StoredIdentity | null>(null);
  const [phase, setPhase] = useState<'loading' | 'join' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getRoomByToken(token);
        if (cancelled) return;
        if (!r) {
          setError('Room not found. Ask the host for a fresh invite link.');
          return setPhase('error');
        }
        setRoom(r);
        const stored = loadIdentity(token);
        if (stored && stored.roomId === r.id) {
          const players = await getPlayers(r.id);
          if (players.some((p) => p.id === stored.playerId)) {
            setIdentity(stored);
            return setPhase('ready');
          }
        }
        setPhase('join');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load room.');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const join = async () => {
    if (!nickname.trim()) return setError('Enter a nickname.');
    setBusy(true);
    setError('');
    try {
      const { player } = await joinRoom(token, nickname.trim());
      setIdentity({ roomId: room!.id, playerId: player.id, nickname: nickname.trim() });
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'loading') {
    return <Centered>Loading room…</Centered>;
  }

  if (phase === 'error') {
    return <Centered className="text-red-300">{error}</Centered>;
  }

  if (phase === 'join') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold text-emerald-100">You&apos;re invited! 🃏</h1>
        <p className="text-sm text-emerald-300/80">Pick a nickname to join the table.</p>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={16}
          placeholder="Nickname"
          className="w-full rounded-xl border border-emerald-700 bg-emerald-950/60 px-4 py-3 text-lg outline-none focus:border-emerald-400"
        />
        <button
          onClick={join}
          disabled={busy}
          className="w-full rounded-xl bg-emerald-500 py-3 text-lg font-bold text-emerald-950 active:scale-95 disabled:opacity-40"
        >
          {busy ? 'Joining…' : 'Join game'}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>
    );
  }

  if (!room || !identity) return <Centered>Loading…</Centered>;

  return <RoomInner roomId={room.id} me={identity.playerId} token={token} />;
}

/** Subscribes to live room state and swaps Lobby <-> Game as status changes. */
function RoomInner({ roomId, me, token }: { roomId: string; me: string; token: string }) {
  const state = useRoom(roomId, me);
  const room = state.room;

  if (!room) {
    return <Centered>{state.loading ? 'Connecting…' : 'Room unavailable.'}</Centered>;
  }
  return room.status === 'lobby' ? (
    <Lobby state={state} me={me} token={token} />
  ) : (
    <Game state={state} me={me} />
  );
}

function Centered({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex h-full items-center justify-center p-6 text-center ${className}`}>
      {children}
    </div>
  );
}
