'use client';

import { useState } from 'react';

// Same words as CONSENT_WORDING.weekly in lib/email.ts (not imported: that file talks to the database).
const WORDING = 'The Friday email: one ayah, the root inside it, and what is new on QuRoots. Once a week. Unsubscribe any time.';

type State = 'idle' | 'busy' | 'confirm' | 'error';

/** "Get updates by email" box for the footer. Double opt-in: the address is saved, then they must tap the link we email. */
export function EmailSignup({ source = 'footer' }: { source?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy'); setError('');
    try {
      const res = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, source }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || 'Something went wrong. Please try again.'); setState('error'); return; }
      setState('confirm');
    } catch {
      setError('Something went wrong. Please try again.'); setState('error');
    }
  }

  if (state === 'confirm') return <p className="text-sm text-text" role="status">If this address isn&rsquo;t on the list yet, we&rsquo;ve emailed a link. Tap it to confirm; nothing else is sent until you do.</p>;

  return (
    <form onSubmit={submit} className="max-w-md">
      <label htmlFor={`email-${source}`} className="block text-sm font-medium text-text">Get the Friday ayah and Ramadan news by email</label>
      <div className="mt-2 flex gap-2">
        <input id={`email-${source}`} type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-transparent px-3 py-3 text-base text-text placeholder:text-text-tertiary focus:outline-none focus:border-primary" />
        <button type="submit" disabled={state === 'busy'} className="min-h-[44px] shrink-0 rounded-xl px-4 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--color-primary)', color: '#1a1206' }}>
          {state === 'busy' ? 'Sending…' : 'Join'}
        </button>
      </div>
      {state === 'error' && <p className="mt-2 text-sm text-red-400" role="alert">{error}</p>}
      <p className="mt-2 text-xs text-text-tertiary">{WORDING} We&rsquo;ll email a link to confirm first.</p>
    </form>
  );
}
