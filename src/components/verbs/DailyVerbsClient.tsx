'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dailyVerbs, type DailyVerb } from '@/data/dailyVerbs';
import { useAuthStore } from '@/store/useAuthStore';

const GOLD = '#D4A246';

// Diacritic-insensitive normaliser so "احب", "أحب", and "أَحَبَّ" all match, and
// English search ignores case. Lets people search in either script, loosely.
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, '') // harakāt + tatweel
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

function matches(v: DailyVerb, q: string): boolean {
  const n = norm(q);
  if (!n) return true;
  return (
    norm(v.en).includes(n) ||
    norm(v.ar).includes(n) ||
    norm(v.present).includes(n) ||
    norm(v.translit).includes(n) ||
    v.examples.some((e) => norm(e.en).includes(n) || norm(e.ar).includes(n)) ||
    // Searching "to boycott" should surface قَطَعَ, whose family carries قاطَعَ.
    (v.family ?? []).some((f) => norm(f.en).includes(n) || norm(f.ar).includes(n))
  );
}

const CATEGORIES = ['All', 'Everyday', 'Speaking', 'Movement', 'Feelings', 'Mind', 'Work & Money', 'Home', 'Food', 'People', 'Body', 'Faith', 'Nature', 'Action'];

type Tab = 'all' | 'learning' | 'known';

// `short` keeps the three tabs on one line at 390px, where "Still learning"
// wraps and drags the whole sticky header taller.
const TABS: { id: Tab; label: string; short: string }[] = [
  { id: 'all', label: 'All', short: 'All' },
  { id: 'learning', label: 'Still learning', short: 'Learning' },
  { id: 'known', label: 'Remembered', short: 'Known' },
];

const EMPTY: ReadonlySet<string> = new Set();

const NETWORK_MESSAGE = 'Could not reach the server — check your connection and try again.';

/**
 * The message to show for a failed response.
 *
 * The server's own text is used when there is one, because the useful cases are
 * specific: a 503 saying the progress table is missing should not be reported
 * to the reader as a connection problem they can do something about.
 */
async function failureMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  const message = (body as { error?: unknown } | null)?.error;
  return typeof message === 'string' && message ? message : `${fallback} (error ${res.status})`;
}

export function DailyVerbsClient() {
  const { user, isLoading: authLoading, login } = useAuthStore();
  const userId = user?.id ?? null;

  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [tab, setTab] = useState<Tab>('all');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Progress is stored together with the account it belongs to. Reading it back
  // through an identity check means signing out shows an empty list on the very
  // next render, rather than briefly showing the previous user's ticks until an
  // effect gets a chance to clear them.
  const [progress, setProgress] = useState<{ userId: string | null; ids: ReadonlySet<string> }>(
    { userId: null, ids: EMPTY },
  );
  const isCurrent = userId !== null && progress.userId === userId;
  const remembered = isCurrent ? progress.ids : EMPTY;
  const loaded = isCurrent;

  // Every change of tab, category or search text starts a new pass over the
  // list. Pins are keyed on the epoch rather than on the filter values, because
  // leaving a filter and coming back is a new pass too — keying on the values
  // would resurrect pins from the earlier visit and leave a ticked verb sitting
  // in "Still learning".
  const [viewEpoch, setViewEpoch] = useState(0);
  const newPass = useCallback(() => setViewEpoch((e) => e + 1), []);

  // A verb ticked during the current pass is held in place, so the card does
  // not vanish from under the cursor the instant it is ticked.
  const [pinnedState, setPinnedState] = useState<{ epoch: number; ids: ReadonlySet<string> }>(
    { epoch: 0, ids: EMPTY },
  );
  const pinned = pinnedState.epoch === viewEpoch ? pinnedState.ids : EMPTY;

  // ── Load progress once signed in ──────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      let ids: ReadonlySet<string> = EMPTY;
      let failure: string | null = null;
      try {
        const res = await fetch('/api/verbs/progress');
        if (res.ok) {
          const data: { remembered: string[] } = await res.json();
          ids = new Set(data.remembered);
        } else {
          failure = await failureMessage(res, 'Could not load your progress');
        }
      } catch {
        failure = NETWORK_MESSAGE;
      }
      if (cancelled) return;
      // Say so rather than rendering an empty bar: "0 of 298" to someone who
      // has ticked forty verbs reads as their progress having been lost.
      setLoadError(failure);
      setProgress({ userId, ids });
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Toggle one verb ───────────────────────────────────────
  const inFlight = useRef<Set<string>>(new Set());

  const toggle = useCallback(async (verbId: string) => {
    if (!userId) {
      login('Sign in to tick off the verbs you know');
      return;
    }
    if (inFlight.current.has(verbId)) return;
    inFlight.current.add(verbId);

    const next = !remembered.has(verbId);
    setSaveError(null);
    setPinnedState((p) => ({
      epoch: viewEpoch,
      ids: new Set(p.epoch === viewEpoch ? p.ids : []).add(verbId),
    }));

    const apply = (add: boolean) =>
      setProgress((prev) => {
        const s = new Set(prev.userId === userId ? prev.ids : []);
        if (add) s.add(verbId); else s.delete(verbId);
        return { userId, ids: s };
      });

    // Optimistic: the tick must feel instant, and the request usually wins.
    apply(next);

    try {
      const res = await fetch('/api/verbs/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verbId, remembered: next }),
      });
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not save that'));
      // The server returns the full set, so a second tab's changes land here
      // too instead of being silently overwritten.
      const data: { remembered: string[] } = await res.json();
      setProgress({ userId, ids: new Set(data.remembered) });
    } catch (err) {
      // Roll the optimistic change back rather than leaving a tick that was
      // never saved — that would be worse than not ticking at all.
      apply(!next);
      // A thrown Error carries the server's explanation; anything else means
      // fetch itself failed, which really is a connection problem.
      setSaveError(err instanceof Error && err.message ? err.message : NETWORK_MESSAGE);
    } finally {
      inFlight.current.delete(verbId);
    }
  }, [userId, remembered, viewEpoch]);

  // ── Filtering ─────────────────────────────────────────────
  const byCatAndQuery = useMemo(
    () => dailyVerbs.filter((v) => (cat === 'All' || v.cat === cat) && matches(v, query)),
    [query, cat],
  );

  const knownCount = useMemo(
    () => byCatAndQuery.filter((v) => remembered.has(v.id)).length,
    [byCatAndQuery, remembered],
  );

  const results = useMemo(() => {
    if (tab === 'all') return byCatAndQuery;
    return byCatAndQuery.filter((v) => {
      if (pinned.has(v.id)) return true;
      const known = remembered.has(v.id);
      return tab === 'known' ? known : !known;
    });
  }, [byCatAndQuery, tab, remembered, pinned]);

  const totalKnown = remembered.size;
  const pct = dailyVerbs.length ? Math.round((totalKnown / dailyVerbs.length) * 100) : 0;
  const showProgress = loaded;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: GOLD }}>Speak Arabic</p>
        <h1 className="text-3xl sm:text-4xl font-heading tracking-tight leading-[1.05]" style={{ color: 'var(--color-ivory)' }}>
          Daily Verbs
        </h1>
        <p className="mt-2 text-sm leading-relaxed max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>
          The verbs you actually use — to want, to go, to love, to understand. Learn these and you can
          say most of what daily life needs. Search in English or Arabic.
        </p>
      </div>

      {/* Progress — signed in */}
      {showProgress && (
        <div className="mb-4 rounded-2xl px-4 py-3.5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-light)' }}>
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <p className="text-sm" style={{ color: 'var(--color-ivory)' }}>
              <span className="font-semibold" style={{ color: GOLD }}>{totalKnown}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}> of {dailyVerbs.length} remembered</span>
            </p>
            <p className="text-xs tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>{pct}%</p>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${GOLD}, #E8B84B)` }}
            />
          </div>
          {totalKnown === 0 && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
              Tick the circle on a verb once you can recall it without looking.
            </p>
          )}
        </div>
      )}

      {/* Progress — signed out */}
      {!user && !authLoading && (
        <div className="mb-4 rounded-2xl px-4 py-3.5 flex flex-wrap items-center justify-between gap-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-light)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Sign in to tick off the verbs you know and watch the list shrink.
          </p>
          <button
            onClick={() => login('Sign in to tick off the verbs you know')}
            className="shrink-0 text-xs font-semibold px-3.5 py-2 rounded-full transition-opacity hover:opacity-90"
            style={{ background: GOLD, color: '#14120F' }}
          >
            Sign in — it&rsquo;s free
          </button>
        </div>
      )}

      {(saveError || loadError) && (
        <p className="mb-3 text-xs px-1" role="status" style={{ color: '#E5766A' }}>
          {saveError ?? loadError}
        </p>
      )}

      {/* Search */}
      <div className="sticky top-16 lg:top-3 z-10 -mx-1 px-1 py-2" style={{ background: 'var(--color-canvas)' }}>
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#A3A19C' }} fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); newPass(); }}
            placeholder="Search a verb — e.g. love, أحب, to accept…"
            className="w-full pl-11 pr-10 py-3 rounded-2xl text-sm outline-none"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', color: 'var(--color-ivory)' }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); newPass(); }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-lg"
              style={{ color: '#A3A19C' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Status tabs — only meaningful once there is progress to filter by */}
        {showProgress && (
          <div className="flex gap-1.5 mt-2.5" role="tablist" aria-label="Filter by progress">
            {TABS.map((t) => {
              const on = tab === t.id;
              const count = t.id === 'all'
                ? byCatAndQuery.length
                : t.id === 'known'
                  ? knownCount
                  : byCatAndQuery.length - knownCount;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => { setTab(t.id); newPass(); }}
                  className="flex-1 text-xs font-medium px-3 py-2 rounded-xl transition-colors"
                  style={on
                    ? { background: 'rgba(212,162,70,0.16)', color: GOLD, border: `1px solid ${GOLD}` }
                    : { background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-light)' }}
                >
                  <span className="sm:hidden">{t.short}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="ml-1.5 tabular-nums" style={{ opacity: 0.65 }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Category chips */}
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map((c) => {
            const on = cat === c;
            return (
              <button
                key={c}
                onClick={() => { setCat(c); newPass(); }}
                className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
                style={on
                  ? { background: 'rgba(212,162,70,0.16)', color: GOLD, border: `1px solid ${GOLD}` }
                  : { background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-light)' }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Count */}
      <p className="text-xs mt-3 mb-3 px-1" style={{ color: 'var(--color-text-tertiary)' }}>
        {results.length} {results.length === 1 ? 'verb' : 'verbs'}
      </p>

      {/* Results */}
      {results.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {query
              ? <>No verb matches “{query}”. Try the English meaning or the Arabic word.</>
              : tab === 'known'
                ? <>Nothing ticked here yet. Tick a verb once you can recall it without looking.</>
                : <>Every verb here is ticked. Try another category, or the “All” tab.</>}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {results.map((v) => {
            const known = remembered.has(v.id);
            return (
              <article
                key={v.id}
                className="cv-auto-tall rounded-2xl p-4 flex flex-col transition-colors"
                style={{
                  background: known ? 'rgba(212,162,70,0.045)' : 'var(--color-surface)',
                  border: `1px solid ${known ? 'rgba(212,162,70,0.32)' : 'var(--color-border-light)'}`,
                }}
              >
                {/* English + category + tick */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-ivory)' }}>{v.en}</h2>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,162,70,0.1)', color: GOLD }}>
                      {v.cat}
                    </span>
                    <button
                      onClick={() => toggle(v.id)}
                      aria-pressed={known}
                      aria-label={known ? `Mark “${v.en}” as still learning` : `Mark “${v.en}” as remembered`}
                      title={user ? (known ? 'Remembered — click to undo' : 'Mark as remembered') : 'Sign in to track progress'}
                      className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                      style={{
                        background: known ? GOLD : 'transparent',
                        border: `1.5px solid ${known ? GOLD : 'var(--color-border-light)'}`,
                        color: known ? '#14120F' : '#57534E',
                      }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Arabic (past · present) */}
                <div className="flex items-baseline gap-3 flex-row-reverse justify-end" dir="rtl">
                  <span className="font-arabic leading-none" style={{ fontSize: '1.9rem', color: '#F0E8D8' }}>{v.ar}</span>
                  <span className="font-arabic leading-none" style={{ fontSize: '1.35rem', color: GOLD, opacity: 0.85 }}>{v.present}</span>
                </div>
                <p className="text-xs italic mt-1.5" style={{ color: '#A3A19C' }}>{v.translit}</p>

                {/* Examples */}
                <div className="mt-3 pt-3 space-y-2.5" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                  {v.examples.map((ex, i) => (
                    <div key={i}>
                      <p className="font-arabic leading-relaxed text-right" dir="rtl" style={{ fontSize: '1.05rem', color: '#E8DFC9' }}>{ex.ar}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{ex.en}</p>
                    </div>
                  ))}
                </div>

                {/* Same root, other wazn — the point of the whole site, in miniature */}
                {v.family && v.family.length > 0 && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: GOLD, opacity: 0.75 }}>
                      Same root, other forms
                    </p>
                    <ul className="space-y-1.5">
                      {v.family.map((f) => (
                        <li key={f.ar} className="flex items-baseline gap-2">
                          <span
                            className="shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(212,162,70,0.1)', color: GOLD, minWidth: '1.9rem', textAlign: 'center' }}
                          >
                            {f.form}
                          </span>
                          <span className="font-arabic leading-none" style={{ fontSize: '1.15rem', color: '#E8DFC9' }} dir="rtl">
                            {f.ar}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{f.en}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Footnote */}
      <p className="text-center text-[12px] mt-8" style={{ color: 'var(--color-text-tertiary)' }}>
        Showing {dailyVerbs.length} everyday verbs — more added regularly. The gold word is the present tense
        (يفعل), the form you use to say “I do it”. Where a root has other common measures, they are
        listed under “same root, other forms” — learn one, half-know the rest.
      </p>
    </div>
  );
}
