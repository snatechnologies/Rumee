import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import CardView from '../components/CardView';
import PlayerAvatar from '../components/PlayerAvatar';
import RoundOverlay from '../components/RoundOverlay';
import TurnTimer from '../components/TurnTimer';
import type { RoomState } from '../hooks/useRoom';
import {
  applyTimeout,
  declareHand,
  discardCard,
  drawCard,
  nextRound,
  playAgain,
  roundMultiplier,
  serverNow,
  type ActionResult,
} from '../lib/api';
import { sortHand } from '../lib/cards';
import { GAME_CONFIG } from '../lib/config';
import { hasPureSequence } from '../lib/meld';

interface Props {
  state: RoomState;
  me: string;
}

const ORDER_KEY = (gameId: string) => `rumee:hand-order:${gameId}`;

export default function Game({ state, me }: Props) {
  const { room, players, game, hands, results, online } = state;
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /** The player's own card arrangement (free grouping), persisted per game. */
  const [order, setOrder] = useState<string[]>([]);
  const timeoutTried = useRef('');

  const mePlayer = players.find((p) => p.id === me);
  const isHost = mePlayer?.is_host ?? false;
  const currentPlayer = game ? players.find((p) => p.seat === game.current_seat) : undefined;
  const isMyTurn = Boolean(game && game.status === 'playing' && currentPlayer?.id === me);
  const serverHand = hands[me] ?? [];
  const handKey = serverHand.join('|');
  const mult = game ? roundMultiplier(game.round_number) : 1;

  // Wild joker is revealed only after the player has a pure sequence
  // (a "first life" made without any joker).
  const wildRevealed = game ? hasPureSequence(serverHand, game.wild_rank) : false;
  const wildRankShown = wildRevealed && game ? game.wild_rank : 0;

  // Merge server truth into the local arrangement: keep the player's own
  // order, drop discarded cards, and APPEND newly drawn cards at the end.
  useEffect(() => {
    setOrder((prev) => {
      const kept = prev.filter((id) => serverHand.includes(id));
      const added = serverHand.filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      if (game) localStorage.setItem(ORDER_KEY(game.id), JSON.stringify(next));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey, game?.id]);

  // Restore a saved arrangement (e.g. after a refresh mid-round).
  useEffect(() => {
    if (!game) return;
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY(game.id)) ?? '[]') as string[];
      if (saved.length > 0) setOrder(saved);
    } catch {
      /* ignore corrupt state */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  const myHand = useMemo(() => {
    const kept = order.filter((id) => serverHand.includes(id));
    const added = serverHand.filter((id) => !kept.includes(id));
    return [...kept, ...added];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, handKey]);

  // Clear selection whenever the turn state moves on.
  useEffect(() => {
    setSelected(null);
  }, [game?.current_seat, game?.phase, game?.version]);

  // Timeout watchdog: whichever online client notices first applies the
  // deterministic auto-play (guarded by the version check in the DB write).
  useEffect(() => {
    if (!room || !game || game.status !== 'playing') return;
    const t = setInterval(() => {
      if (serverNow().getTime() > new Date(game.turn_deadline).getTime()) {
        const key = `${game.id}:${game.version}`;
        if (timeoutTried.current !== key) {
          timeoutTried.current = key;
          void applyTimeout(room.id);
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [room, game]);

  // Flash errors briefly.
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(''), 4000);
    return () => clearTimeout(t);
  }, [err]);

  const act = async (fn: () => Promise<ActionResult>) => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const persistOrder = (next: string[]) => {
    setOrder(next);
    if (game) localStorage.setItem(ORDER_KEY(game.id), JSON.stringify(next));
  };

  /** Tap toggles selection (used for discard / declare). */
  const onCardTap = (id: string) => {
    setSelected((prev) => (prev === id ? null : id));
  };

  /* ---------------- drag & drop arranging ---------------- */
  const dragRef = useRef<{ id: string; lastX: number; moved: boolean } | null>(null);

  const onHandPointerDown = (e: RPointerEvent<HTMLDivElement>, id: string) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id, lastX: e.clientX, moved: false };
  };

  const onHandPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.lastX;
    if (!d.moved && Math.abs(dx) < 8) return; // below threshold => treat as a tap
    d.moved = true;
    const SLOT = 20; // visible width of each overlapped card in the fan
    const steps = Math.trunc(dx / SLOT);
    if (steps === 0) return;
    const arr = [...myHand];
    const i = arr.indexOf(d.id);
    if (i < 0) return;
    const j = Math.max(0, Math.min(arr.length - 1, i + steps));
    if (j === i) return;
    arr.splice(i, 1);
    arr.splice(j, 0, d.id);
    persistOrder(arr);
    d.lastX += (j - i) * SLOT;
  };

  const onHandPointerUp = (id: string) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved) onCardTap(id); // a clean press without dragging = tap
  };

  const moveSelected = (dir: -1 | 1) => {
    if (!selected) return;
    const arr = [...myHand];
    const i = arr.indexOf(selected);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    persistOrder(arr);
  };

  const autoSort = () => {
    persistOrder(sortHand(myHand, 'suit'));
  };

  if (!room || !game) {
    return (
      <div className="flex h-full items-center justify-center text-emerald-200">
        Loading table…
      </div>
    );
  }

  const myIndex = Math.max(
    0,
    players.findIndex((p) => p.id === me),
  );
  const recentDiscards = game.discard.slice(-10);
  const topDiscard = game.discard[game.discard.length - 1];
  // Representative card for the wild rank (a printed-joker indicator makes
  // aces wild, so an ace card is the correct representation there too).
  const wildCardId = game.wild_rank > 0 ? `0:S${game.wild_rank}` : undefined;

  return (
    <div className="relative flex h-full flex-col p-3">
      {/* header */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-emerald-900/70 px-2 py-1 text-sm font-bold">
            Round {game.round_number}/{GAME_CONFIG.rounds}
          </span>
          {mult > 1 && (
            <span className="rounded-lg bg-amber-400/20 px-2 py-1 text-sm font-bold text-amber-300">
              ×{mult}
            </span>
          )}
        </div>
        <TurnTimer deadline={game.turn_deadline} />
      </header>

      {/* round table with avatars seated on an ellipse */}
      <div className="relative min-h-0 flex-1">
        {/* center: deck / wild joker / discard pile */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <div
              onClick={() => {
                if (isMyTurn && game.phase === 'draw') void act(() => drawCard(room.id, me, 'deck'));
              }}
              className={isMyTurn && game.phase === 'draw' ? 'cursor-pointer' : ''}
            >
              <CardView faceDown />
            </div>
            <span className="text-[0.6rem] text-emerald-300/70">Deck · {game.deck.length}</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div className={wildRevealed ? 'rounded-md ring-2 ring-amber-300' : ''}>
              {wildRevealed && wildCardId ? (
                <CardView id={wildCardId} wildRank={game.wild_rank} />
              ) : (
                <CardView faceDown />
              )}
            </div>
            <span className="max-w-[6rem] text-center text-[0.6rem] leading-tight text-emerald-300/70">
              {wildRevealed ? 'Wild joker' : 'Wild joker — pure sequence to flip'}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div
              onClick={() => {
                if (isMyTurn && game.phase === 'draw') void act(() => drawCard(room.id, me, 'pile'));
              }}
              className={isMyTurn && game.phase === 'draw' ? 'cursor-pointer' : ''}
            >
              <CardView id={topDiscard} wildRank={wildRankShown} faceDown={!topDiscard} />
            </div>
            <span className="text-[0.6rem] text-emerald-300/70">Pile · {game.discard.length}</span>
          </div>
        </div>

        {/* seats */}
        {players.map((p, i) => {
          const rel = (i - myIndex + players.length) % players.length;
          const angle = ((90 + (rel * 360) / players.length) * Math.PI) / 180;
          const x = 50 + 45 * Math.cos(angle);
          const y = 50 + 42 * Math.sin(angle);
          return (
            <div
              key={p.id}
              className="absolute"
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
            >
              <PlayerAvatar
                player={p}
                cardCount={hands[p.id]?.length ?? '–'}
                active={game.status === 'playing' && p.seat === game.current_seat}
                online={online.has(p.id)}
                isMe={p.id === me}
              />
            </div>
          );
        })}
      </div>

      {/* last 10 discards */}
      <div className="flex items-center gap-2 pb-1">
        <span className="shrink-0 text-[0.6rem] uppercase tracking-wide text-emerald-300/60">
          Recent discards
        </span>
        <div className="no-scrollbar flex flex-1 items-center overflow-x-auto">
          {recentDiscards.length === 0 && (
            <span className="text-[0.65rem] text-emerald-300/40">none yet</span>
          )}
          {recentDiscards.map((id, i) => (
            <div key={`${id}-${i}`} className={i === 0 ? '' : '-ml-4'}>
              <CardView
                id={id}
                tiny
                wildRank={wildRankShown}
                dimmed={i < recentDiscards.length - 1}
              />
            </div>
          ))}
        </div>
      </div>

      {/* status / actions */}
      <div className="min-h-[3rem]">
        {game.status === 'playing' &&
          (isMyTurn ? (
            game.phase === 'draw' ? (
              <p className="text-center text-sm text-emerald-200">
                Your turn — tap the <b>deck</b> or the <b>pile</b> to draw
              </p>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => selected && void act(() => discardCard(room.id, me, selected))}
                  disabled={!selected || busy}
                  className="flex-1 rounded-xl bg-emerald-500 py-3 font-bold text-emerald-950 active:scale-95 disabled:opacity-40"
                >
                  Discard
                </button>
                <button
                  onClick={() => selected && void act(() => declareHand(room.id, me, selected))}
                  disabled={!selected || busy}
                  className="flex-1 rounded-xl bg-amber-400 py-3 font-extrabold text-amber-950 active:scale-95 disabled:opacity-40"
                >
                  Declare 🏆
                </button>
              </div>
            )
          ) : (
            <p className="text-center text-sm text-emerald-300/80">
              {currentPlayer?.nickname ?? '…'} is playing
            </p>
          ))}
      </div>

      {err && (
        <div className="absolute inset-x-4 bottom-40 z-10 rounded-xl border border-red-400/50 bg-red-950/90 px-4 py-2 text-center text-sm text-red-200">
          {err}
        </div>
      )}

      {/* hand — every card visible at once in an overlapping fan */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] text-emerald-300/70">
            Your hand · {myHand.length} cards — drag to arrange, tap to select
          </span>
          <button
            onClick={autoSort}
            className="shrink-0 rounded bg-emerald-950/70 px-2 py-1 text-[0.65rem] text-emerald-300 active:scale-95"
          >
            ⇅ Sort
          </button>
        </div>

        {/* nudge buttons for fine positioning */}
        {selected && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => moveSelected(-1)}
              className="rounded-lg bg-emerald-800 px-4 py-1 text-sm font-bold active:scale-95"
            >
              ◀ Move left
            </button>
            <button
              onClick={() => moveSelected(1)}
              className="rounded-lg bg-emerald-800 px-4 py-1 text-sm font-bold active:scale-95"
            >
              Move right ▶
            </button>
          </div>
        )}

        <div className="flex select-none items-end justify-center pt-3 pb-1">
          {myHand.map((id, i) => (
            <div
              key={id}
              className={`${i === 0 ? '' : '-ml-6'} cursor-grab active:cursor-grabbing`}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => onHandPointerDown(e, id)}
              onPointerMove={onHandPointerMove}
              onPointerUp={() => onHandPointerUp(id)}
              onPointerCancel={() => (dragRef.current = null)}
            >
              <CardView
                id={id}
                compact
                wildRank={wildRankShown}
                selected={selected === id}
                glow={isMyTurn && game.phase === 'discard' && game.drawn_card === id}
                dimmed={
                  isMyTurn &&
                  game.phase === 'discard' &&
                  game.drawn_from === 'pile' &&
                  game.drawn_card === id
                }
              />
            </div>
          ))}
        </div>
      </div>

      {game.status !== 'playing' && (
        <RoundOverlay
          game={game}
          players={players}
          results={results}
          isHost={isHost}
          busy={busy}
          onNextRound={() => void act(() => nextRound(room))}
          onPlayAgain={() =>
            void (async () => {
              setBusy(true);
              await playAgain(room);
              setBusy(false);
            })()
          }
        />
      )}
    </div>
  );
}

