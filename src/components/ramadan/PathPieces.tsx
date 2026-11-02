'use client';

// The Ramadan paths' pages: a list of nights or days with progress, and one night or day of roots.
// Progress lives in the browser, like the Salah path, so nobody needs an account.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { RootCard } from '@/lib/ramadanPaths';

const GOLD = '#D4A246';

export function useDone(key: string) {
  const storeKey = `qr:${key}:done`;
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(storeKey) || '[]')); } catch { /* storage unavailable */ }
  }, [storeKey]);
  const complete = useCallback((n: number) => {
    setDone((prev) => {
      const next = [...new Set([...prev, n])].sort((a, b) => a - b);
      try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, [storeKey]);
  return { done, complete };
}

export type ListItem = { n: number; title: string; sub: string; pct: number };

/** The 30 nights or days, with how much is understood after the last one finished. */
export function PathList({ storeKey, base, unit, items, pctLabel }: {
  storeKey: string; base: string; unit: string; items: ListItem[]; pctLabel: string;
}) {
  const { done } = useDone(storeKey);
  const last = done.length ? Math.max(...done) : 0;
  const pct = last ? items.find((i) => i.n === last)?.pct ?? 0 : 0;
  const next = items.find((i) => !done.includes(i.n));
  return (
    <>
      <div className="rounded-2xl p-6 mb-10" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(212,162,70,.18)' }}>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-3">
          <div>
            <p className="text-sm" style={{ color: '#9A9893' }}>{pctLabel}</p>
            <p className="font-heading text-5xl" style={{ color: '#F0E8D8' }}>{pct}%</p>
          </div>
          {next && (
            <Link href={`${base}/${next.n}`} className="btn-primary whitespace-nowrap text-center">
              {done.length ? `Continue: ${unit} ${next.n}` : `Start ${unit} 1`}
            </Link>
          )}
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #C89535, ${GOLD})` }} />
        </div>
      </div>
      <ol>
        {items.map((i) => {
          const isDone = done.includes(i.n);
          return (
            <li key={i.n}>
              <Link href={`${base}/${i.n}`} className="flex items-center gap-4 py-3.5 px-3 rounded-xl transition-colors hover:bg-white/[0.03]">
                <span className="w-9 h-9 shrink-0 rounded-full grid place-items-center text-sm font-semibold"
                  style={{ background: isDone ? GOLD : 'rgba(255,255,255,.05)', color: isDone ? '#0E0D0C' : '#A09F9B' }}>
                  {isDone ? '✓' : i.n}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block" style={{ color: '#EDEDEC' }}>{i.title}</span>
                  <span className="block text-xs" style={{ color: '#6E6B66' }}>{i.sub}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Root({ r, countHere, hereLabel }: { r: RootCard; countHere?: number; hereLabel: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[15px] leading-snug" style={{ color: '#EDEDEC' }}>{r.meaning}</p>
          <p className="text-xs mt-1" style={{ color: '#8F8C86' }}>
            {countHere ? `${countHere}× ${hereLabel} · ` : ''}{r.quranCount.toLocaleString()}× in the Quran
          </p>
        </div>
        <Link href={`/roots/${encodeURIComponent(r.root.replace(/\s/g, ""))}`} className="font-arabic text-3xl shrink-0" style={{ color: GOLD }} dir="rtl" lang="ar">
          {r.letters}
        </Link>
      </div>
      {r.words.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {r.words.map((w) => {
            const [s, a] = w.ref.split(':');
            return (
              <li key={w.ar}>
                <Link href={`/quran/${s}?from=${a}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-white/[0.04]">
                  <span className="text-sm" style={{ color: '#B5B2AC' }}>{w.en ?? ''} <span className="text-xs" style={{ color: '#6E6B66' }}>{w.ref}</span></span>
                  <span className="font-arabic text-xl" style={{ color: '#F0E8D8' }} dir="rtl" lang="ar">{w.ar}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One night or day: its roots, how much it lets you understand, and the way to listen and move on. */
export function RootLesson({ storeKey, base, unit, n, total, kicker, title, intro, roots, hereLabel, pct, pctLabel, listen, extra }: {
  storeKey: string; base: string; unit: string; n: number; total: number; kicker: string; title: string; intro: string;
  roots: RootCard[]; hereLabel: string; pct: number; pctLabel: string;
  listen?: { href: string; label: string }; extra?: React.ReactNode;
}) {
  const { done, complete } = useDone(storeKey);
  const isDone = done.includes(n);
  return (
    <div className="max-w-3xl mx-auto px-5 py-12">
      <Link href={base} className="inline-flex items-center min-h-[44px] text-sm" style={{ color: '#9A9893' }}>← All {total} {unit}s</Link>
      <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: GOLD }}>{kicker}</p>
      <h1 className="font-heading leading-[1.08] mt-2 mb-4" style={{ fontSize: 'clamp(1.9rem, 4.4vw, 2.8rem)', color: '#F0E8D8' }}>{title}</h1>
      <p className="text-[17px] leading-relaxed mb-6" style={{ color: '#B5B2AC' }}>{intro}</p>

      <div className="rounded-2xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
        style={{ background: 'rgba(212,162,70,.06)', border: '1px solid rgba(212,162,70,.2)' }}>
        <div>
          <p className="font-heading text-4xl" style={{ color: '#F0E8D8' }}>{pct}%</p>
          <p className="text-sm" style={{ color: '#B5B2AC' }}>{pctLabel}</p>
        </div>
        {listen && <Link href={listen.href} className="btn-primary text-center whitespace-nowrap">{listen.label}</Link>}
      </div>

      {extra}

      {roots.length > 0 && (
        <div className="grid gap-3 mb-10">
          {roots.map((r) => <Root key={r.root} r={r} countHere={r.inJuz ?? r.inJuzAmma} hereLabel={hereLabel} />)}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {n > 1 ? <Link href={`${base}/${n - 1}`} className="inline-flex items-center min-h-[44px] text-sm" style={{ color: '#9A9893' }}>← {unit} {n - 1}</Link> : <span />}
        <button type="button" onClick={() => complete(n)} className="btn-primary" disabled={isDone}>
          {isDone ? `${unit[0].toUpperCase()}${unit.slice(1)} ${n} done ✓` : `I've learned these ${roots.length || ''} roots`.replace('  ', ' ')}
        </button>
        {n < total ? <Link href={`${base}/${n + 1}`} className="inline-flex items-center min-h-[44px] text-sm" style={{ color: GOLD }}>{unit} {n + 1} →</Link> : <span />}
      </div>
    </div>
  );
}
