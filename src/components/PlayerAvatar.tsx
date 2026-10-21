import type { PlayerRow } from '../lib/types';

interface Props {
  player: PlayerRow;
  cardCount?: number | string;
  active: boolean;
  online: boolean;
  isMe: boolean;
}

/** Circular seat avatar for the round-table layout. */
export default function PlayerAvatar({ player, cardCount, active, online, isMe }: Props) {
  const initials = player.nickname
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex w-16 flex-col items-center">
      <div
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-bold ${
          active
            ? 'active-turn border-amber-300 bg-emerald-600'
            : 'border-emerald-700 bg-emerald-900'
        }`}
      >
        {initials || '?'}
        <span
          className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-emerald-950 ${
            online ? 'bg-emerald-400' : 'bg-gray-500'
          }`}
        />
      </div>
      <span className="mt-0.5 max-w-full truncate text-[0.6rem] font-semibold text-emerald-100">
        {player.nickname}
        {isMe ? ' (you)' : ''}
      </span>
      <span className="text-[0.55rem] text-emerald-300/70">
        🂠{cardCount ?? '–'} · {player.total_score} pts
      </span>
    </div>
  );
}
