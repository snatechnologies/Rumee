import { useState } from 'react';
import { setReady, startMatch } from '../lib/api';
import { GAME_CONFIG } from '../lib/config';
import type { RoomState } from '../hooks/useRoom';

interface Props {
  state: RoomState;
  me: string;
  token: string;
}

export default function Lobby({ state, me, token }: Props) {
  const { room, players, online, loading } = state;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  if (!room) return null;

  const inviteLink = `${location.origin}${location.pathname}#/r/${token}`;
  const mePlayer = players.find((p) => p.id === me);
  const isHost = mePlayer?.is_host ?? false;
  const everyoneReady = players.every((p) => p.is_host || p.is_ready);
  const canStart =
    players.length >= GAME_CONFIG.minPlayers && players.length <= GAME_CONFIG.maxPlayers;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Rumee', text: 'Join my rummy table!', url: inviteLink });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    await navigator.clipboard.writeText(inviteLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      await startMatch(room);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the game.');
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-5">
      <header className="pt-2 text-center">
        <h1 className="text-2xl font-extrabold text-emerald-100">Lobby</h1>
        <p className="text-xs text-emerald-300/70">
          {GAME_CONFIG.decks} decks · {GAME_CONFIG.rounds} rounds · rounds{' '}
          {GAME_CONFIG.doubledRounds.join(' & ')} score ×{GAME_CONFIG.doubledMultiplier}
        </p>
      </header>

      <button
        onClick={share}
        className="mt-5 w-full rounded-xl border border-dashed border-emerald-400/60 bg-emerald-900/40 px-4 py-3 text-emerald-200 active:scale-95"
      >
        {copied ? '✓ Link copied!' : '🔗 Tap to share invite link'}
      </button>

      <div className="mt-5 flex-1 overflow-y-auto no-scrollbar">
        <h2 className="mb-2 text-sm font-semibold text-emerald-300/80">
          Players ({players.length}/{GAME_CONFIG.maxPlayers})
        </h2>
        <ul className="space-y-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl bg-emerald-950/60 px-4 py-3"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  online.has(p.id) ? 'bg-emerald-400' : 'bg-gray-500'
                }`}
              />
              <span className="flex-1 font-medium">
                {p.nickname}
                {p.is_host && <span className="ml-2 text-xs text-amber-300">HOST</span>}
                {p.id === me && <span className="ml-2 text-xs text-emerald-400">(you)</span>}
              </span>
              <span className={p.is_ready ? 'text-emerald-400' : 'text-gray-500'}>
                {p.is_ready ? '✓ ready' : 'waiting'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 pb-2">
        {mePlayer && !mePlayer.is_host && (
          <button
            onClick={() => void setReady(me, !mePlayer.is_ready)}
            className={`w-full rounded-xl py-3 text-lg font-bold active:scale-95 ${
              mePlayer.is_ready
                ? 'border border-emerald-500 text-emerald-300'
                : 'bg-emerald-500 text-emerald-950'
            }`}
          >
            {mePlayer.is_ready ? 'Ready ✓ (tap to undo)' : "I'm ready!"}
          </button>
        )}
        {isHost && (
          <button
            onClick={start}
            disabled={!canStart || busy || loading}
            className="w-full rounded-xl bg-amber-400 py-3 text-lg font-extrabold text-amber-950 active:scale-95 disabled:opacity-40"
          >
            {busy
              ? 'Dealing…'
              : canStart
                ? everyoneReady
                  ? 'Start game'
                  : 'Start game (not everyone is ready)'
                : `Need at least ${GAME_CONFIG.minPlayers} players`}
          </button>
        )}
        {!isHost && (
          <p className="text-center text-xs text-emerald-300/60">
            Waiting for the host to start the game…
          </p>
        )}
        {error && <p className="text-center text-sm text-red-300">{error}</p>}
      </div>
    </div>
  );
}
