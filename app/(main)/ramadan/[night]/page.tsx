import { notFound } from 'next/navigation';
import { RootLesson } from '@/components/ramadan/PathPieces';
import { TARAWEEH, nightTitle } from '@/lib/ramadanPaths';

export const dynamicParams = false;
export function generateStaticParams() {
  return TARAWEEH.nights.map((n) => ({ night: String(n.night) }));
}
export function generateMetadata({ params }: { params: { night: string } }) {
  const n = TARAWEEH.nights.find((x) => x.night === Number(params.night));
  return n ? { title: `Night ${n.night} of Taraweeh: ${nightTitle(n)}`, description: `The 10 roots that matter most in juz ${n.juz}, with examples from tonight's recitation.` } : {};
}

export default function NightPage({ params }: { params: { night: string } }) {
  const n = TARAWEEH.nights.find((x) => x.night === Number(params.night));
  if (!n) notFound();
  return (
    <RootLesson
      storeKey="taraweeh" base="/ramadan" unit="night" n={n.night} total={TARAWEEH.nights.length}
      kicker={`Night ${n.night} of Ramadan · Juz ${n.juz}`}
      title={`${n.start.surahName} ${n.start.surah}:${n.start.ayah} to ${n.end.surahName} ${n.end.surah}:${n.end.ayah}`}
      intro={`Tonight's juz, in ${n.roots.length} roots. Each shows how often it comes tonight and in the whole Quran, with words from tonight's recitation that grow from it. Tap a word to hear it in place.`}
      roots={n.roots} hereLabel="tonight" pct={n.pctJuz}
      pctLabel={`of tonight's root words you'll recognise, with every root from nights 1–${n.night}`}
      listen={{ href: `/quran/${n.start.surah}?from=${n.start.ayah}`, label: "Listen to tonight's juz" }}
    />
  );
}
