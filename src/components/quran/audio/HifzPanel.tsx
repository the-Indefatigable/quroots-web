'use client';

// Hifz repeat: pick a range, how many times each ayah plays, how many rounds of the range, and a pause to
// recite back. The plan itself is played by AudioPlayer (nextUnderPlan in lib/hifz).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { G } from './playerTokens';
import { EACH_OPTIONS, GAP_OPTIONS, TIMES_OPTIONS, planLabel, planToQuery, type RepeatPlan } from '@/lib/hifz';

interface Props {
  surahNumber: number;
  totalAyahs: number;
  currentAyah: number;
  plan: RepeatPlan | null;
  onStart: (plan: RepeatPlan) => void;
  onStop: () => void;
  onClose: () => void;
}

function Chips<T extends number>({ label, options, value, onChange, show }: {
  label: string; options: readonly T[]; value: T; onChange: (v: T) => void; show: (v: T) => string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] uppercase tracking-wider" style={{ color: G.textTert }}>{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={o === value}
            className="min-w-[44px] h-9 px-3 rounded-full text-[14px] font-medium tabular-nums transition-colors"
            style={o === value
              ? { background: 'rgba(212,162,70,0.16)', color: G.gold, border: `1px solid rgba(212,162,70,0.45)` }
              : { background: G.surface, color: G.textSecond, border: `1px solid ${G.border}` }}
          >
            {show(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HifzPanel({ surahNumber, totalAyahs, currentAyah, plan, onStart, onStop, onClose }: Props) {
  const start = plan?.from ?? Math.max(1, currentAyah || 1);
  const [from, setFrom] = useState(String(start));
  const [to, setTo] = useState(String(plan?.to ?? start));
  const [each, setEach] = useState<number>(plan?.each ?? 3);
  const [times, setTimes] = useState<number>(plan?.times ?? 0);
  const [gap, setGap] = useState<number>(plan?.gap ?? 0);
  const [copied, setCopied] = useState(false);

  const f = Math.min(totalAyahs, Math.max(1, parseInt(from, 10) || 1));
  const t = Math.min(totalAyahs, Math.max(f, parseInt(to, 10) || f));
  const draft: RepeatPlan = { from: f, to: t, each, times, gap };

  async function copyLink() {
    const url = `${window.location.origin}/quran/${surahNumber}?${planToQuery(draft)}`;
    try {
      if (navigator.share) { await navigator.share({ url, title: `Hifz ${planLabel(surahNumber, draft)}` }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* share sheet closed, or no clipboard */ }
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void) => (
    <label htmlFor={id} className="flex-1 space-y-1.5">
      <span className="block text-[12px] uppercase tracking-wider" style={{ color: G.textTert }}>{label}</span>
      <input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 3))}
        className="w-full h-11 px-3 rounded-xl text-[16px] tabular-nums outline-none"
        style={{ background: G.surface, color: G.textPrimary, border: `1px solid ${G.border}` }}
      />
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Hifz repeat">
      <button type="button" aria-label="Close" className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-5"
        style={{ background: '#16130F', border: `1px solid ${G.goldBorder}`, boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[18px] font-heading" style={{ color: G.textPrimary }}>Hifz repeat</p>
            <p className="text-[13px] mt-0.5 tabular-nums" style={{ color: G.gold }}>{planLabel(surahNumber, draft)}</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 -mr-1 flex items-center justify-center rounded-full" style={{ color: G.textTert }} aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex gap-3">
          {field('hifz-from', 'From ayah', from, setFrom)}
          {field('hifz-to', `To ayah (of ${totalAyahs})`, to, setTo)}
        </div>
        <Chips label="Repeat each ayah" options={EACH_OPTIONS} value={each as typeof EACH_OPTIONS[number]} onChange={setEach} show={(v) => `${v}×`} />
        <Chips label="Repeat the whole range" options={TIMES_OPTIONS} value={times as typeof TIMES_OPTIONS[number]} onChange={setTimes} show={(v) => (v === 0 ? '∞' : `${v}×`)} />
        <Chips label="Pause after each, to recite back" options={GAP_OPTIONS} value={gap as typeof GAP_OPTIONS[number]} onChange={setGap} show={(v) => (v === 0 ? 'Off' : `${v}s`)} />

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onStart(draft)}
            className="flex-1 h-12 rounded-full text-[15px] font-semibold"
            style={{ background: `radial-gradient(circle at 30% 30%, #E8B85C, ${G.gold} 70%)`, color: '#1A1310' }}
          >
            {plan ? 'Restart repeat' : 'Start repeat'}
          </button>
          <button type="button" onClick={copyLink} className="h-12 px-4 rounded-full text-[14px] font-medium" style={{ background: G.surface, color: G.textSecond, border: `1px solid ${G.border}` }}>
            {copied ? 'Link copied' : 'Share'}
          </button>
        </div>
        {plan && (
          <button type="button" onClick={onStop} className="w-full text-[13px] underline underline-offset-4" style={{ color: G.textTert }}>
            Stop repeating, play normally
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
