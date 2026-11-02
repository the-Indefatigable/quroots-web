import { sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/adminGuard';
import { db, dbQuery } from '@/db';
import { relativeDay } from '@/lib/adminStats';

export const dynamic = 'force-dynamic';

export default async function AdminEngagementPage() {
  // The layout's check does not stop this page from rendering (and sending its data), so check here too.
  await requireAdmin();
  const [topLessons, funnel, quizByType, recent] = await Promise.all([
    dbQuery(() =>
      db.execute(sql`
        SELECT l.title, count(*)::int AS completions
        FROM user_lesson_progress p
        JOIN learning_lessons l ON l.id = p.lesson_id
        WHERE p.status = 'completed'
        GROUP BY l.id, l.title
        ORDER BY completions DESC
        LIMIT 12
      `)
    ) as Promise<any[]>,
    dbQuery(() =>
      db.execute(sql`
        SELECT lu.title, lu.sort_order,
               count(up.user_id)::int AS started,
               count(*) FILTER (WHERE up.status = 'completed')::int AS completed
        FROM learning_units lu
        LEFT JOIN user_unit_progress up ON up.unit_id = lu.id
        GROUP BY lu.id, lu.title, lu.sort_order
        ORDER BY lu.sort_order
      `)
    ) as Promise<any[]>,
    dbQuery(() =>
      db.execute(sql`
        SELECT quiz_type, count(*)::int AS sessions, coalesce(round(avg(score)),0)::int AS avg_score
        FROM quiz_sessions
        GROUP BY quiz_type
        ORDER BY sessions DESC
      `)
    ) as Promise<any[]>,
    dbQuery(() =>
      db.execute(sql`
        SELECT u.name, u.email, l.title, p.completed_at
        FROM user_lesson_progress p
        JOIN users u ON u.id = p.user_id
        JOIN learning_lessons l ON l.id = p.lesson_id
        WHERE p.status = 'completed' AND p.completed_at IS NOT NULL
        ORDER BY p.completed_at DESC
        LIMIT 15
      `)
    ) as Promise<any[]>,
  ]);

  const maxCompletions = Math.max(1, ...topLessons.map((l) => l.completions));
  const maxStarted = Math.max(1, ...funnel.map((f) => f.started));

  return (
    <div className="space-y-8">
      {/* Unit funnel */}
      <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
        <h3 className="text-sm font-semibold text-text mb-1">Curriculum funnel</h3>
        <p className="text-xs text-text-tertiary mb-4">How many learners start vs. finish each unit — where they drop off.</p>
        {funnel.length === 0 ? (
          <p className="text-sm text-text-tertiary">No unit progress yet.</p>
        ) : (
          <div className="space-y-3">
            {funnel.map((f, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-secondary truncate mr-3">{f.title}</span>
                  <span className="text-text-tertiary whitespace-nowrap">
                    {f.completed} done / {f.started} started
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border-light)' }}>
                  <div className="h-full flex">
                    <div style={{ width: `${(f.completed / maxStarted) * 100}%`, background: 'var(--color-primary)' }} />
                    <div style={{ width: `${((f.started - f.completed) / maxStarted) * 100}%`, background: 'var(--color-primary)', opacity: 0.3 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top lessons */}
        <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
          <h3 className="text-sm font-semibold text-text mb-4">Most-completed lessons</h3>
          {topLessons.length === 0 ? (
            <p className="text-sm text-text-tertiary">No lesson completions yet.</p>
          ) : (
            <div className="space-y-2.5">
              {topLessons.map((l, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-secondary truncate mr-3">{l.title}</span>
                    <span className="text-text-tertiary tabular-nums">{l.completions}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--color-border-light)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(l.completions / maxCompletions) * 100}%`, background: 'var(--color-primary)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quiz by type */}
        <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
          <h3 className="text-sm font-semibold text-text mb-4">Quiz activity by type</h3>
          {quizByType.length === 0 ? (
            <p className="text-sm text-text-tertiary">No quizzes taken yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wider text-text-tertiary">
                  <th className="pb-2 font-semibold">Type</th>
                  <th className="pb-2 font-semibold text-right">Sessions</th>
                  <th className="pb-2 font-semibold text-right">Avg score</th>
                </tr>
              </thead>
              <tbody>
                {quizByType.map((qz, i) => (
                  <tr key={i} className="border-t border-border-light">
                    <td className="py-2 text-text-secondary capitalize">{String(qz.quiz_type).replace(/_/g, ' ')}</td>
                    <td className="py-2 text-right text-text-secondary tabular-nums">{qz.sessions}</td>
                    <td className="py-2 text-right text-text-secondary tabular-nums">{qz.avg_score}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Recent activity */}
      <section className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
        <h3 className="text-sm font-semibold text-text mb-4">Recent lesson completions</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-text-tertiary">No recent activity.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary truncate mr-3">
                  <span className="text-text font-medium">{r.name || r.email.split('@')[0]}</span> finished “{r.title}”
                </span>
                <span className="text-text-tertiary whitespace-nowrap text-xs">{relativeDay(r.completed_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
