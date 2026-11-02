import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db, dbQuery } from '@/db';
import { users } from '@/db/schema';
import { sendMail } from '@/lib/email';
import { broadcast } from '@/lib/emails';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Resend allows about 2 sends a second; this keeps a request inside 60s. Bigger lists take
// several rounds (the page loops on `next`).
const BATCH = 60;
const GAP_MS = 550;

const Body = z.object({
  mode: z.enum(['count', 'test', 'send']),
  subject: z.string().trim().min(3).max(150).optional(),
  text: z.string().trim().min(10).max(8000).optional(),
  /** For 'send': how many people the admin saw and agreed to. Refuses if the list changed. */
  expect: z.number().int().min(1).optional(),
  from: z.number().int().min(0).default(0),
});

/**
 * POST (admin only): a note to everyone who said yes to the Friday email (digest_opt_in).
 *   count  how many people would get it
 *   test   send only to the signed-in admin, to check how it looks
 *   send   send to the list, BATCH people per request, starting at `from`; returns `next` until done
 * Each email carries the one-click unsubscribe headers and footer links (see email.ts).
 */
export async function POST(request: NextRequest) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id || session.user.role !== 'admin') return NextResponse.json({ error: 'Admins only.' }, { status: 403 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the subject and message.' }, { status: 400 });
  const { mode, subject, text, expect, from } = parsed.data;

  const list = await dbQuery(() => db.select({ id: users.id, email: users.email, name: users.name, token: users.unsubscribeToken })
    .from(users).where(eq(users.digestOptIn, true)).orderBy(asc(users.createdAt), asc(users.id)));
  if (mode === 'count') return NextResponse.json({ count: list.length });
  if (!subject || !text) return NextResponse.json({ error: 'Add a subject and a message.' }, { status: 400 });

  const first = (n: string | null) => (n ?? 'friend').split(' ')[0] || 'friend';

  if (mode === 'test') {
    const [me] = await db.select({ email: users.email, name: users.name, token: users.unsubscribeToken }).from(users).where(eq(users.id, session.user.id)).limit(1);
    if (!me?.email) return NextResponse.json({ error: 'Your account has no email.' }, { status: 400 });
    const sent = await sendMail({ to: me.email, subject: `[TEST] ${subject}`, html: broadcast({ firstName: first(me.name), text, token: me.token }).html, token: me.token, list: 'weekly' });
    return sent.ok ? NextResponse.json({ sent: 1, to: me.email }) : NextResponse.json({ error: sent.error }, { status: 502 });
  }

  if (expect !== list.length) return NextResponse.json({ error: `The list changed (${list.length} now). Check the count and try again.` }, { status: 409 });
  const slice = list.slice(from, from + BATCH);
  let sent = 0;
  const failed: string[] = [];
  for (const s of slice) {
    const r = await sendMail({ to: s.email, subject, html: broadcast({ firstName: first(s.name), text, token: s.token }).html, token: s.token, list: 'weekly' });
    if (r.ok) sent++; else failed.push(s.email);
    await new Promise((res) => setTimeout(res, GAP_MS));
  }
  const nextFrom = from + slice.length;
  return NextResponse.json({ sent, failed, next: nextFrom < list.length ? nextFrom : null, total: list.length });
}
