import { useEffect, useState } from 'react';
import { serverNow } from '../lib/api';
import { GAME_CONFIG } from '../lib/config';

/** Countdown ring driven by the server-stamped turn deadline. */
export default function TurnTimer({ deadline }: { deadline: string }) {
  const [remaining, setRemaining] = useState<number>(GAME_CONFIG.turnSeconds);

  useEffect(() => {
    const tick = () => {
      const ms = new Date(deadline).getTime() - serverNow().getTime();
      setRemaining(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline]);

  const frac = remaining / GAME_CONFIG.turnSeconds;
  const r = 16;
  const circ = 2 * Math.PI * r;
  const urgent = remaining <= 15;

  return (
    <div className="relative h-11 w-11" title={`${remaining}s left`}>
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#064e3b" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={urgent ? '#f87171' : '#34d399'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
        />
      </svg>
      <div
        className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${
          urgent ? 'text-red-300' : 'text-emerald-200'
        }`}
      >
        {remaining}
      </div>
    </div>
  );
}
