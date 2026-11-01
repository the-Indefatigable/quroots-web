/**
 * Build the two Ramadan paths from the Quranic Arabic Corpus and the database (read-only).
 *
 *   Taraweeh nights   30 nights, one juz a night as most masjids recite it. Each night teaches the 10 roots
 *                     that cover the most of that night's juz and were not taught on an earlier night, so by
 *                     night 30 the 300 roots learned cover most of the Quran's root words.
 *   Juz 'Amma         30 days through surahs 78–114, the short surahs most people pray with. Ten roots a day,
 *                     most frequent first, on days 1–29; day 30 is a review.
 *
 * Roots come from the corpus (as in scripts/extract-qac-salah.py); the database supplies the text, glosses,
 * juz numbers, surah names and root meanings. Writes src/data/taraweehPath.json and src/data/juzAmmaPath.json.
 *
 * Run: node scripts/build-ramadan-paths.mjs path/to/quran-morphology.txt
 *   (quran-morphology.txt: github.com/mustafa0x/quran-morphology, Quranic Arabic Corpus v0.4, GPL v3)
 */
import fs from 'fs';
import postgres from 'postgres';

const envFile = fs.readFileSync('.env.local', 'utf8');
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const PER_DAY = 10, EXAMPLES = 3;
// Meanings for roots the roots table has no (or no suitable) meaning for, keyed by normalised root.
const MEANINGS = {
  'اله': 'Allah, God (the root of Allah and ilāh)', 'ربب': 'Lord; to nurture and sustain', 'سمو': 'name; to be high',
  'يوم': 'day', 'صرط': 'path, way', 'احد': 'one, single', 'ذات': 'possessor of, having', 'مرا': 'person; woman, wife',
  'ايي': 'which; O (in calling out)', 'يدي': 'hand', 'ابو': 'father', 'مول': 'wealth, property', 'نور': 'light; fire',
  'عند': 'with, near, at (of place or time)', 'كلل': 'all, every', 'سبل': 'way, path, road', 'ارض': 'earth, land',
  'اهل': 'people, family, household', 'بعض': 'some, part of', 'قري': 'town, city', 'امم': 'mother; nation, community',
  'سبع': 'seven', 'دون': 'besides, other than; below', 'ليل': 'night', 'عصو': 'staff, stick', 'ندي': 'to call out, to summon',
  'موه': 'water', 'سوع': 'the Hour; a time', 'نسو': 'women, wives', 'وحد': 'one, alone', 'حين': 'time, while, period',
  'جحم': 'blazing fire, Hellfire', 'ثوي': 'to dwell; abode, lodging', 'قوي': 'strength, power', 'انث': 'female',
  'تحت': 'under, beneath', 'كيف': 'how', 'فوج': 'group, crowd', 'عنب': 'grapes, vine', 'ودي': 'valley',
  'زيت': 'olive, olive oil', 'شمس': 'sun', 'قمر': 'moon', 'نصو': 'forelock', 'نصي': 'forelock',
};
const norm = (r) => r.replace(/\s+/g, '').replace(/[أإآ]/g, 'ا').replace(/[ؤئ]/g, 'ء');

// corpus: one root per word (a word with several segments counts once)
const qac = new Map();
for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  if (!line) continue;
  const [loc, , , feat] = line.split('\t');
  const [s, a, w] = loc.split(':').map(Number);
  const m = feat?.match(/ROOT:([^|]+)/);
  const key = `${s}:${a}:${w}`;
  if (m && !qac.has(key)) qac.set(key, norm(m[1]));
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  await sql`set default_transaction_read_only = on`;
  const words = (await sql`
    select w.surah_number s, w.ayah_number a, w.position p, w.text_uthmani ar, w.translation en, y.juz_number juz
    from quran_words w join ayahs y on y.surah_number = w.surah_number and y.ayah_number = w.ayah_number
    where w.char_type = 'word' order by w.surah_number, w.ayah_number, w.position`)
    .map((w) => ({ ...w, root: qac.get(`${w.s}:${w.a}:${w.p}`) ?? null }));
  const names = new Map((await sql`select number, english_name from surahs`).map((r) => [r.number, r.english_name]));
  const meta = new Map((await sql`select root, meaning from roots`).map((r) => [norm(r.root), r]));

  const rooted = words.filter((w) => w.root);
  const quranCount = new Map();
  for (const w of rooted) quranCount.set(w.root, (quranCount.get(w.root) ?? 0) + 1);
  const pct = (ws, learned) => { const r = ws.filter((w) => w.root); return r.length ? Math.round((100 * r.filter((w) => learned.has(w.root)).length) / r.length) : 0; };
  const card = (root, from) => {
    const m = meta.get(root) ?? {};
    const forms = [];
    for (const w of from) if (w.root === root && !forms.some((f) => f.ar === w.ar) && forms.length < EXAMPLES) forms.push({ ar: w.ar, en: w.en, ref: `${w.s}:${w.a}` });
    return { root: m.root ?? root, letters: [...root].join(' '), meaning: MEANINGS[root] || m.meaning || '', quranCount: quranCount.get(root) ?? 0, words: forms };
  };
  const ranked = (ws, skip) => {
    const c = new Map();
    for (const w of ws) if (w.root && !skip.has(w.root)) c.set(w.root, (c.get(w.root) ?? 0) + 1);
    return [...c.entries()].sort((x, y) => y[1] - x[1]).map(([r, n]) => ({ r, n }));
  };

  // ── Taraweeh nights ────────────────────────────────────────────────────────
  const learned = new Set(), nights = [];
  for (let j = 1; j <= 30; j++) {
    const juz = words.filter((w) => w.juz === j);
    const pick = ranked(juz, learned).slice(0, PER_DAY);
    pick.forEach(({ r }) => learned.add(r));
    const first = juz[0], last = juz[juz.length - 1];
    nights.push({
      night: j, juz: j,
      start: { surah: first.s, ayah: first.a, surahName: names.get(first.s) },
      end: { surah: last.s, ayah: last.a, surahName: names.get(last.s) },
      roots: pick.map(({ r, n }) => ({ ...card(r, juz), inJuz: n })),
      pctJuz: pct(juz, learned), pctQuran: pct(words, learned),
    });
  }
  const tara = { generated: new Date().toISOString().slice(0, 10), perNight: PER_DAY, roots: learned.size, nights };

  // ── Juz 'Amma ──────────────────────────────────────────────────────────────
  const amma = words.filter((w) => w.s >= 78);
  const order = ranked(amma, new Set());
  const known = new Set(), days = [], surahNums = [...new Set(amma.map((w) => w.s))];
  const surahPct = (s, set) => pct(amma.filter((w) => w.s === s), set);
  for (let d = 1; d <= 30; d++) {
    const before = new Map(surahNums.map((s) => [s, surahPct(s, known)]));
    const pick = d === 30 ? [] : order.slice((d - 1) * PER_DAY, d * PER_DAY);
    pick.forEach(({ r }) => known.add(r));
    // surahs that crossed 75% understood today: what this day lets you follow
    const crossed = surahNums.filter((s) => before.get(s) < 75 && surahPct(s, known) >= 75).map((s) => ({ number: s, name: names.get(s) }));
    days.push({
      day: d, title: d === 30 ? "Review: all of Juz 'Amma" : crossed.length ? `Now follow ${crossed.slice(0, 2).map((x) => x.name).join(' and ')}` : `Ten more roots of Juz 'Amma`,
      roots: pick.map(({ r, n }) => ({ ...card(r, amma), inJuzAmma: n })), newlyFollowed: crossed, pctJuzAmma: pct(amma, known),
    });
  }
  const surahs = surahNums.map((s) => ({ number: s, name: names.get(s), pctEnd: surahPct(s, known) }));
  const ja = { generated: tara.generated, perDay: PER_DAY, roots: known.size, totalRoots: order.length, surahs, days };

  fs.mkdirSync('src/data', { recursive: true });
  fs.writeFileSync('src/data/taraweehPath.json', JSON.stringify(tara, null, 1));
  fs.writeFileSync('src/data/juzAmmaPath.json', JSON.stringify(ja, null, 1));
  console.log(`taraweeh: ${tara.roots} roots`);
  for (const n of nights) console.log(` night ${String(n.night).padStart(2)} ${n.start.surahName} ${n.start.surah}:${n.start.ayah}  juz ${n.pctJuz}%  quran ${n.pctQuran}%  missing meanings ${n.roots.filter((r) => !r.meaning).length}`);
  console.log(`juz 'amma: ${ja.roots} of ${ja.totalRoots} roots`);
  for (const d of days) console.log(` day ${String(d.day).padStart(2)} ${d.pctJuzAmma}%  ${d.title}  missing ${d.roots.filter((r) => !r.meaning).length}`);
} finally {
  await sql.end();
}
