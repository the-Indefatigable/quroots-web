'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ACCURACY_NOTICE } from '@/components/ui/SiteFooter';
import { EmailSignup } from '@/components/ui/EmailSignup';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { RootBloom } from './RootBloom';
import { SupportPrompt } from '@/components/support/SupportPrompt';
import { TOTAL_ROOTS, TOTAL_AYAHS, TOTAL_WORD_TOKENS, fmt } from '@/lib/corpusStats';

// ── Scroll-reveal via IntersectionObserver ──────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const groups = document.querySelectorAll('[data-reveal-group]');
    const observers: IntersectionObserver[] = [];
    groups.forEach((group) => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            group.querySelectorAll<HTMLElement>('.reveal').forEach((el) => {
              el.classList.add('revealed');
            });
            observer.disconnect();
          }
        },
        { rootMargin: '-60px 0px', threshold: 0 }
      );
      observer.observe(group);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);
}

// ── Animated counter ────────────────────────────────────────────────

// ── Interactive Demo Data ────────────────────────────────────────────
const DEMO_AYAH = {
  reference: 'Al-Fatiha 1:2',
  surahLink: '/quran/1',
  words: [
    { arabic: '\u0671\u0644\u0652\u062D\u064E\u0645\u0652\u062F\u064F', transliteration: 'al-hamdu', meaning: 'All praise', root: '\u062D \u0645 \u062F', rootMeaning: 'to praise' },
    { arabic: '\u0644\u0650\u0644\u0651\u064E\u0647\u0650', transliteration: 'lillahi', meaning: 'is for Allah', root: null, rootMeaning: null },
    { arabic: '\u0631\u064E\u0628\u0651\u0650', transliteration: 'rabbi', meaning: 'Lord', root: '\u0631 \u0628 \u0628', rootMeaning: 'to nurture, sustain' },
    { arabic: '\u0671\u0644\u0652\u0639\u064E\u0640\u0644\u064E\u0645\u0650\u064A\u0646\u064E', transliteration: 'al-ʿālamīn', meaning: 'of the worlds', root: '\u0639 \u0644 \u0645', rootMeaning: 'to know' },
  ],
};

// ── Root tree demo data ──────────────────────────────────────────────
const ROOT_TREE = {
  root: '\u0639 \u0644 \u0645',
  meaning: 'to know',
  derivatives: [
    { arabic: '\u0639\u0650\u0644\u0652\u0645', english: 'knowledge', transliteration: 'ʿilm' },
    { arabic: '\u0639\u064E\u0627\u0644\u0650\u0645', english: 'scholar', transliteration: 'ʿālim' },
    { arabic: '\u0639\u064E\u0644\u0651\u064E\u0645\u064E', english: 'He taught', transliteration: 'ʿallama' },
    { arabic: '\u0645\u064F\u0639\u064E\u0644\u0651\u0650\u0645', english: 'teacher', transliteration: 'muʿallim' },
    { arabic: '\u0639\u064E\u0644\u0650\u064A\u0645', english: 'All-Knowing', transliteration: 'ʿalīm' },
    { arabic: '\u0639\u064E\u0627\u0644\u064E\u0645', english: 'world', transliteration: 'ʿālam' },
  ],
};

// ── Verse of the Day pool ────────────────────────────────────────────
const FEATURED_VERSES = [
  { arabic: '\u0625\u0650\u0646\u0651\u064E \u0645\u064E\u0639\u064E \u0671\u0644\u0652\u0639\u064F\u0633\u0652\u0631\u0650 \u064A\u064F\u0633\u0652\u0631\u064B\u0627', translation: 'Indeed, with hardship comes ease.', reference: 'Surah Ash-Sharh · 94:6', surahLink: '/quran/94' },
  { arabic: '\u0648\u064E\u0645\u064E\u0646 \u064A\u064E\u062A\u064E\u0648\u064E\u0643\u0651\u064E\u0644\u0652 \u0639\u064E\u0644\u064E\u0649 \u0671\u0644\u0644\u0651\u064E\u0647\u0650 \u0641\u064E\u0647\u064F\u0648\u064E \u062D\u064E\u0633\u0652\u0628\u064F\u0647\u064F', translation: 'Whoever relies upon Allah — then He is sufficient for him.', reference: 'Surah At-Talaq · 65:3', surahLink: '/quran/65' },
  { arabic: '\u0641\u064E\u0671\u0630\u0652\u0643\u064F\u0631\u064F\u0648\u0646\u0650\u064A\u0653 \u0623\u064E\u0630\u0652\u0643\u064F\u0631\u0652\u0643\u064F\u0645\u0652', translation: 'Remember Me; I will remember you.', reference: 'Surah Al-Baqarah · 2:152', surahLink: '/quran/2' },
  { arabic: '\u0648\u064E\u0644\u064E\u0633\u064E\u0648\u0652\u0641\u064E \u064A\u064F\u0639\u0652\u0637\u0650\u064A\u0643\u064E \u0631\u064E\u0628\u0651\u064F\u0643\u064E \u0641\u064E\u062A\u064E\u0631\u0652\u0636\u064E\u0649\u0670\u0653', translation: 'Your Lord is going to give you, and you will be satisfied.', reference: 'Surah Ad-Duha · 93:5', surahLink: '/quran/93' },
  { arabic: '\u0631\u064E\u0628\u0651\u0650 \u0632\u0650\u062F\u0652\u0646\u0650\u0649 \u0639\u0650\u0644\u0652\u0645\u064B\u0627', translation: 'My Lord, increase me in knowledge.', reference: 'Surah Ta-Ha · 20:114', surahLink: '/quran/20' },
];

// ── Sample roots ─────────────────────────────────────────────────────
const SAMPLE_ROOTS = [
  { root: '\u0639 \u0644 \u0645', meaning: 'to know',       freq: 854  },
  { root: '\u0643 \u062a \u0628', meaning: 'to write',      freq: 319  },
  { root: '\u0642 \u0648 \u0644', meaning: 'to say',        freq: 1722 },
  { root: '\u0623 \u0645 \u0646', meaning: 'to believe',    freq: 879  },
  { root: '\u062c \u0639 \u0644', meaning: 'to make',       freq: 346  },
  { root: '\u0631 \u062d \u0645', meaning: 'to have mercy', freq: 339  },
];

// ── Latin → Arabic-Indic digit conversion ────────────────────────────

// ── Per-feature ornaments — each card gets its own visual personality ──
function QuranOrnament() {
  // Manuscript ruling lines like a real mushaf page
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage:
          'linear-gradient(to bottom, transparent 0px, transparent 17px, rgba(212,162,70,0.10) 18px)',
        backgroundSize: '100% 18px',
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)',
      }}
    />
  );
}

function RootsOrnament() {
  // A small SVG sprout: trunk + 4 branches with leaf nodes
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 120"
      className="absolute right-3 bottom-3 w-24 h-16 pointer-events-none"
      style={{ opacity: 0.25 }}
    >
      <g stroke="#D4A246" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M100 115 L100 60" />
        <path d="M100 80 Q70 70 50 50" />
        <path d="M100 80 Q130 70 150 50" />
        <path d="M100 60 Q80 45 60 30" />
        <path d="M100 60 Q120 45 140 30" />
        <path d="M100 50 L100 25" />
      </g>
      <g fill="#D4A246">
        <circle cx="50" cy="50" r="2.5" />
        <circle cx="150" cy="50" r="2.5" />
        <circle cx="60" cy="30" r="2.5" />
        <circle cx="140" cy="30" r="2.5" />
        <circle cx="100" cy="25" r="3" />
      </g>
    </svg>
  );
}

function QiratOrnament() {
  // Animated waveform — 24 vertical bars on staggered ease loops
  const bars = Array.from({ length: 24 });
  return (
    <div
      aria-hidden
      className="absolute left-0 right-0 bottom-0 flex items-end justify-center gap-[2px] h-12 px-5 pointer-events-none"
      style={{ opacity: 0.35 }}
    >
      {bars.map((_, i) => (
        <span
          key={i}
          className="qirat-wave-bar"
          style={{
            width: 2,
            background: 'linear-gradient(to top, #7C3AED, #A78BFA)',
            borderRadius: 1,
            animationDelay: `${(i * 90) % 1800}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ── Feature cards data ────────────────────────────────────────────────
const QIRAT_UNLOCKED = process.env.NEXT_PUBLIC_UNLOCK_QIRAT === 'true';

const ALL_FEATURES = [
  {
    color: '#D4A246',
    href: '/quran',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    title: 'Quran Reader',
    body: 'Read every ayah with word-by-word translation, root analysis, and audio recitation by world-class Qaaris.',
    cta: 'Open Quran',
    Ornament: QuranOrnament,
  },
  {
    color: '#D4A246',
    href: '/roots',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
      </svg>
    ),
    title: 'Root Explorer',
    body: `${fmt(TOTAL_ROOTS)} Arabic roots. Understand how one 3-letter root generates dozens of Quranic words you already know.`,
    cta: 'Explore Roots',
    Ornament: RootsOrnament,
  },
  {
    color: '#7C3AED',
    href: '/learn/qirat',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V4.103A2.25 2.25 0 0 0 17.77 2.03l-4.046 1.157A2.25 2.25 0 0 0 12.12 5.35v6.2a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 12.12 7.8V5.35" />
      </svg>
    ),
    title: 'Learn Qirat',
    body: 'Train your ear to the 6 maqamat of Quranic recitation. From Bayati to Hijaz — pitch training for every Muslim.',
    cta: 'Start Qirat',
    Ornament: QiratOrnament,
  },
];
const FEATURES = ALL_FEATURES.filter((f) => QIRAT_UNLOCKED || f.href !== '/learn/qirat');

// ─────────────────────────────────────────────────────────────────────
export function HomepageClient() {
  const { streak } = useAppStore();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  useScrollReveal();

  const [verse] = useState(() => {
    // UTC-based day index so the server render and client hydration agree
    // (avoids a hydration mismatch now that this component is server-rendered).
    const now = new Date();
    const start = Date.UTC(now.getUTCFullYear(), 0, 0);
    const day = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start) / 86400000);
    return FEATURED_VERSES[day % FEATURED_VERSES.length];
  });

  const [activeWord, setActiveWord] = useState<number | null>(null);

  return (
    <div className="min-h-screen overflow-x-hidden relative" style={{ color: '#EDEDEC' }}>

      {/* ══════════════════════════════════════════════════════
          TOP NAV
      ══════════════════════════════════════════════════════ */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-5 sm:px-8"
        style={{
          background: 'rgba(14,13,12,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(212,162,70,0.10)',
        }}
      >
        <Link href="/" className="flex items-center gap-2 text-base font-heading tracking-tight text-[#EDEDEC]">
          <Image src="/logo.png" alt="QuRoots" width={26} height={26} className="object-contain" />
          <span>Qu<span style={{ color: '#D4A246' }}>Roots</span></span>
        </Link>

        <div className="hidden sm:flex items-center gap-7">
          {[
            { href: '/salah',       label: 'Your Salah' },
            { href: '/quran',       label: 'Quran'  },
            { href: '/roots',       label: 'Roots'  },
            { href: '/learn/path',  label: 'Learn'  },
            ...(QIRAT_UNLOCKED ? [{ href: '/learn/qirat', label: 'Qirat' }] : []),
            { href: '/gift',        label: 'Gift'   },
            { href: '/support',     label: 'Sadaqah' },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium transition-colors duration-150"
              style={{ color: '#A09F9B' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#EDEDEC')}
              onMouseLeave={e => (e.currentTarget.style.color = '#A09F9B')}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Mobile-visible Support entry (the nav links are hidden on mobile) */}
          <Link
            href="/support"
            aria-label="Support QuRoots"
            className="sm:hidden flex items-center justify-center w-9 h-9 rounded-xl"
            style={{ background: 'rgba(212,162,70,0.12)', color: '#D4A246', border: '1px solid rgba(212,162,70,0.25)' }}
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </Link>
          <Link
            href="/salah"
            className="text-sm font-bold px-4 py-2 rounded-xl transition-all duration-150"
            style={{
              background: 'linear-gradient(135deg, #D4A246, #E8B84B)',
              color: '#0E0D0C',
              boxShadow: '0 2px 12px rgba(212,162,70,0.3)',
            }}
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════
          HERO — the root is the product: three letters, a family of words
      ══════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden px-5 pt-24 pb-16 sm:pt-28 lg:pb-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 55% 60% at 72% 50%, rgba(212,162,70,0.08) 0%, transparent 70%)' }}
        />
        <div className="relative z-10 max-w-6xl mx-auto grid lg:grid-cols-[1fr_1.05fr] items-center gap-10 lg:gap-6">
          <div className="text-center lg:text-left page-enter">
            <h1
              className="font-heading leading-[1.06] mb-6"
              style={{ fontSize: 'clamp(2.4rem, 5.2vw, 4.1rem)', color: '#F0E8D8' }}
            >
              Three letters.<br />
              <span style={{ color: '#D4A246' }}>A whole family of Quranic words.</span>
            </h1>
            <p className="text-base sm:text-lg leading-relaxed mb-4 max-w-xl mx-auto lg:mx-0" style={{ color: '#B5B2AC' }}>
              Every Arabic word grows from a root. Learn the root{' '}
              <span className="font-arabic text-xl" style={{ color: '#D4A246' }} dir="rtl">ع ل م</span>{' '}
              and you can recognise <em>knowledge</em>, <em>scholar</em>, <em>teacher</em> and <em>All-Knowing</em>:
              854 times across the Quran.
            </p>
            <p className="text-sm leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0" style={{ color: '#9A9893' }}>
              Start with your prayer: Al-Fatiha and the short surahs you recite grow from 110 roots.
              Learn two or three a day, and in 30 days you understand every word. The first week is free.
            </p>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-6">
              <Link
                href="/salah"
                className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #D4A246, #C89535)', color: '#0E0D0C', boxShadow: '0 4px 24px rgba(212,162,70,0.3)' }}
              >
                Understand your salah in 30 days
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <Link
                href="/quiz"
                className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#EDEDEC', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                Try five roots
              </Link>
            </div>
            <p className="text-xs" style={{ color: '#6E6B66' }}>
              Day 1 takes a few minutes. No account needed.
            </p>
          </div>
          <div className="relative">
            <RootBloom caption="854 times in the Quran" />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          COMMUNITY — live social proof strip
      ══════════════════════════════════════════════════════ */}

      {/* ══════════════════════════════════════════════════════
          FEATURES
      ══════════════════════════════════════════════════════ */}
      <section className="px-5 py-20 max-w-5xl mx-auto" data-reveal-group>
        <div className="text-center mb-12" data-reveal-group>
          <p
            className="reveal text-[11px] uppercase tracking-[0.25em] font-bold mb-3"
            style={{ color: '#D4A246', '--reveal-delay': '0s' } as React.CSSProperties}
          >
            What you can do
          </p>
          <h2
            className="reveal font-heading text-3xl sm:text-4xl mb-3"
            style={{ color: '#F0E8D8', letterSpacing: '-0.02em', '--reveal-delay': '0.08s' } as React.CSSProperties}
          >
            Everything you need to understand the Quran
          </h2>
          <p className="reveal text-[#636260] text-base max-w-xl mx-auto" style={{ '--reveal-delay': '0.14s' } as React.CSSProperties}>
            Three complete tools, one platform. No app to download.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <Link
              key={f.href}
              href={f.href}
              className="reveal group flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                '--reveal-delay': `${i * 0.1}s`,
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
              } as React.CSSProperties}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.border = `1px solid ${f.color}30`; (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${f.color}20`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.border = '1px solid rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)'; }}
            >
              {/* Top color bar */}
              <div style={{ height: 3, background: `linear-gradient(to right, ${f.color}, ${f.color}60)` }} />

              {/* Per-feature ornament — manuscript lines / sprout / waveform */}
              <f.Ornament />

              <div className="relative z-10 flex flex-col flex-1 p-6">
                {/* Icon */}
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                  style={{ background: `${f.color}18`, color: f.color }}
                >
                  {f.icon}
                </div>

                <h3 className="font-semibold text-lg mb-2" style={{ color: '#EDEDEC' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed flex-1 mb-5" style={{ color: '#636260' }}>{f.body}</p>

                <div
                  className="flex items-center gap-1.5 text-sm font-semibold transition-all duration-200 group-hover:gap-2.5"
                  style={{ color: f.color }}
                >
                  {f.cta}
                  <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          INTERACTIVE DEMO — Word-by-Word
      ══════════════════════════════════════════════════════ */}
      <section className="px-5 py-20 max-w-3xl mx-auto" data-reveal-group>
        <div className="text-center mb-10">
          <p className="reveal text-[11px] uppercase tracking-[0.25em] font-bold mb-3" style={{ color: '#D4A246', '--reveal-delay': '0s' } as React.CSSProperties}>
            Try it now
          </p>
          <h2 className="reveal font-heading text-3xl sm:text-4xl mb-3" style={{ color: '#F0E8D8', letterSpacing: '-0.02em', '--reveal-delay': '0.07s' } as React.CSSProperties}>
            Tap any word to unlock its meaning
          </h2>
          <p className="reveal text-[#636260] text-base" style={{ '--reveal-delay': '0.13s' } as React.CSSProperties}>
            Every word in the Quran linked to its Arabic root
          </p>
        </div>

        <div
          className="reveal rounded-3xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
            '--reveal-delay': '0.18s',
          } as React.CSSProperties}
        >
          {/* Ayah reference */}
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-xs font-medium" style={{ color: '#636260' }}>{DEMO_AYAH.reference}</span>
            <Link href={DEMO_AYAH.surahLink} className="text-xs font-medium transition-colors" style={{ color: '#D4A246' }}>
              Read full surah →
            </Link>
          </div>

          {/* Arabic words — right to left */}
          <div className="px-6 py-8" dir="rtl">
            <div className="flex flex-wrap gap-3 justify-center mb-2">
              {DEMO_AYAH.words.map((w, i) => (
                <button
                  key={i}
                  onClick={() => setActiveWord(activeWord === i ? null : i)}
                  className="relative flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl transition-all duration-200 cursor-pointer"
                  style={{
                    background: activeWord === i
                      ? 'rgba(13,148,136,0.14)'
                      : 'rgba(255,255,255,0.04)',
                    border: activeWord === i
                      ? '1px solid rgba(13,148,136,0.35)'
                      : '1px solid rgba(255,255,255,0.07)',
                    transform: activeWord === i ? 'scale(1.06)' : 'scale(1)',
                    boxShadow: activeWord === i ? '0 4px 20px rgba(13,148,136,0.15)' : 'none',
                  }}
                >
                  <span
                    className="font-arabic text-3xl leading-none"
                    style={{ color: activeWord === i ? '#7DCEC0' : '#F0E8D8' }}
                  >
                    {w.arabic}
                  </span>
                  <span className="text-[11px]" style={{ color: '#636260' }} dir="ltr">
                    {w.transliteration}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Word detail panel */}
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              minHeight: 88,
              transition: 'all 0.25s ease',
            }}
          >
            {activeWord !== null ? (
              <div className="px-6 py-5 animate-fade-in">
                <div className="flex flex-wrap gap-6 items-start">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#8F8D88' }}>Meaning</p>
                    <p className="font-semibold" style={{ color: '#EDEDEC' }}>{DEMO_AYAH.words[activeWord].meaning}</p>
                  </div>
                  {DEMO_AYAH.words[activeWord].root && (
                    <>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#8F8D88' }}>Root</p>
                        <p className="font-arabic text-xl font-bold" style={{ color: '#D4A246' }}>
                          {DEMO_AYAH.words[activeWord].root}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#8F8D88' }}>Root meaning</p>
                        <p className="font-semibold" style={{ color: '#EDEDEC' }}>{DEMO_AYAH.words[activeWord].rootMeaning}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-6 py-5 flex items-center gap-2" style={{ color: '#7A7874' }}>
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59" />
                </svg>
                <span className="text-xs">Tap a word above to see its root and meaning</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          ROOTS PREVIEW
      ══════════════════════════════════════════════════════ */}
      <section className="px-5 py-20 max-w-3xl mx-auto" data-reveal-group>
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="reveal text-[11px] uppercase tracking-[0.25em] font-bold mb-2" style={{ color: '#D4A246', '--reveal-delay': '0s' } as React.CSSProperties}>
              Root Library
            </p>
            <h2 className="reveal font-heading text-2xl sm:text-3xl" style={{ color: '#F0E8D8', '--reveal-delay': '0.07s' } as React.CSSProperties}>
              One root. Infinite words.
            </h2>
          </div>
          <Link href="/roots" className="reveal text-sm font-medium shrink-0 mb-1 transition-colors" style={{ color: '#D4A246', '--reveal-delay': '0.1s' } as React.CSSProperties}>
            See all roots →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {SAMPLE_ROOTS.map((r, i) => (
            <Link
              key={r.root}
              href="/roots"
              className="reveal group flex flex-col rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                '--reveal-delay': `${i * 0.07}s`,
              } as React.CSSProperties}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(212,162,70,0.06)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,162,70,0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; }}
            >
              <div className="flex items-start justify-between mb-3">
                <span
                  className="font-arabic text-2xl leading-none"
                  style={{ color: '#D4A246' }}
                >
                  {r.root}
                </span>
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(212,162,70,0.1)', color: '#D4A246' }}
                >
                  ×{r.freq.toLocaleString()}
                </span>
              </div>
              <p className="text-xs font-medium" style={{ color: '#A09F9B' }}>{r.meaning}</p>
            </Link>
          ))}
        </div>

      </section>

      {/* ══════════════════════════════════════════════════════
          VERSE OF THE DAY
      ══════════════════════════════════════════════════════ */}
      <section className="px-5 py-24 max-w-2xl mx-auto text-center" data-reveal-group>
        <div
          className="reveal rounded-3xl px-8 py-14 relative overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(212,162,70,0.12)',
            '--reveal-delay': '0s',
          } as React.CSSProperties}
        >
          {/* Background glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(212,162,70,0.04) 0%, transparent 70%)' }}
          />

          <div className="relative z-10">
            <div className="flex items-center justify-center gap-3 mb-7">
              <span style={{ height: 1, width: 24, background: 'rgba(212,162,70,0.35)' }} />
              <p className="text-[11px] uppercase tracking-[0.25em] font-bold" style={{ color: '#D4A246' }}>
                Verse of the Day
              </p>
              <span style={{ height: 1, width: 24, background: 'rgba(212,162,70,0.35)' }} />
            </div>

            <Link href={verse.surahLink}>
              <p
                className="font-arabic leading-loose mb-6 transition-colors"
                style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.4rem)', color: '#F0E8D8', textShadow: '0 0 40px rgba(212,162,70,0.15)' }}
              >
                {verse.arabic}
              </p>
            </Link>

            <p
              className="text-lg font-heading italic mb-4 leading-relaxed"
              style={{ color: '#A09F9B' }}
            >
              &ldquo;{verse.translation}&rdquo;
            </p>
            <p className="text-xs" style={{ color: '#8F8D88' }}>{verse.reference}</p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SUPPORT — quiet nudge before the final CTA
      ══════════════════════════════════════════════════════ */}
      <section className="px-5 pb-4 max-w-2xl mx-auto w-full" data-reveal-group>
        <div className="reveal" style={{ '--reveal-delay': '0s' } as React.CSSProperties}>
          <SupportPrompt />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FOOTER CTA
      ══════════════════════════════════════════════════════ */}
      <section className="px-5 py-24 text-center" data-reveal-group>
        <div
          className="reveal max-w-2xl mx-auto rounded-3xl px-8 py-16 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(212,162,70,0.08) 0%, rgba(13,148,136,0.05) 100%)',
            border: '1px solid rgba(212,162,70,0.15)',
            '--reveal-delay': '0s',
          } as React.CSSProperties}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(212,162,70,0.06) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

          <div className="relative z-10">
            <p className="font-arabic text-5xl mb-5" style={{ color: 'rgba(212,162,70,0.25)', textShadow: '0 0 40px rgba(212,162,70,0.1)' }}>بِسْمِ اللّهِ</p>
            <h2
              className="font-heading text-3xl sm:text-4xl mb-4"
              style={{ color: '#F0E8D8', letterSpacing: '-0.02em' }}
            >
              Start your Quranic journey today
            </h2>
            <p className="text-base mb-8 max-w-md mx-auto" style={{ color: '#636260' }}>
              Start with Al-Fatiha. The first week is free, with nothing to download and no account needed.
            </p>
            <Link
              href="/salah"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #D4A246, #C89535)',
                color: '#0E0D0C',
                boxShadow: '0 4px 28px rgba(212,162,70,0.4)',
              }}
            >
              Start day 1
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
          {[
            { href: '/quran',       label: 'Quran'   },
            { href: '/roots',       label: 'Roots'   },
            { href: '/learn/path',  label: 'Learn'   },
            ...(QIRAT_UNLOCKED ? [{ href: '/learn/qirat', label: 'Qirat' }] : []),
            { href: '/search',      label: 'Search'  },
            { href: '/blog',        label: 'Blog'    },
            { href: '/support',     label: 'Support' },
            { href: '/privacy',     label: 'Privacy' },
            { href: '/gift',        label: 'Gift'    },
            { href: '/terms',       label: 'Terms'   },
            { href: '/sources',     label: 'Sources' },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="text-sm transition-colors" style={{ color: '#9A9893' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#EDEDEC')}
              onMouseLeave={e => (e.currentTarget.style.color = '#8A8783')}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="mt-8 mx-auto max-w-md text-left"><EmailSignup source="home" /></div>
        <p className="mt-6 text-xs leading-relaxed max-w-2xl mx-auto" style={{ color: '#8A8783' }}>
          {ACCURACY_NOTICE} Spotted a mistake? Tell us at salam@quroots.com and we&rsquo;ll fix it.
        </p>
        <p className="mt-4 text-xs" style={{ color: '#6E6B66' }}>
          © {new Date().getFullYear()} QuRoots · Built with love for the Ummah
        </p>
      </section>
    </div>
  );
}
