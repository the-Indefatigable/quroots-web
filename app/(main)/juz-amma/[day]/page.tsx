import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RootLesson } from '@/components/ramadan/PathPieces';
import { JUZ_AMMA } from '@/lib/ramadanPaths';

export const dynamicParams = false;
export function generateStaticParams() {
  return JUZ_AMMA.days.map((d) => ({ day: String(d.day) }));
}
export function generateMetadata({ params }: { params: { day: string } }) {
  const d = JUZ_AMMA.days.find((x) => x.day === Number(params.day));
  return d ? { title: `Juz 'Amma day ${d.day}: ${d.title}` } : {};
}

export default function AmmaDayPage({ params }: { params: { day: string } }) {
  const d = JUZ_AMMA.days.find((x) => x.day === Number(params.day));
  if (!d) notFound();
  const review = d.roots.length === 0;
  const extra = review ? (
    <div className="grid gap-2 mb-10">
      {JUZ_AMMA.surahs.map((s) => (
        <Link key={s.number} href={`/quran/${s.number}`} className="flex items-center justify-between rounded-xl px-4 py-3 hover:bg-white/[0.04]"
          style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
          <span style={{ color: '#EDEDEC' }}>{s.number}. {s.name}</span>
          <span className="text-sm tabular-nums" style={{ color: '#D4A246' }}>{s.pctEnd}%</span>
        </Link>
      ))}
    </div>
  ) : d.newlyFollowed.length ? (
    <p className="mb-8 text-[15px]" style={{ color: '#B5B2AC' }}>
      With today&apos;s roots you follow most of{' '}
      {d.newlyFollowed.map((s, i) => (
        <span key={s.number}>{i ? ' and ' : ''}<Link href={`/quran/${s.number}`} style={{ color: '#D4A246' }}>{s.name}</Link></span>
      ))}. Read it now and see.
    </p>
  ) : null;
  return (
    <RootLesson
      storeKey="juzamma" base="/juz-amma" unit="day" n={d.day} total={JUZ_AMMA.days.length}
      kicker={`Juz 'Amma · day ${d.day}`} title={d.title}
      intro={review
        ? "Every surah of Juz 'Amma, with how much of its root words you now follow. Read one you love, word by word."
        : "Ten roots, most common first. Each shows how often it comes in Juz 'Amma and in the whole Quran, with words from these surahs that grow from it."}
      roots={d.roots} hereLabel="in Juz 'Amma" pct={d.pctJuzAmma}
      pctLabel="of Juz 'Amma's root words you now follow"
      extra={extra}
    />
  );
}
