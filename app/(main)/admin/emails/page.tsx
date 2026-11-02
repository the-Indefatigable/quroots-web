import { sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/adminGuard';
import { db, dbQuery } from '@/db';
import { BroadcastForm } from '@/components/admin/BroadcastForm';

export const dynamic = 'force-dynamic';

export default async function AdminEmailsPage() {
  // The layout's check does not stop this page from rendering (and sending its data), so check here too.
  await requireAdmin();
  const [c] = (await dbQuery(() => db.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE digest_opt_in)::int AS weekly,
           count(*) FILTER (WHERE reminders_opt_in)::int AS reminders
    FROM users WHERE email IS NOT NULL
  `))) as unknown as { total: number; weekly: number; reminders: number }[];

  const card = 'rounded-2xl border border-border p-4';
  return (
    <div className="space-y-8 max-w-2xl">
      <section>
        <h2 className="text-xl font-heading mb-3 text-text">Your email list</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className={card}><div className="text-2xl font-semibold text-text">{c.total}</div><div className="text-xs text-text-tertiary mt-1">all accounts</div></div>
          <div className={card}><div className="text-2xl font-semibold text-text">{c.weekly}</div><div className="text-xs text-text-tertiary mt-1">said yes to the Friday email</div></div>
          <div className={card}><div className="text-2xl font-semibold text-text">{c.reminders}</div><div className="text-xs text-text-tertiary mt-1">said yes to reminders</div></div>
        </div>
        <p className="text-sm text-text-secondary mt-4">
          Download as a spreadsheet (CSV):{' '}
          <a className="underline underline-offset-2" href="/api/admin/emails?list=weekly">Friday email list</a>{' · '}
          <a className="underline underline-offset-2" href="/api/admin/emails?list=reminders">reminders list</a>{' · '}
          <a className="underline underline-offset-2" href="/api/admin/emails?list=all">everyone (for your records only)</a>
        </p>
        <p className="text-xs text-text-tertiary mt-2">
          Only people who said yes (the first two lists) can be emailed in bulk. Canada&rsquo;s CASL requires it, and their yes is saved with the date and where they gave it. People you meet in person are not on this list until they sign up themselves.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-heading mb-3 text-text">Send a note to the Friday email list</h2>
        <BroadcastForm count={c.weekly} />
      </section>
    </div>
  );
}
