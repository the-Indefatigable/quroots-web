import { PathList } from '@/components/ramadan/PathPieces';
import { JUZ_AMMA } from '@/lib/ramadanPaths';

const end = JUZ_AMMA.days[JUZ_AMMA.days.length - 1].pctJuzAmma;

export const metadata = {
  title: "Juz 'Amma in 30 days: understand the surahs you pray with",
  description: `Learn ${JUZ_AMMA.roots} Arabic roots, ten a day, most common first, until you follow ${end}% of the root words in An-Naba to An-Nas. Free.`,
  alternates: { canonical: '/juz-amma' },
};

export default function JuzAmmaPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-12">
      <p className="font-arabic text-3xl mb-3" style={{ color: '#D4A246' }} dir="rtl" lang="ar">عَمَّ يَتَسَاءَلُونَ</p>
      <h1 className="font-heading leading-[1.06] mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', color: '#F0E8D8' }}>
        Understand the surahs you pray with.
      </h1>
      <p className="text-lg leading-relaxed mb-2" style={{ color: '#B5B2AC' }}>
        Juz &apos;Amma, An-Naba to An-Nas, is built from {JUZ_AMMA.totalRoots} Arabic roots. Learn the {JUZ_AMMA.roots} most common, ten a day,
        and by day 30 you follow {end}% of its root words. Each day tells you which surahs you can now follow.
      </p>
      <p className="text-sm mb-10" style={{ color: '#9A9893' }}>Free, no account needed.</p>
      <PathList
        storeKey="juzamma" base="/juz-amma" unit="day" pctLabel="Of Juz 'Amma's root words you know so far"
        items={JUZ_AMMA.days.map((d) => ({ n: d.day, title: d.title, sub: `${d.roots.length ? `${d.roots.length} roots · ` : ''}${d.pctJuzAmma}% of Juz 'Amma`, pct: d.pctJuzAmma }))}
      />
    </div>
  );
}
