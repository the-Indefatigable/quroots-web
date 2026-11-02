import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db, dbQuery } from '@/db';

export const dynamic = 'force-dynamic';

type Row = { email: string; name: string | null; created_at: string | null; digest_opt_in: boolean; reminders_opt_in: boolean; source: string | null };

const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  // A cell that starts with = + - @ can run as a formula when the file is opened in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

// GET /api/admin/emails?list=weekly|reminders|all  (admin only) → emails.csv
//   weekly    people who said yes to the Friday email (the list /admin/emails can send to)
//   reminders people who said yes to lesson reminders
//   all       every account email with both flags, for your own records (do NOT mass-mail this one)
export async function GET(request: NextRequest) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id || session.user.role !== 'admin') return NextResponse.json({ error: 'Admins only.' }, { status: 403 });

  const asked = request.nextUrl.searchParams.get('list');
  const list = asked === 'reminders' || asked === 'all' ? asked : 'weekly'; // anything else is the Friday list, never everyone
  const extra = list === 'weekly' ? sql`AND u.digest_opt_in` : list === 'reminders' ? sql`AND u.reminders_opt_in` : sql``;
  const rows = (await dbQuery(() => db.execute(sql`
    SELECT u.email, u.name, u.created_at, u.digest_opt_in, u.reminders_opt_in,
           (SELECT c.source FROM email_consents c WHERE c.user_id = u.id AND c.granted ORDER BY c.created_at DESC LIMIT 1) AS source
    FROM users u
    WHERE u.email IS NOT NULL ${extra}
    ORDER BY u.created_at DESC NULLS LAST
  `))) as unknown as Row[];

  const head = ['email', 'name', 'joined', 'friday_email', 'reminders', 'consent_source'];
  const lines = rows.map((r) => [r.email, r.name, r.created_at, r.digest_opt_in ? 'yes' : 'no', r.reminders_opt_in ? 'yes' : 'no', r.source].map(csvCell).join(','));
  return new NextResponse([head.join(','), ...lines].join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="quroots-emails-${list}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
