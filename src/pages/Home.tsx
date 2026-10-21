import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom } from '../lib/api';
import { supabaseConfigured } from '../lib/supabaseClient';

function extractToken(input: string): string {
  const m = input.match(/#\/r\/([0-9a-fA-F-]{36})/);
  return m ? m[1] : input.trim();
}

export default function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!nickname.trim()) return setError('Enter a nickname first.');
    setBusy(true);
    setError('');
    try {
      const { room } = await createRoom(nickname.trim());
      navigate(`/r/${room.invite_token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create room.');
    } finally {
      setBusy(false);
    }
  };

  const join = () => {
    const token = extractToken(link);
    if (!nickname.trim()) return setError('Enter a nickname first.');
    if (!token) return setError('Paste an invite link or code.');
    navigate(`/r/${token}`);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-5xl">🂡</div>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-emerald-100">Rumee</h1>
        <p className="mt-1 text-sm text-emerald-300/80">
          Indian 13-card rummy with friends — 3 decks, 7 rounds
        </p>
      </div>

      {!supabaseConfigured && (
        <div className="w-full rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
          Supabase isn&apos;t configured yet. Copy <code>.env.example</code> to <code>.env</code>,
          fill in your project URL and anon key, then restart the dev server.
        </div>
      )}

      <div className="w-full space-y-3">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={16}
          placeholder="Your nickname"
          className="w-full rounded-xl border border-emerald-700 bg-emerald-950/60 px-4 py-3 text-lg outline-none focus:border-emerald-400"
        />

        <button
          onClick={create}
          disabled={busy || !supabaseConfigured}
          className="w-full rounded-xl bg-emerald-500 py-3 text-lg font-bold text-emerald-950 active:scale-95 disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Create private room'}
        </button>

        <div className="flex items-center gap-3 text-emerald-400/50 text-sm">
          <div className="h-px flex-1 bg-emerald-400/20" /> or join <div className="h-px flex-1 bg-emerald-400/20" />
        </div>

        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Paste invite link"
          className="w-full rounded-xl border border-emerald-700 bg-emerald-950/60 px-4 py-3 outline-none focus:border-emerald-400"
        />
        <button
          onClick={join}
          disabled={!supabaseConfigured}
          className="w-full rounded-xl border border-emerald-500 py-3 text-lg font-bold text-emerald-300 active:scale-95 disabled:opacity-40"
        >
          Join room
        </button>

        {error && <p className="text-center text-sm text-red-300">{error}</p>}
      </div>
    </div>
  );
}
