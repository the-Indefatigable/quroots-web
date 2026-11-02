'use client';

import { useState } from 'react';

type Msg = { tone: 'ok' | 'bad'; text: string } | null;

/** Write a note, send yourself a test, then send it to everyone who said yes to the Friday email. */
export function BroadcastForm({ count }: { count: number }) {
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const ready = subject.trim().length >= 3 && text.trim().length >= 10;

  async function post(body: object) {
    const res = await fetch('/api/admin/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Something went wrong (${res.status}).`);
    return json;
  }

  async function test() {
    setBusy(true); setMsg(null);
    try { const r = await post({ mode: 'test', subject, text }); setMsg({ tone: 'ok', text: `Test sent to ${r.to}. Check how it looks on your phone.` }); }
    catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
    setBusy(false);
  }

  async function sendAll() {
    if (!window.confirm(`Send "${subject}" to ${count} ${count === 1 ? 'person' : 'people'} now? This cannot be undone.`)) return;
    setBusy(true); setMsg(null);
    let from = 0, sent = 0; const failed: string[] = [];
    try {
      for (;;) {
        const r = await post({ mode: 'send', subject, text, expect: count, from });
        sent += r.sent; failed.push(...r.failed);
        setMsg({ tone: 'ok', text: `Sending… ${sent} of ${r.total} sent.` });
        if (r.next == null) break;
        from = r.next;
      }
      setMsg({ tone: failed.length ? 'bad' : 'ok', text: `Done. ${sent} sent${failed.length ? `, ${failed.length} failed: ${failed.join(', ')}` : ''}.` });
    } catch (e) {
      setMsg({ tone: 'bad', text: `Stopped after ${sent} sent. ${(e as Error).message} Do not press send again before checking who already got it.` });
    }
    setBusy(false);
  }

  const input = 'w-full rounded-xl border border-border bg-transparent px-3 py-3 text-base text-text placeholder:text-text-tertiary focus:outline-none focus:border-primary';
  return (
    <div className="space-y-3">
      <label className="block text-sm text-text-secondary">Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} className={`${input} mt-1`} placeholder="The free Ramadan paths are open" />
      </label>
      <label className="block text-sm text-text-secondary">Message
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={8000} rows={10} className={`${input} mt-1`}
          placeholder={'Write like you are messaging one person.\n\nA blank line starts a new paragraph.\n\nA line with only a link becomes a button:\n\nhttps://quroots.com/ramadan'} />
      </label>
      <p className="text-xs text-text-tertiary">Each email starts with &ldquo;Salaam [first name],&rdquo; is signed by you, and carries an unsubscribe link. Send yourself a test first.</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={test} disabled={!ready || busy} className="min-h-[44px] rounded-xl border border-border px-5 text-sm font-medium text-text disabled:opacity-40">Send myself a test</button>
        <button onClick={sendAll} disabled={!ready || busy || count === 0} className="min-h-[44px] rounded-xl px-5 text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--color-primary)', color: '#1a1206' }}>
          Send to {count} {count === 1 ? 'person' : 'people'}
        </button>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.tone === 'bad' ? 'text-red-400' : 'text-text-secondary'}`}>{msg.text}</p>}
    </div>
  );
}
