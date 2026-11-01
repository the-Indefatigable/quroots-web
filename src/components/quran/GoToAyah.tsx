'use client';

// "Go to ayah": type 2:255, 2-123 or 2:255-257 and it plays there. Inside a surah, a plain "255" or "255-257"
// means that surah. Another surah opens its page with the range in the address (lib/hifz planToQuery).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseAyahRef, planToQuery, type AyahRef } from '@/lib/hifz';

export function GoToAyah({ currentSurah, onLocal, className = '' }: {
  currentSurah?: number;
  /** play a range in the surah already open, instead of navigating */
  onLocal?: (ref: AyahRef) => void;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [bad, setBad] = useState(false);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const ref = parseAyahRef(value, currentSurah);
    if (!ref) { setBad(true); return; }
    setBad(false);
    if (onLocal && ref.surah === currentSurah) { onLocal(ref); return; }
    router.push(`/quran/${ref.surah}?${planToQuery({ from: ref.from, to: ref.to, each: 1, times: 1, gap: 0 })}`);
  }

  return (
    <form onSubmit={go} className={`relative ${className}`} role="search" aria-label="Go to an ayah">
      <div
        className="flex items-center gap-2 h-10 pl-3 pr-1 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bad ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}` }}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="#A3A19C" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
        </svg>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setBad(false); }}
          inputMode="text"
          placeholder={currentSurah ? `Play ayah: ${currentSurah}:5 or 5-10` : 'Play ayah: 2:255 or 2:255-257'}
          aria-label="Ayah to play, like 2:255 or 2:255-257"
          aria-invalid={bad}
          className="flex-1 min-w-0 bg-transparent outline-none text-[16px] sm:text-sm text-[#EDEDEC] placeholder:text-[#6B6966]"
        />
        <button type="submit" className="h-8 px-3 rounded-lg text-xs font-semibold" style={{ background: 'rgba(212,162,70,0.14)', color: '#D4A246' }}>
          Play
        </button>
      </div>
      {bad && <p className="absolute left-0 top-full mt-1 text-xs" style={{ color: '#F87171' }}>Try a surah and ayah, like 2:255 or 36:1-12.</p>}
    </form>
  );
}
