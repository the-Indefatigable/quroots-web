import Link from 'next/link';
import { PathList } from '@/components/ramadan/PathPieces';
import { JUZ_AMMA, TARAWEEH, nightTitle } from '@/lib/ramadanPaths';

const last = TARAWEEH.nights[TARAWEEH.nights.length - 1];

export const metadata = {
  title: 'Understand Taraweeh: 30 nights, 10 roots a night',
  description: `Each night of Ramadan, learn the 10 Arabic roots that matter most in that night's juz. After 30 nights, ${TARAWEEH.roots} roots cover ${last.pctQuran}% of the Quran's root words. Free.`,
  alternates: { canonical: '/ramadan' },
};

export default function RamadanPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-12">
      <p className="font-arabic text-3xl mb-3" style={{ color: '#D4A246' }} dir="rtl" lang="ar">شَهْرُ رَمَضَانَ</p>
      <h1 className="font-heading leading-[1.06] mb-5" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', color: '#F0E8D8' }}>
        Understand what the imam recites tonight.
      </h1>
      <p className="text-lg leading-relaxed mb-2" style={{ color: '#B5B2AC' }}>
        Most masjids recite one juz a night in Taraweeh. Before you go, learn the 10 Arabic roots that matter most in tonight&apos;s juz.
        After 30 nights you know {TARAWEEH.roots} roots, the building blocks of {last.pctQuran}% of the Quran&apos;s root words.
      </p>
      <p className="text-sm mb-10" style={{ color: '#9A9893' }}>Ten minutes before Isha. Free for all of Ramadan, no account needed.</p>

      <PathList
        storeKey="taraweeh" base="/ramadan" unit="night" pctLabel="Of the Quran's root words you know so far"
        items={TARAWEEH.nights.map((n) => ({ n: n.night, title: nightTitle(n), sub: `${n.roots.length} roots · ${n.pctJuz}% of tonight's juz · ${n.pctQuran}% of the Quran`, pct: n.pctQuran }))}
      />

      <div className="mt-14 rounded-2xl p-6" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(212,162,70,.18)' }}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#D4A246' }}>Also free</p>
        <h2 className="font-heading text-2xl mt-2 mb-2" style={{ color: '#F0E8D8' }}>The surahs you pray with: Juz &apos;Amma in 30 days</h2>
        <p className="mb-4" style={{ color: '#B5B2AC' }}>
          {JUZ_AMMA.roots} roots, most common first, until you follow {JUZ_AMMA.days[JUZ_AMMA.days.length - 1].pctJuzAmma}% of the root words in An-Naba to An-Nas.
        </p>
        <Link href="/juz-amma" className="btn-primary inline-block">Open the Juz &apos;Amma path</Link>
      </div>
    </div>
  );
}
