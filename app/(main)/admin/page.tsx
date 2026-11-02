import Link from 'next/link';
import { requireAdmin } from '@/lib/adminGuard';
import { StatCard } from '@/components/admin/StatCard';
import { BarChart } from '@/components/admin/BarChart';
import { getOverviewStats, getSignupSeries, getDauSeries } from '@/lib/adminStats';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  // The layout's check does not stop this page from rendering (and sending its data), so check here too.
  await requireAdmin();
  const [stats, signups, dau] = await Promise.all([
    getOverviewStats(),
    getSignupSeries(30),
    getDauSeries(14),
  ]);

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <div className="space-y-8">
      {/* People / subscribers */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-3">People</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total users" value={stats.totalUsers.toLocaleString()} sub={`${stats.admins} admin`} accent />
          <StatCard label="New this week" value={stats.new7d.toLocaleString()} sub={`${stats.new1d} today · ${stats.new30d} in 30d`} />
          <StatCard
            label="Digest subscribers"
            value={stats.digestSubs.toLocaleString()}
            sub={`${pct(stats.digestSubs, stats.totalUsers)}% of users`}
          />
          <StatCard
            label="Active (7d)"
            value={stats.active7d.toLocaleString()}
            sub={`${stats.active1d} today · ${stats.active30d} in 30d`}
          />
        </div>
      </section>

      {/* Learning / engagement */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-3">Learning</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Lessons completed" value={stats.lessonsCompleted.toLocaleString()} />
          <StatCard label="Quiz sessions" value={stats.quizSessions.toLocaleString()} />
          <StatCard label="Avg quiz score" value={`${stats.avgQuizScore}%`} />
          <StatCard
            label="Weekly retention"
            value={`${pct(stats.active7d, stats.totalUsers)}%`}
            sub="active in last 7 days"
          />
        </div>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm font-semibold text-text">New signups</h3>
            <span className="text-xs text-text-tertiary">last 30 days</span>
          </div>
          <BarChart data={signups} labelEvery={5} />
        </div>
        <div className="rounded-2xl border border-border p-5" style={{ background: 'var(--color-surface)' }}>
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm font-semibold text-text">Daily active users</h3>
            <span className="text-xs text-text-tertiary">last 14 days</span>
          </div>
          <BarChart data={dau} labelEvery={2} />
        </div>
      </section>

      <div className="flex gap-3 text-sm">
        <Link href="/admin/users" className="text-primary hover:underline">View all users →</Link>
        <Link href="/admin/engagement" className="text-primary hover:underline">Engagement breakdown →</Link>
      </div>
    </div>
  );
}
