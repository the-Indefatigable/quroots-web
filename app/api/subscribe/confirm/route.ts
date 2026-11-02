import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { recordConsent, SITE } from '@/lib/email';
import { unsign } from '@/lib/signed';

export const dynamic = 'force-dynamic';

const WEEK = 7 * 24 * 60 * 60 * 1000;

// GET ?t=…: the button in the confirmation email. Turns the Friday email on and writes the
// consent (with where they signed up) to email_consents.
export async function GET(request: NextRequest) {
  const raw = unsign('subscribe-confirm', request.nextUrl.searchParams.get('t'));
  const [userId, source, at] = raw?.split('|') ?? [];
  if (!userId || Date.now() - Number(at) > WEEK) return NextResponse.redirect(`${SITE}/?subscribed=expired`);

  const [u] = await db.select({ on: users.digestOptIn }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return NextResponse.redirect(`${SITE}/?subscribed=expired`);
  // The link can be tapped twice; only the first tap changes anything or writes a consent row.
  if (!u.on) {
    await db.update(users).set({ digestOptIn: true, updatedAt: new Date() }).where(eq(users.id, userId));
    await recordConsent(userId, 'weekly', true, `email-confirmation (signed up on ${source})`);
  }
  return NextResponse.redirect(`${SITE}/?subscribed=on`);
}
