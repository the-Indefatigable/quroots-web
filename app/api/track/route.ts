import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { growthEvents } from '@/db/schema';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { cookies } from 'next/headers';
import { unsign, LEARNER_COOKIE } from '@/lib/signed';

export const dynamic = 'force-dynamic';

const NAMES = new Set(['visit', 'path_view', 'day_open', 'day_complete', 'share', 'checkout_start']);
const short = (v: unknown, n = 40) => (typeof v === 'string' && v ? v.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, n) || null : null);

/**
 * Records one funnel step from src/lib/track.ts. Always answers 204 so a tracking problem can
 * never show up as an error to the visitor; anything malformed is dropped silently.
 */
export async function POST(request: NextRequest) {
  const none = new Response(null, { status: 204 });
  if (process.env.TRACK_OFF === '1') return none;   // local testing against the live database: don't count visits
  if (!rateLimit(clientKey(request, 'track'), 120, 60_000).ok) return none;
  try {
    const b = await request.json();
    if (!NAMES.has(b?.name) || typeof b.vid !== 'string' || !/^[0-9a-f-]{36}$/.test(b.vid)) return none;
    const day = Number.isInteger(b.day) && b.day >= 1 && b.day <= 30 ? b.day : null;
    const session = await auth().catch(() => null);
    await db.insert(growthEvents).values({
      name: b.name,
      visitorId: b.vid,
      // A browser that asked for reminders counts toward that account even when not signed in.
      userId: session?.user?.id ?? unsign('learner', cookies().get(LEARNER_COOKIE)?.value) ?? null,
      day,
      source: short(b.source),
      campaign: short(b.campaign),
      variant: short(b.variant),
      path: typeof b.path === 'string' ? b.path.slice(0, 120) : null,
    });
  } catch (err) {
    console.warn('[track] dropped event:', (err as Error).message);
  }
  return none;
}
