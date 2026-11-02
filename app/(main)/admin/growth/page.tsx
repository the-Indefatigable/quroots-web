import Link from 'next/link';
import { requireAdmin } from '@/lib/adminGuard';
import { sql } from 'drizzle-orm';
import { db, dbQuery } from '@/db';
import { relativeDay } from '@/lib/adminStats';
import { getStripe } from '@/lib/stripe';
import { sponsorPool } from '@/lib/gifts';

export const dynamic = 'force-dynamic';

const RANGES = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 0, label: 'All time' }];
const GOLD = '#D4A246';

type Funnel = { visitors: number; path: number; d1open: number; d1: number; d3: number; d7: number; checkout: number; paid: number };

/**
 * The growth funnel for the salah path: where visitors come from and how far they get toward
 * paying. Fed by growth_events (src/lib/track.ts). Admin visitors are left out of every number.
 */
export default async function AdminGrowthPage({ searchParams }: { searchParams: { days?: string } }) {
  // The layout's check does not stop this page from rendering (and sending its data), so check here too.
  await requireAdmin();
  const days = RANGES.some((r) => String(r.days) === searchParams.days) ? Number(searchParams.days) : 30;
  const since = days ? sql`now() - make_interval(days => ${days})` : sql`'-infinity'::timestamptz`;

  // Every query starts from the same filtered events: in range, and not from an admin's browser.
  const ev = sql`
    admin_v AS (SELECT DISTINCT e.visitor_id FROM growth_events e JOIN users u ON u.id = e.user_id WHERE u.role = 'admin'),
    ev AS (SELECT * FROM growth_events WHERE created_at >= ${since} AND visitor_id NOT IN (SELECT visitor_id FROM admin_v)),
    pv AS (
      SELECT visitor_id,
        bool_or(name = 'visit') AS v, bool_or(name = 'path_view') AS path,
        bool_or(name = 'day_open' AND day = 1) AS d1open, bool_or(name = 'day_complete' AND day = 1) AS d1,
        bool_or(name = 'day_complete' AND day = 3) AS d3, bool_or(name = 'day_complete' AND day = 7) AS d7,
        bool_or(name = 'checkout_start') AS checkout, bool_or(name = 'purchase') AS paid
      FROM ev GROUP BY visitor_id),
    first_touch AS (
      SELECT DISTINCT ON (visitor_id) visitor_id, coalesce(source, 'unknown') AS source, campaign, variant
      FROM growth_events ORDER BY visitor_id, created_at)`;

  let data;
  try {
    data = await Promise.all([
      dbQuery(() => db.execute(sql`WITH ${ev} SELECT
          count(*) FILTER (WHERE v OR path OR d1open)::int AS visitors, count(*) FILTER (WHERE path)::int AS path,
          count(*) FILTER (WHERE d1open)::int AS d1open, count(*) FILTER (WHERE d1)::int AS d1, count(*) FILTER (WHERE d3)::int AS d3,
          count(*) FILTER (WHERE d7)::int AS d7, count(*) FILTER (WHERE checkout)::int AS checkout, count(*) FILTER (WHERE paid)::int AS paid
        FROM pv`)) as Promise<any[]>,
      dbQuery(() => db.execute(sql`WITH ${ev} SELECT
          (SELECT count(*)::int FROM users WHERE role <> 'admin' AND created_at >= ${since}) AS signups,
          (SELECT coalesce(sum(v), 0)::int FROM (SELECT max(value) AS v FROM ev WHERE name = 'purchase' GROUP BY coalesce(user_id::text, visitor_id)) p) AS revenue,
          (SELECT count(*)::int FROM users WHERE supporter_order_id LIKE 'path:%' AND role <> 'admin') AS paid_all_time`)) as Promise<any[]>,
      dbQuery(() => db.execute(sql`WITH ${ev} SELECT f.source,
          count(*) FILTER (WHERE v OR path OR d1open)::int AS visitors, count(*) FILTER (WHERE d1open)::int AS d1open,
          count(*) FILTER (WHERE d7)::int AS d7, count(*) FILTER (WHERE paid)::int AS paid
        FROM pv JOIN first_touch f USING (visitor_id) GROUP BY f.source ORDER BY visitors DESC LIMIT 15`)) as Promise<any[]>,
      dbQuery(() => db.execute(sql`WITH ${ev} SELECT f.campaign, coalesce(f.variant, '—') AS variant, f.source,
          count(*)::int AS visitors, count(*) FILTER (WHERE d1open)::int AS d1open, count(*) FILTER (WHERE d7)::int AS d7, count(*) FILTER (WHERE paid)::int AS paid
        FROM pv JOIN first_touch f USING (visitor_id) WHERE f.campaign IS NOT NULL
        GROUP BY f.campaign, f.variant, f.source ORDER BY visitors DESC LIMIT 20`)) as Promise<any[]>,
      dbQuery(() => db.execute(sql`WITH ${ev} SELECT day, count(DISTINCT visitor_id)::int AS n
        FROM ev WHERE name = 'day_complete' GROUP BY day ORDER BY day`)) as Promise<any[]>,
      dbQuery(() => db.execute(sql`WITH ${ev}, d AS (SELECT generate_series(current_date - 29, current_date, '1 day')::date AS day)
        SELECT to_char(d.day, 'Mon DD') AS label,
          (SELECT count(DISTINCT visitor_id)::int FROM ev WHERE created_at::date = d.day) AS visitors,
          (SELECT count(DISTINCT visitor_id)::int FROM ev WHERE name = 'day_complete' AND created_at::date = d.day) AS learners,
          (SELECT count(*)::int FROM users WHERE role <> 'admin' AND created_at::date = d.day) AS signups,
          (SELECT count(DISTINCT coalesce(user_id::text, visitor_id))::int FROM ev WHERE name = 'purchase' AND created_at::date = d.day) AS paid
        FROM d ORDER BY d.day`)) as Promise<any[]>,
      dbQuery(() => db.execute(sql`WITH ${ev} SELECT ev.name, ev.day, ev.source, ev.created_at, u.name AS user_name, u.email
        FROM ev LEFT JOIN users u ON u.id = ev.user_id WHERE ev.name <> 'visit' ORDER BY ev.created_at DESC LIMIT 25`)) as Promise<any[]>,
    ]);
  } catch (err) {
    return (
      <section className="rounded-2xl border border-border p-6" style={{ background: 'var(--color-surface)' }}>
        <h3 className="text-sm font-semibold text-text mb-1">Growth tracking isn&apos;t set up yet</h3>
        <p className="text-sm text-text-secondary">The <code>growth_events</code> table is missing. Apply <code>drizzle/0002_growth_events.sql</code> to the database, then reload.</p>
        <p className="text-xs text-text-tertiary mt-3">{(err as Error).message}</p>
      </section>
    );
  }

  const [[f], [totals], sources, reels, dayRows, trend, recent] = data as [Funnel[], any[], any[], any[], any[], any[], any[]];
  const steps: [string, number, string][] = [
    ['Visited the site', f.visitors, 'Anyone who opened a page'],
    ['Saw the salah path', f.path, 'Opened /salah'],
    ['Opened day 1', f.d1open, 'Started learning'],
    ['Finished day 1', f.d1, 'First win'],
    ['Finished day 3', f.d3, 'Building the habit'],
    ['Finished day 7', f.d7, 'Completed the free week: the number that matters'],
    ['Started checkout', f.checkout, 'Clicked unlock'],
    ['Paid', f.paid, '$29 founding price'],
  ];
  const byDay = Object.fromEntries(dayRows.map((r) => [r.day, r.n]));
  const maxDay = Math.max(1, ...dayRows.map((r) => r.n));
  const maxTrend = Math.max(1, ...trend.map((t) => t.visitors));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">Where learners come from and how far they get toward paying. Admins are excluded.</p>
        <nav className="flex gap-1 rounded-xl border border-border p-1" style={{ background: 'var(--color-surface)' }}>
          {RANGES.map((r) => (
            <Link key={r.days} href={`/admin/growth?days=${r.days}`} className="px-3 py-1.5 text-xs font-medium rounded-lg"
              style={{ background: r.days === days ? 'rgba(212,162,70,.15)' : 'transparent', color: r.days === days ? GOLD : 'var(--color-text-secondary)' }}>{r.label}</Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Visitors', f.visitors, null],
          ['Sign-ups', totals.signups, f.visitors ? `${pct(totals.signups, f.visitors)} of visitors` : null],
          ['Finished free week', f.d7, f.d1open ? `${pct(f.d7, f.d1open)} of day-1 starters` : null],
          ['Revenue', `$${(totals.revenue / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, `${f.paid} paid in range · ${totals.paid_all_time} all time`],
        ].map(([label, value, sub]) => (
          <div key={label as string} className="rounded-2xl border border-border p-4" style={{ background: 'var(--color-surface)' }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">{label}</div>
            <div className="text-3xl font-heading mt-1" style={{ color: 'var(--color-ivory)' }}>{value}</div>
            {sub && <div className="text-xs text-text-tertiary mt-1">{sub}</div>}
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
        <h3 className="text-sm font-semibold text-text mb-1">Salah path funnel</h3>
        <p className="text-xs text-text-tertiary mb-4">Unique visitors who reached each step. The percentage is how many made it from the step above.</p>
        <div className="space-y-2.5">
          {steps.map(([label, n, hint], i) => (
            <div key={label} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3">
              <div>
                <div className="text-sm text-text">{label}</div>
                <div className="text-[11px] text-text-tertiary leading-tight">{hint}</div>
              </div>
              <div className="h-7 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,.04)' }}>
                <div className="h-full rounded-lg" style={{ width: `${f.visitors ? Math.max(2, (n / f.visitors) * 100) : 0}%`, background: label === 'Finished day 7' ? GOLD : 'rgba(212,162,70,.45)' }} />
              </div>
              <div className="text-right w-24">
                <span className="text-sm font-semibold text-text tabular-nums">{n}</span>
                <span className="text-xs text-text-tertiary ml-2 tabular-nums">{i ? pct(n, steps[i - 1][1]) : ''}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
        <h3 className="text-sm font-semibold text-text mb-1">Last 30 days</h3>
        <p className="text-xs text-text-tertiary mb-4">Bars are visitors per day. Gold dots mark days with paid purchases.</p>
        <div className="flex items-end gap-1 h-36">
          {trend.map((t) => (
            <div key={t.label} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              {t.paid > 0 && <div className="w-2 h-2 rounded-full mb-1" style={{ background: GOLD }} />}
              <div className="w-full rounded-t" style={{ height: `${(t.visitors / maxTrend) * 100}%`, minHeight: t.visitors ? 3 : 1, background: t.visitors ? 'rgba(212,162,70,.55)' : 'rgba(255,255,255,.06)' }} />
              <div className="absolute bottom-full mb-6 hidden group-hover:block z-10 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-[11px] text-text" style={{ background: 'var(--color-canvas)' }}>
                {t.label}: {t.visitors} visitors · {t.signups} sign-ups · {t.learners} learners · {t.paid} paid
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-text-tertiary mt-2"><span>{trend[0]?.label}</span><span>{trend[trend.length - 1]?.label}</span></div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
          <h3 className="text-sm font-semibold text-text mb-1">Where they come from</h3>
          <p className="text-xs text-text-tertiary mb-4">First place we saw each visitor come from. Tag your bio links with <code>?src=ig</code>, <code>?src=tt</code>, <code>?src=yt</code>.</p>
          <Table head={['Source', 'Visitors', 'Day 1', 'Day 7', 'Paid']} rows={sources.map((s) => [s.source, s.visitors, s.d1open, `${s.d7} · ${pct(s.d7, s.d1open)}`, s.paid])} empty="No visits recorded yet." />
        </section>
        <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
          <h3 className="text-sm font-semibold text-text mb-1">Reels and A/B versions</h3>
          <p className="text-xs text-text-tertiary mb-4">From links with <code>&amp;c=reel-id&amp;v=cinematic</code> or <code>v=bright</code>.</p>
          <Table head={['Reel', 'Version', 'Source', 'Visitors', 'Day 1', 'Day 7', 'Paid']} rows={reels.map((r) => [r.campaign, r.variant, r.source, r.visitors, r.d1open, r.d7, r.paid])} empty="No tagged reel links yet." />
        </section>
      </div>

      <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
        <h3 className="text-sm font-semibold text-text mb-1">Where learners stop</h3>
        <p className="text-xs text-text-tertiary mb-4">Unique visitors who finished each day. A sharp drop after a day means that lesson needs work. Days 1 to 7 are free.</p>
        <div className="flex items-end gap-1 h-32">
          {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
            <div key={d} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="text-[10px] text-text-tertiary tabular-nums mb-1">{byDay[d] ?? ''}</div>
              <div className="w-full rounded-t" style={{ height: `${((byDay[d] ?? 0) / maxDay) * 100}%`, minHeight: 1, background: d <= 7 ? GOLD : 'rgba(212,162,70,.4)' }} />
              <div className="text-[10px] text-text-tertiary mt-1">{d}</div>
            </div>
          ))}
        </div>
      </section>

      <SponsorPool />

      <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
        <h3 className="text-sm font-semibold text-text mb-4">Latest activity</h3>
        <Table head={['When', 'What', 'Who', 'Source']} rows={recent.map((r) => [relativeDay(r.created_at), label(r.name, r.day), r.user_name || r.email || 'guest', r.source ?? '—'])} empty="Nothing yet. Activity shows up here as soon as visitors use the path." />
      </section>
    </div>
  );
}

function label(name: string, day: number | null) {
  return ({ path_view: 'Viewed the path', day_open: `Opened day ${day}`, day_complete: `Finished day ${day}`, share: `Shared day ${day}`, checkout_start: 'Started checkout', purchase: 'Paid 🎉' } as Record<string, string>)[name] ?? name;
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-text-tertiary">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr>{head.map((h, i) => <th key={h} className={`pb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className={`py-2 tabular-nums ${j ? 'text-right text-text-secondary' : 'text-left text-text'}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// Places people have paid for, waiting for someone who asks for a free place.
async function SponsorPool() {
  const stripe = getStripe();
  const pool = stripe ? await sponsorPool(stripe).catch(() => []) : [];
  return (
    <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
      <h3 className="text-sm font-semibold text-text mb-1">Sponsored places ready to give</h3>
      <p className="text-xs text-text-tertiary mb-4">When someone emails asking for a free place, reply with one of these links. Each works once.</p>
      {pool.length ? (
        <ul className="space-y-1.5 text-sm">{pool.map((p) => <li key={p.code} className="font-mono text-text-secondary select-all">https://quroots.com/gift/{p.code}</li>)}</ul>
      ) : <p className="text-sm text-text-tertiary">None yet. Places appear here when someone sponsors one at /gift.</p>}
    </section>
  );
}
