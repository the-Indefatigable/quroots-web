import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://quroots.com',
  'https://www.quroots.com',
  'http://localhost:3000',
  'http://localhost:3001',
];

// Bulk scrapers, dataset crawlers and scripted HTTP clients. Search engines and the
// AI answer engines that cite and link back (Googlebot, Bingbot, OAI-SearchBot,
// ChatGPT-User, PerplexityBot) are not on this list.
const BLOCKED_AGENTS = new RegExp(
  [
    'Bytespider', 'CCBot', 'GPTBot', 'anthropic-ai', 'ClaudeBot', 'Claude-Web', 'meta-externalagent',
    'FacebookBot', 'Diffbot', 'ImagesiftBot', 'Omgili', 'PetalBot', 'Amazonbot', 'cohere-ai',
    'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'DataForSeoBot', 'BLEXBot', 'serpstatbot',
    'Scrapy', 'python-requests', 'python-urllib', 'aiohttp', 'httpx', 'Go-http-client', 'okhttp',
    'node-fetch', 'axios', 'undici', 'Java/', 'libwww-perl', 'Wget', 'curl/', 'colly', 'HeadlessChrome',
    'PhantomJS', 'Puppeteer', 'Playwright',
  ].map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|'),
  'i',
);
const SEARCH_ENGINES = /Googlebot|bingbot|DuckDuckBot|Applebot|YandexBot|OAI-SearchBot|ChatGPT-User|PerplexityBot/i;

// Per-IP sliding window. Edge instances do not share memory, so this stops a single
// address hammering one region; the Vercel Firewall rate-limit rule covers the rest.
const WINDOW_MS = 60_000;
// A spoofed crawler user agent must not buy a bigger allowance, so crawlers get the page limit.
// Client-side navigations and link prefetches (RSC requests) fire several per click, so they
// get their own, larger allowance instead of eating into the page limit.
const LIMITS = { api: 60, page: 90, rsc: 400, bot: 90 };
const hits = new Map<string, number[]>();

function overLimit(key: string, limit: number, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
  }
  return recent.length > limit;
}

function clientIp(request: NextRequest): string {
  return request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

// Page pass: every page view sets a signed, HttpOnly cookie, and the data APIs only answer
// requests that carry one. A script calling /api/quran/2 cold gets a 403; it has to load real
// pages first, which keeps it inside the page rate limit.
const PASS_COOKIE = 'qr_p';
const PASS_TTL_MS = 6 * 60 * 60 * 1000;
const PASS_RENEW_MS = 60 * 60 * 1000;
// Routes that must work without a page first: sign-in, Stripe and Vercel cron calls, email links.
const OPEN_API = /^\/api\/(auth|cron|webhooks|digest\/unsubscribe|salah\/remind\/confirm|subscribe\/confirm|og)(\/|$)/;
let passKey: Promise<CryptoKey> | null = null;

function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.PASS_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'dev-only-pass-secret';
  passKey ??= crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return passKey;
}

async function signPass(issued: number, ua: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(`${issued}|${ua}`));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

// Age of a valid pass in ms, or null when it is missing, forged, expired or from another browser.
async function passAge(request: NextRequest, ua: string, now: number): Promise<number | null> {
  const [ts, sig] = (request.cookies.get(PASS_COOKIE)?.value ?? '').split('.');
  const issued = Number(ts);
  if (!issued || !sig || now - issued > PASS_TTL_MS || issued > now + 60_000) return null;
  return sig === (await signPass(issued, ua)) ? now - issued : null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');
  const isAuth = pathname.startsWith('/api/auth');
  const isCron = pathname.startsWith('/api/cron') || pathname.startsWith('/api/webhooks');
  const ua = request.headers.get('user-agent') ?? '';

  if (!isCron) {
    if (!ua || BLOCKED_AGENTS.test(ua)) {
      return new NextResponse('Automated access is not permitted. See https://quroots.com/terms', { status: 403 });
    }
    const isRsc = request.headers.has('rsc') || request.headers.has('next-router-prefetch');
    const bucket = SEARCH_ENGINES.test(ua) ? 'bot' : isApi ? 'api' : isRsc ? 'rsc' : 'page';
    if (overLimit(`${clientIp(request)}:${bucket}`, LIMITS[bucket], Date.now())) {
      return new NextResponse('Too many requests. Please slow down.', { status: 429, headers: { 'Retry-After': '60' } });
    }
  }

  if (!isApi) {
    const response = NextResponse.next();
    const now = Date.now(), age = await passAge(request, ua, now);
    if (age === null || age > PASS_RENEW_MS) {
      response.cookies.set(PASS_COOKIE, `${now}.${await signPass(now, ua)}`, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: PASS_TTL_MS / 1000,
      });
    }
    return response;
  }
  if (isAuth) return NextResponse.next();

  if (!OPEN_API.test(pathname) && request.method !== 'OPTIONS') {
    // Browsers label every fetch; another site's page calling our API says cross-site.
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (await passAge(request, ua, Date.now())) === null) {
      return NextResponse.json({ error: 'Open quroots.com to use this.' }, { status: 403 });
    }
  }

  const origin = request.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Add CORS headers to API responses
  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  return response;
}

export const config = {
  // Every page and API route; static files, images and the robots/sitemap/llms files stay open.
  matcher: ['/((?!_next/static|_next/image|favicon|icons|images|fonts|audio|robots.txt|sitemap.xml|llms.txt|manifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mp3|woff2?|css|js)$).*)'],
};
