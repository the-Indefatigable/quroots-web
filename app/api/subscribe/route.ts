import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { users } from '@/db/schema';
import { rateLimit, clientKey, tooManyRequests } from '@/lib/rateLimit';
import { sendMail, SITE } from '@/lib/email';
import { confirmWeekly } from '@/lib/emails';
import { sign } from '@/lib/signed';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email().max(200),
  source: z.string().regex(/^[a-z0-9-]{1,40}$/).default('website'),
});

/**
 * POST: join the QuRoots email list without an account. The address is saved (find or create the
 * user) but NOTHING is switched on and no consent is recorded: a confirmation email goes out, and
 * only the button in it turns digest_opt_in on (double opt-in, see ./confirm).
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(clientKey(request, 'subscribe'), 5, 60_000);
  if (!limited.ok) return tooManyRequests(limited);
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  const address = parsed.data.email.trim().toLowerCase();

  const find = () => db.select({ id: users.id, on: users.digestOptIn, token: users.unsubscribeToken }).from(users).where(sql`lower(${users.email}) = ${address}`).limit(1);
  let [u] = await find();
  if (!u) {
    await db.insert(users).values({ email: address }).onConflictDoNothing();
    [u] = await find();
  }
  if (!u) return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });

  // Same answer whether or not they are already on the list, so this form cannot be used to find
  // out who is subscribed. Already-on people get no email.
  if (u.on) return NextResponse.json({ status: 'confirm' });

  // One confirmation email per address per 10 minutes, so nobody can use this form to flood a stranger.
  const perAddress = rateLimit(`subscribe-addr:${address}`, 1, 10 * 60_000);
  if (!perAddress.ok) return NextResponse.json({ status: 'confirm' });

  const t = sign('subscribe-confirm', `${u.id}|${parsed.data.source}|${Date.now()}`);
  const mail = confirmWeekly({ confirmUrl: `${SITE}/api/subscribe/confirm?t=${encodeURIComponent(t)}`, token: u.token });
  const sent = await sendMail({ to: address, subject: mail.subject, html: mail.html, token: u.token, list: 'weekly' });
  if (!sent.ok) {
    console.warn('[subscribe] confirmation not sent:', sent.error);
    return NextResponse.json({ status: 'error', error: 'We could not send the email. Please try again later.' }, { status: 502 });
  }
  return NextResponse.json({ status: 'confirm' });
}
