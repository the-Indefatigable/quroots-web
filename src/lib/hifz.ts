// Ayah references ("2:255", "2-123", "2:255-257") and hifz repeat plans: which ayahs, how many times each,
// how many rounds of the whole range, and a pause between repeats to recite back. A plan travels in the URL
// (/quran/2?from=255&to=257&each=3&times=5&gap=3) so a teacher can send it to a student.

/** Ayahs in each surah (Hafs), surah 1 first. Totals 6,236. */
export const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

export interface AyahRef { surah: number; from: number; to: number }

export interface RepeatPlan {
  from: number;
  to: number;
  /** times each ayah plays before moving on */
  each: number;
  /** rounds of the whole range; 0 = keep going until stopped */
  times: number;
  /** seconds of silence after each play, to recite back */
  gap: number;
}

export const EACH_OPTIONS = [1, 2, 3, 5, 7, 10] as const;
export const TIMES_OPTIONS = [1, 3, 5, 10, 0] as const;
export const GAP_OPTIONS = [0, 2, 5, 10] as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * "2:255", "2-123", "2.255", "2 255", "2:255-257", "2:255 to 257", "2-255-260".
 * The first number is the surah, the second the ayah, an optional third ends a range.
 * With `currentSurah`, a lone number or a range that cannot be "surah-ayah" ("255", "255-257",
 * "255 to 257") means ayahs of that surah.
 * Returns null for anything that is not a real ayah.
 */
export function parseAyahRef(input: string, currentSurah?: number): AyahRef | null {
  const s = input.trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+to\s+/g, '-');
  const check = (surah: number, from: number, to: number): AyahRef | null => {
    if (surah < 1 || surah > 114) return null;
    const n = AYAH_COUNTS[surah - 1];
    if (from < 1 || from > n) return null;
    return { surah, from, to: clamp(Math.max(to, from), from, n) };
  };
  // surah first, as people write it ("2-123" is surah 2, ayah 123)
  const m = s.match(/^(\d{1,3})\s*[:.\-\s]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/);
  const ref = m && check(+m[1], +m[2], m[3] ? +m[3] : +m[2]);
  if (ref) return ref;
  // otherwise, inside a surah, "255" or "255-257" are ayahs of that surah
  const a = currentSurah ? s.match(/^(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/) : null;
  return a ? check(currentSurah!, +a[1], a[2] ? +a[2] : +a[1]) : null;
}

/** A plan from a URL's query (?from=255&to=257&each=3&times=5&gap=3), checked against the surah's length. */
export function planFromQuery(q: URLSearchParams, surah: number): RepeatPlan | null {
  const n = AYAH_COUNTS[surah - 1];
  const from = parseInt(q.get('from') ?? q.get('ayah') ?? '', 10);
  if (!n || !Number.isFinite(from) || from < 1 || from > n) return null;
  const to = parseInt(q.get('to') ?? '', 10);
  const num = (k: string, d: number, hi: number) => {
    const v = parseInt(q.get(k) ?? '', 10);
    return Number.isFinite(v) ? clamp(v, 0, hi) : d;
  };
  return {
    from,
    to: Number.isFinite(to) ? clamp(Math.max(to, from), from, n) : from,
    each: Math.max(1, num('each', 1, 50)),
    times: num('times', 1, 100),
    gap: num('gap', 0, 30),
  };
}

export function planToQuery(p: RepeatPlan): string {
  const q = new URLSearchParams({ from: String(p.from) });
  if (p.to !== p.from) q.set('to', String(p.to));
  if (p.each !== 1) q.set('each', String(p.each));
  if (p.times !== 1) q.set('times', String(p.times));
  if (p.gap) q.set('gap', String(p.gap));
  return q.toString();
}

/** "2:255–257 · each ×3 · 5 rounds" */
export function planLabel(surah: number, p: RepeatPlan): string {
  const range = p.to === p.from ? `${surah}:${p.from}` : `${surah}:${p.from}–${p.to}`;
  const bits = [range];
  if (p.each > 1) bits.push(`each ×${p.each}`);
  bits.push(p.times === 0 ? 'on repeat' : p.times === 1 ? 'once' : `${p.times} rounds`);
  if (p.gap) bits.push(`${p.gap}s pause`);
  return bits.join(' · ');
}

/**
 * What to play after an ayah ends under a plan. `count` is how many times the current ayah has now
 * played (including this one), `round` the current round (1-based). Returns the next ayah and counters,
 * or null when the plan is finished.
 */
export function nextUnderPlan(p: RepeatPlan, ayah: number, count: number, round: number):
  { ayah: number; count: number; round: number } | null {
  if (count < p.each) return { ayah, count: count + 1, round };
  if (ayah < p.to) return { ayah: ayah + 1, count: 1, round };
  if (p.times === 0 || round < p.times) return { ayah: p.from, count: 1, round: round + 1 };
  return null;
}
