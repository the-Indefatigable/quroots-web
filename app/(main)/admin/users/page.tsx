import Link from 'next/link';
import { requireAdmin } from '@/lib/adminGuard';
import { sql } from 'drizzle-orm';
import { db, dbQuery } from '@/db';
import { UsersTableControls } from '@/components/admin/UsersTableControls';
import { relativeDay, shortDate } from '@/lib/adminStats';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const SORT_SQL: Record<string, string> = {
  new: 'u.created_at DESC NULLS LAST',
  active: 'u.last_active DESC NULLS LAST',
  xp: 'u.total_xp DESC NULLS LAST',
  name: 'u.name ASC NULLS LAST',
};

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  created_at: string | null;
  last_active: string | null;
  digest_opt_in: boolean;
  total_xp: number;
  user_level: number;
  streak_days: number;
  lessons: number;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; sort?: string };
}) {
  // The layout's check does not stop this page from rendering (and sending its data), so check here too.
  await requireAdmin();
  const q = (searchParams.q ?? '').trim();
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const sort = SORT_SQL[searchParams.sort ?? 'new'] ? (searchParams.sort ?? 'new') : 'new';
  const offset = (page - 1) * PAGE_SIZE;
  const like = `%${q}%`;
  const where = q
    ? sql`WHERE u.email ILIKE ${like} OR u.name ILIKE ${like}`
    : sql``;

  const rows = (await dbQuery(() =>
    db.execute(sql`
      SELECT u.id, u.name, u.email, u.role, u.created_at, u.last_active,
             u.digest_opt_in, u.total_xp, u.user_level, u.streak_days,
             (SELECT count(*) FROM user_lesson_progress p
                WHERE p.user_id = u.id AND p.status = 'completed')::int AS lessons
      FROM users u
      ${where}
      ORDER BY ${sql.raw(SORT_SQL[sort])}
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `)
  )) as unknown as UserRow[];

  const [countRow] = (await dbQuery(() =>
    db.execute(sql`SELECT count(*)::int AS c FROM users u ${where}`)
  )) as any[];
  const total = countRow?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <UsersTableControls />

      <div className="flex items-center justify-between text-xs text-text-tertiary mb-2">
        <span>{total.toLocaleString()} users{q ? ` matching "${q}"` : ''}</span>
        <span>Page {page} / {totalPages}</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border" style={{ background: 'var(--color-surface)' }}>
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wider text-text-tertiary border-b border-border">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold">Last active</th>
              <th className="px-4 py-3 font-semibold text-right">XP</th>
              <th className="px-4 py-3 font-semibold text-right">Lvl</th>
              <th className="px-4 py-3 font-semibold text-right">🔥</th>
              <th className="px-4 py-3 font-semibold text-right">Lessons</th>
              <th className="px-4 py-3 font-semibold text-center">Digest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-border-light last:border-0 hover:bg-canvas transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${u.id}`} className="flex flex-col group">
                    <span className="font-medium text-text group-hover:text-primary transition-colors truncate max-w-[220px]">
                      {u.name || u.email.split('@')[0]}
                      {u.role !== 'student' && (
                        <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-primary">{u.role}</span>
                      )}
                    </span>
                    <span className="text-xs text-text-tertiary truncate max-w-[220px]">{u.email}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{u.created_at ? shortDate(u.created_at) : '—'}</td>
                <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{relativeDay(u.last_active)}</td>
                <td className="px-4 py-3 text-right text-text-secondary tabular-nums">{(u.total_xp ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-text-secondary tabular-nums">{u.user_level ?? 1}</td>
                <td className="px-4 py-3 text-right text-text-secondary tabular-nums">{u.streak_days ?? 0}</td>
                <td className="px-4 py-3 text-right text-text-secondary tabular-nums">{u.lessons}</td>
                <td className="px-4 py-3 text-center">
                  {u.digest_opt_in ? <span className="text-correct">✓</span> : <span className="text-text-tertiary">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-text-tertiary">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} q={q} sort={searchParams.sort} />
      )}
    </div>
  );
}

function Pagination({ page, totalPages, q, sort }: { page: number; totalPages: number; q: string; sort?: string }) {
  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (sort) sp.set('sort', sort);
    sp.set('page', String(p));
    return `/admin/users?${sp.toString()}`;
  };
  return (
    <div className="flex items-center justify-center gap-3 mt-4 text-sm">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:border-primary/40">← Prev</Link>
      ) : (
        <span className="px-3 py-1.5 rounded-lg border border-border-light text-text-tertiary opacity-40">← Prev</span>
      )}
      <span className="text-text-tertiary">{page} / {totalPages}</span>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className="px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:border-primary/40">Next →</Link>
      ) : (
        <span className="px-3 py-1.5 rounded-lg border border-border-light text-text-tertiary opacity-40">Next →</span>
      )}
    </div>
  );
}
