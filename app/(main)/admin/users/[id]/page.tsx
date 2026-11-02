import Link from 'next/link';
import { requireAdmin } from '@/lib/adminGuard';
import { notFound } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { db, dbQuery } from '@/db';
import { StatCard } from '@/components/admin/StatCard';
import { shortDate, relativeDay } from '@/lib/adminStats';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  // The layout's check does not stop this page from rendering (and sending its data), so check here too.
  await requireAdmin();
  const { id } = params;

  const [user] = (await dbQuery(() =>
    db.execute(sql`
      SELECT u.*, g.balance AS gems, s.current_streak, s.longest_streak
      FROM users u
      LEFT JOIN user_gems g ON g.user_id = u.id
      LEFT JOIN user_streaks s ON s.user_id = u.id
      WHERE u.id = ${id}
    `)
  )) as any[];

  if (!user) notFound();

  const lessons = (await dbQuery(() =>
    db.execute(sql`
      SELECT l.title, p.best_score, p.attempts, p.completed_at
      FROM user_lesson_progress p
      JOIN learning_lessons l ON l.id = p.lesson_id
      WHERE p.user_id = ${id} AND p.status = 'completed'
      ORDER BY p.completed_at DESC NULLS LAST
      LIMIT 25
    `)
  )) as any[];

  const quizzes = (await dbQuery(() =>
    db.execute(sql`
      SELECT quiz_type, item_count, correct_count, score, session_started_at
      FROM quiz_sessions
      WHERE user_id = ${id}
      ORDER BY session_started_at DESC
      LIMIT 15
    `)
  )) as any[];

  const [counts] = (await dbQuery(() =>
    db.execute(sql`
      SELECT
        (SELECT count(*) FROM user_lesson_progress WHERE user_id = ${id} AND status = 'completed')::int AS lessons,
        (SELECT count(*) FROM quiz_sessions WHERE user_id = ${id})::int AS quizzes,
        (SELECT coalesce(sum(time_spent_s),0) FROM user_activity WHERE user_id = ${id})::int AS time_s
    `)
  )) as any[];

  const displayName = user.name || user.email.split('@')[0];
  const minutes = Math.round((counts?.time_s ?? 0) / 60);

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-sm text-text-secondary hover:text-primary">← All users</Link>

      {/* Profile header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-primary uppercase">{displayName[0]}</span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl font-heading text-text truncate">{displayName}</h2>
          <p className="text-sm text-text-tertiary truncate">
            {user.email}
            {user.role !== 'student' && <span className="ml-2 text-primary font-semibold uppercase text-xs">{user.role}</span>}
          </p>
          <p className="text-xs text-text-tertiary mt-0.5">
            Joined {user.created_at ? shortDate(user.created_at) : '—'} · Last active {relativeDay(user.last_active)}
            {user.digest_opt_in && <span className="ml-2 text-correct">· digest ✓</span>}
          </p>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total XP" value={(user.total_xp ?? 0).toLocaleString()} sub={`Level ${user.user_level ?? 1}`} accent />
        <StatCard label="Current streak" value={`${user.current_streak ?? user.streak_days ?? 0}d`} sub={`Longest ${user.longest_streak ?? 0}d`} />
        <StatCard label="Lessons done" value={counts?.lessons ?? 0} sub={`${minutes} min studied`} />
        <StatCard label="Quizzes taken" value={counts?.quizzes ?? 0} sub={`${user.gems ?? 0} gems`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Lessons */}
        <div className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
          <h3 className="text-sm font-semibold text-text mb-3">Recent lessons completed</h3>
          {lessons.length === 0 ? (
            <p className="text-sm text-text-tertiary">No lessons completed yet.</p>
          ) : (
            <ul className="space-y-2">
              {lessons.map((l, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary truncate mr-3">{l.title}</span>
                  <span className="text-text-tertiary whitespace-nowrap text-xs">
                    {l.best_score != null ? `${l.best_score}%` : '—'} · {l.completed_at ? shortDate(l.completed_at) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quizzes */}
        <div className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
          <h3 className="text-sm font-semibold text-text mb-3">Recent quiz sessions</h3>
          {quizzes.length === 0 ? (
            <p className="text-sm text-text-tertiary">No quizzes taken yet.</p>
          ) : (
            <ul className="space-y-2">
              {quizzes.map((qz, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary capitalize truncate mr-3">{String(qz.quiz_type).replace(/_/g, ' ')}</span>
                  <span className="text-text-tertiary whitespace-nowrap text-xs">
                    {qz.correct_count}/{qz.item_count} · {qz.score}% · {qz.session_started_at ? shortDate(qz.session_started_at) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
