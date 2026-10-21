import { isWildJoker, parseCard, RANK_LABEL, SUIT_SYMBOL } from '../lib/cards';

interface Props {
  id?: string;
  faceDown?: boolean;
  /** small = pile/overlay size, tiny = history strip, compact = hand fan */
  small?: boolean;
  tiny?: boolean;
  compact?: boolean;
  selected?: boolean;
  /** soft glow — used for the card drawn this turn */
  glow?: boolean;
  wildRank?: number;
  dimmed?: boolean;
  onClick?: () => void;
}

export default function CardView({
  id,
  faceDown,
  small,
  tiny,
  compact,
  selected,
  glow,
  wildRank = 0,
  dimmed,
  onClick,
}: Props) {
  const size = tiny
    ? 'w-7 h-10'
    : small
      ? 'w-9 h-[3.4rem]'
      : compact
        ? 'w-11 h-[4.2rem]'
        : 'w-12 h-[4.5rem]';
  const base = `${size} rounded-md border flex flex-col shrink-0 transition-all`;

  if (faceDown || !id) {
    return (
      <div
        onClick={onClick}
        className={`${base} items-center justify-center border-emerald-300/40 bg-gradient-to-br from-emerald-800 to-emerald-950 ${
          onClick ? 'cursor-pointer active:scale-95' : ''
        }`}
      >
        <div className="text-emerald-300/60 text-lg leading-none">✦</div>
      </div>
    );
  }

  const card = parseCard(id);
  const isJokerCard = card.suit === 'J';
  const wild = isWildJoker(card, wildRank);
  const red = card.suit === 'H' || card.suit === 'D';
  const color = red ? 'text-red-600' : 'text-gray-900';
  const bg = isJokerCard ? 'bg-fuchsia-100' : 'bg-white';

  const ring = selected
    ? '-translate-y-3 ring-2 ring-amber-300 border-amber-300 z-10'
    : glow
      ? 'ring-2 ring-emerald-300 border-emerald-300'
      : 'border-gray-300';

  // --- compact (hand fan) & tiny (history): corner-anchored so overlapped
  // --- cards stay readable.
  if (compact || tiny) {
    return (
      <div
        onClick={onClick}
        className={`${base} relative ${bg} ${ring} ${dimmed ? 'opacity-40' : ''} ${
          onClick ? 'cursor-pointer active:scale-95' : ''
        }`}
      >
        {isJokerCard ? (
          tiny ? (
            <div className="absolute top-0 left-0.5 leading-none">
              <div className="text-[0.6rem] font-extrabold text-fuchsia-600">J</div>
              <div className="text-[0.55rem] text-fuchsia-500">★</div>
            </div>
          ) : (
            // Vertical label stays fully readable even when cards overlap.
            <div
              className="absolute inset-y-1 left-0.5 flex items-start"
              style={{ writingMode: 'vertical-rl' }}
            >
              <span className="text-[0.6rem] font-extrabold tracking-tight text-fuchsia-600">
                JOKER
              </span>
            </div>
          )
        ) : (
          <div className={`absolute ${tiny ? 'top-0 left-0.5' : 'top-0.5 left-1'} leading-none`}>
            <div className={`${tiny ? 'text-[0.55rem]' : 'text-xs'} font-bold ${color}`}>
              {RANK_LABEL[card.rank]}
            </div>
            <div className={`${tiny ? 'text-[0.55rem]' : 'text-sm'} ${color}`}>
              {SUIT_SYMBOL[card.suit as 'S' | 'H' | 'D' | 'C']}
            </div>
          </div>
        )}
        {!tiny && (
          <div className="absolute bottom-0.5 right-1 text-[0.5rem] text-gray-400">
            {card.deck + 1}
          </div>
        )}
        {wild && !tiny && (
          <div className="absolute bottom-0.5 left-1 text-[0.5rem] font-bold text-amber-500">W</div>
        )}
      </div>
    );
  }

  // --- normal & small sizes
  return (
    <div
      onClick={onClick}
      className={`${base} relative items-center justify-center ${bg} ${ring} ${
        dimmed ? 'opacity-40' : ''
      } ${onClick ? 'cursor-pointer active:scale-95' : ''}`}
    >
      {isJokerCard ? (
        <div className="flex flex-col items-center leading-none">
          <span className={`${small ? 'text-base' : 'text-xl'} text-fuchsia-500`}>★</span>
          <span
            className={`${small ? 'text-[0.5rem]' : 'text-[0.6rem]'} font-extrabold text-fuchsia-600`}
          >
            JOKER
          </span>
        </div>
      ) : (
        <>
          <div className={`${small ? 'text-sm' : 'text-base'} font-bold leading-none ${color}`}>
            {RANK_LABEL[card.rank]}
          </div>
          <div className={`${small ? 'text-sm' : 'text-lg'} leading-none ${color}`}>
            {SUIT_SYMBOL[card.suit as 'S' | 'H' | 'D' | 'C']}
          </div>
        </>
      )}
      <div className="absolute bottom-0.5 right-1 text-[0.5rem] text-gray-400">{card.deck + 1}</div>
      {wild && (
        <div className="absolute top-0.5 left-1 text-[0.5rem] font-bold text-amber-500">W</div>
      )}
    </div>
  );
}
