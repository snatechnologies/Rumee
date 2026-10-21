import { GAME_CONFIG } from '../lib/config';
import type { GameRow, PlayerRow, RoundResultRow } from '../lib/types';
import CardView from './CardView';

interface Props {
  game: GameRow;
  players: PlayerRow[];
  results: RoundResultRow[];
  isHost: boolean;
  busy: boolean;
  onNextRound: () => void;
  onPlayAgain: () => void;
}

/** Round-end scoreboard and the final match leaderboard. */
export default function RoundOverlay({ game, players, results, isHost, busy, onNextRound, onPlayAgain }: Props) {
  const roundResults = results.filter((r) => r.round_number === game.round_number);
  const matchOver = game.status === 'match_end';
  const byId = new Map(players.map((p) => [p.id, p]));
  const ranked = [...players].sort((a, b) => a.total_score - b.total_score);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-full flex-col overflow-hidden rounded-2xl border border-emerald-700 bg-emerald-950 p-4">
        <h2 className="text-center text-xl font-extrabold text-emerald-100">
          {matchOver ? '🏁 Match over' : `Round ${game.round_number} results`}
          {!matchOver && game.round_number < GAME_CONFIG.rounds && (
            <span className="ml-2 text-sm font-normal text-emerald-300/70">
              / {GAME_CONFIG.rounds}
            </span>
          )}
        </h2>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto no-scrollbar">
          {roundResults
            .slice()
            .sort((a, b) => a.points - b.points)
            .map((r) => {
              const p = byId.get(r.player_id);
              return (
                <div key={r.id} className="rounded-xl bg-emerald-900/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {r.is_declarer ? '🏆 ' : ''}
                      {p?.nickname ?? '?'}
                    </span>
                    <span className="text-sm">
                      {r.points} pts
                      {r.multiplier > 1 && (
                        <span className="ml-1 rounded bg-amber-400/20 px-1 text-amber-300">
                          ×{r.multiplier}
                        </span>
                      )}
                      <span className="ml-2 font-bold text-emerald-200">+{r.scored}</span>
                      <span className="ml-2 text-emerald-400/70">total {p?.total_score}</span>
                    </span>
                  </div>
                  {r.groups.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.groups.map((g, i) => (
                        <div key={i} className="flex gap-0.5 rounded bg-emerald-950/70 p-1">
                          {g.map((id) => (
                            <CardView key={id} id={id} small wildRank={game.wild_rank} />
                          ))}
                        </div>
                      ))}
                      {r.ungrouped.map((id) => (
                        <div key={id} className="rounded bg-red-900/30 p-1">
                          <CardView id={id} small wildRank={game.wild_rank} dimmed />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {matchOver && (
          <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3">
            <h3 className="mb-1 text-sm font-bold text-amber-200">Final leaderboard (lowest wins)</h3>
            <ol className="space-y-1">
              {ranked.map((p, i) => (
                <li key={p.id} className="flex justify-between text-sm">
                  <span>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.nickname}
                  </span>
                  <span className="font-bold">{p.total_score}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="pt-3">
          {isHost ? (
            matchOver ? (
              <button
                onClick={onPlayAgain}
                disabled={busy}
                className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-emerald-950 active:scale-95 disabled:opacity-40"
              >
                {busy ? 'Resetting…' : 'Play again'}
              </button>
            ) : (
              <button
                onClick={onNextRound}
                disabled={busy}
                className="w-full rounded-xl bg-amber-400 py-3 font-extrabold text-amber-950 active:scale-95 disabled:opacity-40"
              >
                {busy ? 'Dealing…' : `Deal round ${game.round_number + 1}`}
              </button>
            )
          ) : (
            <p className="text-center text-sm text-emerald-300/70">
              Waiting for the host…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
