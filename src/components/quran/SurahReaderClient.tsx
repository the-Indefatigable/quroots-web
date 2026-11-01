'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/store/useAppStore';
import { useGlobalAudioStore } from '@/store/useGlobalAudioStore';
import { WordPopover, type WordData } from './WordPopover';
import { AyahLessonModal } from './AyahLessonModal';
import type { PlayMode, LoopMode } from './AudioPlayer';
import { unpack } from '@/lib/wire';
import { planFromQuery, planToQuery, type RepeatPlan } from '@/lib/hifz';
import { GoToAyah } from './GoToAyah';

// Lazy-load the 1.3k LOC audio player + its DSP deps. Keeps it out of the
// initial reader bundle; mounts on first render of the player surface.
const AudioPlayer = dynamic(
  () => import('./AudioPlayer').then((m) => ({ default: m.AudioPlayer })),
  { ssr: false }
);

interface AyahData {
  number: number;
  textUthmani: string;
  translation: string;
  words: WordData[];
}

interface SurahBlock {
  surahNumber: number;
  surahName: string;
  arabicName: string;
  ayahs: AyahData[];
  hasWords: boolean;
}

interface Props {
  ayahs: AyahData[];
  surahNumber: number;
  surahName: string;
  surahArabicName: string;
  hasWords: boolean;
}

async function shareAyah(surahNumber: number, ayahNumber: number, setCopied: (k: string | null) => void) {
  const shareUrl = `${window.location.origin}/share/${surahNumber}/${ayahNumber}`;
  const key = `${surahNumber}:${ayahNumber}`;
  if (navigator.share) {
    try {
      await navigator.share({ url: shareUrl });
      return;
    } catch {
      // fell through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  } catch {
    // clipboard not available
  }
}

/** Find which surah + ayah is closest to viewport center */
function getVisibleSurahAyah(blocks: SurahBlock[]): { surahNumber: number; ayahNumber: number } {
  const viewportCenter = window.innerHeight / 2;
  let closest = { surahNumber: blocks[0]?.surahNumber ?? 1, ayahNumber: 1 };
  let closestDist = Infinity;
  for (const block of blocks) {
    for (const ayah of block.ayahs) {
      const el = document.getElementById(`s${block.surahNumber}-ayah-${ayah.number}`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closest = { surahNumber: block.surahNumber, ayahNumber: ayah.number };
      }
    }
  }
  return closest;
}

const BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';

// Eastern Arabic numerals
function toEastern(n: number): string {
  return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);
}

export function SurahReaderClient({ ayahs, surahNumber, surahName, surahArabicName, hasWords }: Props) {
  const { quranSettings, updateQuranSettings, setLastRead, updateStreak, selectedQariId, setSelectedQariId } = useAppStore();
  const { audioEl, playInfo, setPlayInfo, updatePlayInfo } = useGlobalAudioStore();
  const [showSettings, setShowSettings] = useState(false);
  const [selectedWord, setSelectedWord] = useState<WordData | null>(null);
  const [wordAnchor, setWordAnchor] = useState<HTMLElement | null>(null);
  const [wordByWord, setWordByWord] = useState(hasWords);
  const [lessonAyah, setLessonAyah] = useState<{ surah: number; ayah: number; words: WordData[]; translation: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // --- Infinite scroll: manage multiple surah blocks ---
  const [surahBlocks, setSurahBlocks] = useState<SurahBlock[]>([{
    surahNumber,
    surahName,
    arabicName: surahArabicName,
    ayahs,
    hasWords,
  }]);
  const [loadingNext, setLoadingNext] = useState(false);
  const [allLoaded, setAllLoaded] = useState(surahNumber >= 114);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastSurahRef = useRef(surahNumber);

  // Track the currently visible surah (for URL updates and audio)
  const [visibleSurah, setVisibleSurah] = useState(surahNumber);

  // Fetch next surah for infinite scroll
  const fetchNextSurah = useCallback(async () => {
    if (loadingNext || allLoaded) return;
    const nextNum = lastSurahRef.current + 1;
    if (nextNum > 114) { setAllLoaded(true); return; }

    setLoadingNext(true);
    try {
      const res = await fetch(`/api/quran/${nextNum}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await unpack(res);
      const nextBlock: SurahBlock = {
        surahNumber: data.surah.number,
        surahName: data.surah.englishName,
        arabicName: data.surah.arabicName,
        ayahs: data.ayahs,
        hasWords: data.ayahs[0]?.words?.length > 0,
      };
      setSurahBlocks((prev) => [...prev, nextBlock]);
      lastSurahRef.current = nextNum;
      if (nextNum >= 114) setAllLoaded(true);
    } catch {
      // silently fail
    } finally {
      setLoadingNext(false);
    }
  }, [loadingNext, allLoaded]);

  // Intersection observer for infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchNextSurah();
      },
      { rootMargin: '600px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextSurah]);

  // Update URL and visible surah on scroll
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const { surahNumber: visNum, ayahNumber: visAyah } = getVisibleSurahAyah(surahBlocks);
        if (visNum !== visibleSurah) {
          setVisibleSurah(visNum);
          window.history.replaceState(null, '', `/quran/${visNum}`);
        }
        setLastRead(visNum, visAyah);
      }, 500);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [surahBlocks, visibleSurah, setLastRead]);

  // Flat list of words for keyboard navigation (current visible surah)
  const currentBlock = surahBlocks.find((b) => b.surahNumber === visibleSurah) ?? surahBlocks[0];
  const allWords = useMemo(() => {
    return currentBlock.ayahs.flatMap(a => a.words.filter(w => w.charType === 'word'));
  }, [currentBlock]);

  // Keyboard navigation for words
  useEffect(() => {
    if (!selectedWord) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const currentIndex = allWords.findIndex(w => w.position === selectedWord.position);
        if (currentIndex === -1) return;
        const nextIndex = e.key === 'ArrowLeft'
          ? Math.min(allWords.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
        if (nextIndex !== currentIndex) {
          const nextWord = allWords[nextIndex];
          setSelectedWord(nextWord);
          setTimeout(() => {
            const btn = document.getElementById(`word-btn-${nextWord.position}`);
            if (btn) {
              const rect = btn.getBoundingClientRect();
              const absoluteY = rect.top + window.scrollY;
              if (rect.top < 150 || rect.bottom > window.innerHeight - 150) {
                window.scrollTo({ top: absoluteY - window.innerHeight / 2, behavior: 'smooth' });
                const handleScrollEnd = () => {
                  setWordAnchor(btn);
                  window.removeEventListener('scrollend', handleScrollEnd);
                };
                if ('onscrollend' in window) {
                  window.addEventListener('scrollend', handleScrollEnd);
                } else {
                  setTimeout(() => setWordAnchor(btn), 500);
                }
              } else {
                setWordAnchor(btn);
              }
            }
          }, 10);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedWord, allWords]);

  // Track daily streak on load
  useEffect(() => {
    updateStreak();
  }, [updateStreak]);

  // Audio mode — scoped to one surah at a time
  const [audioMode, setAudioMode] = useState(false);
  const [audioSurah, setAudioSurah] = useState<SurahBlock | null>(null);
  const [audioStartAyah, setAudioStartAyah] = useState(1);
  const [audioCurrentAyah, setAudioCurrentAyah] = useState<number | null>(null);
  const [audioCurrentWordPos, setAudioCurrentWordPos] = useState<number | null>(null);
  const [audioPlayMode, setAudioPlayMode] = useState<PlayMode>('ayah');
  const [audioLoopMode, setAudioLoopMode] = useState<LoopMode>('none');
  // Hifz repeat plan (lib/hifz); kept in the address so a refresh or a shared link keeps it
  const [repeatPlan, setRepeatPlanState] = useState<RepeatPlan | null>(null);
  const setRepeatPlan = useCallback((plan: RepeatPlan | null) => {
    setRepeatPlanState(plan);
    const url = new URL(window.location.href);
    url.search = plan ? planToQuery(plan) : '';
    window.history.replaceState(null, '', url);
  }, []);

  // Follow-playback toggle: whether reader auto-scrolls to active ayah
  const [followPlayback, setFollowPlayback] = useState(true);
  // Detect user-initiated scroll to suppress auto-scroll temporarily
  const userScrollingRef = useRef(false);
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!audioMode) return;
    function onScroll() {
      userScrollingRef.current = true;
      if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
      userScrollTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false;
      }, 2500);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
    };
  }, [audioMode]);

  // Auto-scroll to active ayah during playback — only if user isn't scrolling & follow is on
  const scrolledAyahRef = useRef<number | null>(null);
  useEffect(() => {
    if (!audioMode || audioCurrentAyah === null || !audioSurah) return;
    if (!followPlayback || userScrollingRef.current) return;
    if (scrolledAyahRef.current === audioCurrentAyah) return;
    scrolledAyahRef.current = audioCurrentAyah;
    const el = document.getElementById(`s${audioSurah.surahNumber}-ayah-${audioCurrentAyah}`);
    if (!el) return;
    // Only scroll if the ayah is not already visible in viewport
    const rect = el.getBoundingClientRect();
    const inView = rect.top >= 80 && rect.bottom <= window.innerHeight - 80;
    if (!inView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [audioCurrentAyah, audioMode, audioSurah, followPlayback]);

  // Sync playback state to global store so PersistentMiniPlayer works across pages
  useEffect(() => {
    if (!audioMode || !audioSurah || audioCurrentAyah === null) return;
    updatePlayInfo({
      surahNumber: audioSurah.surahNumber,
      surahName: audioSurah.surahName,
      currentAyah: audioCurrentAyah,
      totalAyahs: audioSurah.ayahs.length,
      isPlaying: true,
      playMode: audioPlayMode,
      loopMode: audioLoopMode,
    });
  }, [audioCurrentAyah, audioMode, audioSurah, audioPlayMode, audioLoopMode, updatePlayInfo]);

  const openAudioMode = useCallback((block: SurahBlock, fromAyah?: number, plan: RepeatPlan | null = null) => {
    // Stop any existing playback and reset the shared audio element
    // so the old and new AudioPlayer don't fight over the same element
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
    }
    const startAyah = plan?.from ?? fromAyah ?? 1;
    setRepeatPlan(plan);
    if (plan) setAudioPlayMode('ayah');   // a repeat plan plays ayah by ayah
    setAudioSurah(block);
    setAudioStartAyah(startAyah);
    setAudioCurrentAyah(startAyah);
    setAudioMode(true);
    setPlayInfo({
      surahNumber: block.surahNumber,
      surahName: block.surahName,
      currentAyah: startAyah,
      totalAyahs: block.ayahs.length,
      isPlaying: true,
      playMode: plan ? 'ayah' : audioPlayMode,
      loopMode: audioLoopMode,
    });
  }, [audioEl, audioPlayMode, audioLoopMode, setPlayInfo, setRepeatPlan]);

  // Arriving with a range in the address (/quran/2?from=255&to=257&each=3): go there and start the plan.
  // If the browser blocks sound until a tap, the player opens paused on that ayah.
  const urlPlanRef = useRef(false);
  useEffect(() => {
    if (urlPlanRef.current || !audioEl) return;
    const plan = planFromQuery(new URLSearchParams(window.location.search), surahNumber);
    const block = surahBlocks.find((b) => b.surahNumber === surahNumber);
    if (!plan || !block) return;
    urlPlanRef.current = true;
    document.getElementById(`s${surahNumber}-ayah-${plan.from}`)?.scrollIntoView({ block: 'center' });
    openAudioMode(block, plan.from, plan);
  }, [audioEl, surahNumber, surahBlocks, openAudioMode]);

  const closeAudioMode = useCallback(() => {
    audioEl?.pause();
    setAudioMode(false);
    setAudioSurah(null);
    setAudioCurrentAyah(null);
    setAudioCurrentWordPos(null);
    scrolledAyahRef.current = null;
    setPlayInfo(null);
    setRepeatPlan(null);
  }, [audioEl, setPlayInfo, setRepeatPlan]);

  // Adopt ongoing global playback when arriving at the reader (e.g. via the
  // mini-player's "Return to reader"). The audio element lives in the root
  // layout and keeps playing across route changes, so we re-open the in-reader
  // player and sync to it WITHOUT resetting the element — unlike openAudioMode,
  // which stops and reloads for a fresh start. This fixes playback stopping /
  // the player vanishing when returning to the reader.
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (adoptedRef.current || audioMode) return;
    if (!playInfo || !audioEl) return;
    const block = surahBlocks.find((b) => b.surahNumber === playInfo.surahNumber);
    if (!block) return; // this surah isn't loaded in the reader yet
    adoptedRef.current = true;
    setAudioSurah(block);
    setAudioStartAyah(playInfo.currentAyah);
    setAudioCurrentAyah(playInfo.currentAyah);
    setAudioPlayMode(playInfo.playMode);
    setAudioLoopMode(playInfo.loopMode);
    setAudioMode(true);
  }, [playInfo, audioEl, audioMode, surahBlocks]);

  return (
    <div className={audioMode ? 'pb-28 lg:pb-20' : ''}>
      {/* Toolbar */}
      <GoToAyah
        currentSurah={surahNumber}
        className="mb-3 sm:max-w-xs sm:ml-auto"
        onLocal={(ref) => {
          const block = surahBlocks.find((b) => b.surahNumber === ref.surah);
          if (!block) return;
          document.getElementById(`s${ref.surah}-ayah-${ref.from}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          openAudioMode(block, ref.from, { from: ref.from, to: ref.to, each: 1, times: 1, gap: 0 });
        }}
      />
      <div className="flex justify-end gap-2 mb-8">
        {hasWords && (
          <button
            onClick={() => setWordByWord(!wordByWord)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-all duration-200"
            style={wordByWord
              ? { background: 'rgba(212,162,70,0.12)', color: '#D4A246', border: '1px solid rgba(212,162,70,0.25)' }
              : { background: 'rgba(255,255,255,0.04)', color: '#A3A19C', border: '1px solid rgba(255,255,255,0.07)' }
            }
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            Word by Word
          </button>
        )}

        {audioMode && (
          <button
            onClick={() => setFollowPlayback(!followPlayback)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-all duration-200"
            style={followPlayback
              ? { background: 'rgba(212,162,70,0.12)', color: '#D4A246', border: '1px solid rgba(212,162,70,0.25)' }
              : { background: 'rgba(255,255,255,0.04)', color: '#A3A19C', border: '1px solid rgba(255,255,255,0.07)' }
            }
            title={followPlayback ? 'Auto-scroll on — click to disable' : 'Auto-scroll off — click to enable'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            Follow
          </button>
        )}

        <button
          onClick={() => audioMode ? closeAudioMode() : openAudioMode(surahBlocks[0])}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-all duration-200"
          style={audioMode
            ? { background: 'rgba(212,162,70,0.12)', color: '#D4A246', border: '1px solid rgba(212,162,70,0.25)' }
            : { background: 'rgba(255,255,255,0.04)', color: '#A3A19C', border: '1px solid rgba(255,255,255,0.07)' }
          }
        >
          <svg className="w-3.5 h-3.5" fill={audioMode ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
          </svg>
          Listen
        </button>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-all duration-200"
          style={showSettings
            ? { background: 'rgba(212,162,70,0.12)', color: '#D4A246', border: '1px solid rgba(212,162,70,0.25)' }
            : { background: 'rgba(255,255,255,0.04)', color: '#A3A19C', border: '1px solid rgba(255,255,255,0.07)' }
          }
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
          </svg>
          Display
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div
          className="rounded-2xl p-4 sm:p-5 mb-8 flex flex-wrap items-center gap-4 sm:gap-6"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Font size */}
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: '#A3A19C' }}>Font size</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => updateQuranSettings({ fontSize: Math.max(20, quranSettings.fontSize - 2) })}
                className="w-7 h-7 rounded-lg text-sm font-bold transition-all duration-200 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#A3A19C', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                −
              </button>
              <span className="text-xs w-8 text-center font-medium" style={{ color: '#EDEDEC' }}>{quranSettings.fontSize}</span>
              <button
                onClick={() => updateQuranSettings({ fontSize: Math.min(48, quranSettings.fontSize + 2) })}
                className="w-7 h-7 rounded-lg text-sm font-bold transition-all duration-200 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#A3A19C', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                +
              </button>
            </div>
          </div>

          {/* Translation toggle */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs" style={{ color: '#A3A19C' }}>Translation</span>
            <button
              onClick={() => updateQuranSettings({ showTranslation: !quranSettings.showTranslation })}
              className="relative w-9 h-5 rounded-full transition-colors duration-200"
              style={{
                background: quranSettings.showTranslation ? '#D4A246' : 'rgba(255,255,255,0.1)',
              }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{ transform: quranSettings.showTranslation ? 'translateX(17px)' : 'translateX(2px)' }}
              />
            </button>
          </div>
        </div>
      )}

      {/* Surah blocks */}
      {surahBlocks.map((block, blockIdx) => {
        const isFirstBlock = blockIdx === 0;
        return (
          <div key={block.surahNumber}>
            {/* Surah divider for subsequent surahs */}
            {!isFirstBlock && (
              <div className="text-center my-16 py-10 relative">
                {/* Decorative lines */}
                <div className="absolute inset-x-0 top-0 flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(212,162,70,0.2))' }} />
                  <span style={{ color: 'rgba(212,162,70,0.4)', fontSize: '10px' }}>◆</span>
                  <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(212,162,70,0.2))' }} />
                </div>

                <p
                  className="font-arabic mb-2 leading-none"
                  style={{
                    fontSize: 'clamp(2rem, 6vw, 3rem)',
                    color: '#D4A246',
                    textShadow: '0 0 30px rgba(212,162,70,0.3)',
                  }}
                >
                  {block.arabicName}
                </p>
                <h2
                  className="font-heading text-2xl tracking-tight leading-tight"
                  style={{ color: 'var(--color-ivory)', textShadow: 'var(--glow-ivory)' }}
                >
                  {block.surahName}
                </h2>
                <p
                  className="text-[12px] mt-1.5 uppercase tracking-[0.16em]"
                  style={{ color: '#8F8D88', fontVariantNumeric: 'tabular-nums' }}
                >
                  {block.ayahs.length} Ayahs
                </p>

                {/* Bismillah */}
                {block.surahNumber !== 9 && block.surahNumber !== 1 && (
                  <p
                    className="font-arabic mt-6"
                    style={{ fontSize: '1.25rem', color: '#8F8D88' }}
                  >
                    {BISMILLAH}
                  </p>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06))' }} />
                  <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.06))' }} />
                </div>
              </div>
            )}

            {/* Ayahs */}
            <div className={`space-y-1 ${!isFirstBlock ? 'mt-4' : ''}`}>
              {block.ayahs.map((ayah) => {
                const isActiveAyah = audioMode && audioSurah?.surahNumber === block.surahNumber && audioCurrentAyah === ayah.number;
                // Word highlight only fires when WxW is explicitly on — decoupled from active-ayah state
                const showWordHighlight = isActiveAyah && wordByWord;
                return (
                  <div
                    key={`${block.surahNumber}-${ayah.number}`}
                    id={`s${block.surahNumber}-ayah-${ayah.number}`}
                    className="group rounded-2xl transition-all duration-300"
                    style={{
                      padding: '16px',
                      margin: '0 -4px',
                      background: isActiveAyah ? 'rgba(212,162,70,0.05)' : 'transparent',
                      border: isActiveAyah ? '1px solid rgba(212,162,70,0.15)' : '1px solid transparent',
                    }}
                  >
                    <div className="flex items-start gap-4">
                      {/* Ayah number — diamond marker */}
                      <div className="shrink-0 flex flex-col items-center gap-1 mt-1">
                        <div
                          className="w-9 h-9 flex items-center justify-center text-xs font-medium transition-all duration-200"
                          style={{
                            background: isActiveAyah
                              ? 'rgba(212,162,70,0.2)'
                              : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isActiveAyah ? 'rgba(212,162,70,0.4)' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: '10px',
                            color: isActiveAyah ? '#D4A246' : '#78716C',
                            clipPath: 'polygon(29% 0%, 71% 0%, 100% 29%, 100% 71%, 71% 100%, 29% 100%, 0% 71%, 0% 29%)',
                          }}
                        >
                          {toEastern(ayah.number)}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        {wordByWord && ayah.words.length > 0 ? (
                          <div className="flex flex-wrap gap-x-3 gap-y-4 justify-end" dir="rtl">
                            {ayah.words
                              .filter((w) => w.charType === 'word')
                              .map((word) => {
                                const isActiveWord = showWordHighlight && audioCurrentWordPos === word.position;
                                return (
                                  <button
                                    id={`word-btn-${word.position}`}
                                    key={word.position}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedWord(word);
                                      setWordAnchor(e.currentTarget);
                                    }}
                                    className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl cursor-pointer transition-all duration-200"
                                    style={{
                                      background: isActiveWord
                                        ? 'rgba(212,162,70,0.12)'
                                        : 'transparent',
                                      border: `1px solid ${isActiveWord ? 'rgba(212,162,70,0.3)' : 'transparent'}`,
                                      transform: isActiveWord ? 'translateY(-4px) scale(1.05)' : 'none',
                                    }}
                                    onMouseEnter={e => {
                                      if (!isActiveWord) {
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(212,162,70,0.06)';
                                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,162,70,0.15)';
                                      }
                                    }}
                                    onMouseLeave={e => {
                                      if (!isActiveWord) {
                                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                                        (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                                      }
                                    }}
                                  >
                                    <span
                                      className="font-arabic leading-loose transition-colors"
                                      style={{
                                        fontSize: `${quranSettings.fontSize}px`,
                                        color: isActiveWord ? '#D4A246' : '#F0E8D8',
                                      }}
                                    >
                                      {word.textUthmani}
                                    </span>
                                    {word.translation && (
                                      // dir="ltr" because the gloss is English
                                      // sitting inside the RTL word row — without
                                      // it the truncation ellipsis rendered at the
                                      // start ("…y crookedness"). Short glosses
                                      // wrap rather than truncate so no word is
                                      // silently cut off.
                                      <span
                                        className="text-[13px] leading-snug max-w-[104px] text-center break-words hyphens-auto"
                                        style={{ color: '#C2AD84' }}
                                        dir="ltr"
                                        lang="en"
                                      >
                                        {word.translation}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                          </div>
                        ) : (
                          <p
                            className="font-arabic leading-[2.4] text-right"
                            dir="rtl"
                            style={{
                              fontSize: `${quranSettings.fontSize}px`,
                              color: '#F0E8D8',
                            }}
                          >
                            {ayah.textUthmani}
                          </p>
                        )}

                        {quranSettings.showTranslation && ayah.translation && (
                          <p
                            className="text-[15px] leading-relaxed mt-4 pt-4"
                            dir="ltr"
                            style={{
                              color: '#BDBAB4',
                              borderTop: '1px solid rgba(255,255,255,0.05)',
                            }}
                          >
                            {ayah.translation}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Ayah actions — visible on hover */}
                    <div
                      className="flex justify-end gap-1.5 mt-3"
                      style={{ opacity: isActiveAyah ? 1 : undefined }}
                    >
                      <button
                        onClick={() => openAudioMode(block, ayah.number)}
                        className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                        style={isActiveAyah
                          ? { background: 'rgba(212,162,70,0.12)', color: '#D4A246', border: '1px solid rgba(212,162,70,0.2)', opacity: 1 }
                          : { background: 'rgba(255,255,255,0.04)', color: '#A3A19C', border: '1px solid rgba(255,255,255,0.07)' }
                        }
                      >
                        <svg className="w-3 h-3" fill={isActiveAyah ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                        </svg>
                        Listen
                      </button>

                      {block.hasWords && ayah.words.some((w) => (w.charType ?? 'word') === 'word' && w.translation) && (
                        <button
                          onClick={() => setLessonAyah({ surah: block.surahNumber, ayah: ayah.number, words: ayah.words, translation: ayah.translation })}
                          className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                          style={{ background: 'rgba(212,162,70,0.12)', color: '#D4A246', border: '1px solid rgba(212,162,70,0.28)' }}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
                          </svg>
                          Learn
                        </button>
                      )}

                      {/* Tafsir opens on Quran.com: we link to it rather than host a copyrighted commentary. */}
                      <a
                        href={`https://quran.com/${block.surahNumber}/${ayah.number}/tafsirs/en-tafisr-ibn-kathir`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                        style={{ background: 'rgba(212,162,70,0.08)', color: '#D4A246', border: '1px solid rgba(212,162,70,0.15)' }}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                          </svg>
                        Tafsir ↗
                      </a>

                      <button
                        onClick={() => shareAyah(block.surahNumber, ayah.number, setCopiedKey)}
                        className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                        style={{ background: 'rgba(255,255,255,0.04)', color: '#A3A19C', border: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        {copiedKey === `${block.surahNumber}:${ayah.number}` ? (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ color: '#D4A246' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                            <span style={{ color: '#D4A246' }}>Copied</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                            </svg>
                            Share
                          </>
                        )}
                      </button>
                    </div>

                    {/* Subtle divider */}
                    <div
                      className="mt-4"
                      style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0.05) 70%, transparent)' }}
                    />
                  </div>
                );
              })}
            </div>

            {/* End of surah marker */}
            <div className="text-center mt-16 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(212,162,70,0.15))' }} />
                <span style={{ color: 'rgba(212,162,70,0.3)', fontSize: '8px' }}>◆ ◆ ◆</span>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(212,162,70,0.15))' }} />
              </div>
              <p
                className="font-arabic text-lg mb-1"
                style={{ color: 'rgba(212,162,70,0.35)', textShadow: '0 0 20px rgba(212,162,70,0.15)' }}
              >
                صَدَقَ ٱللَّهُ ٱلْعَظِيمُ
              </p>
              <p className="text-[12px] tracking-widest uppercase" style={{ color: '#7A7874' }}>
                End of Surah {block.surahName}
              </p>
              <p className="mt-3 text-[11px] tracking-wider" style={{ color: '#7A7874' }}>
                Translation: <span style={{ color: '#8F8D88' }}>Kanzul Iman</span>
                {' · '}Imam Ahmad Raza Khan
              </p>
            </div>
          </div>
        );
      })}

      {/* Infinite scroll sentinel */}
      {!allLoaded && (
        <div ref={sentinelRef} className="flex items-center justify-center py-16">
          {loadingNext && (
            <div className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: 'rgba(212,162,70,0.3)', borderTopColor: '#D4A246' }}
              />
              <span className="text-sm" style={{ color: '#8F8D88' }}>Loading next surah…</span>
            </div>
          )}
        </div>
      )}

      {allLoaded && surahBlocks.length > 1 && (
        <div className="text-center py-16">
          <p
            className="font-arabic text-2xl mb-2"
            style={{ color: 'rgba(212,162,70,0.3)' }}
          >
            الحمد لله
          </p>
          <p className="text-xs tracking-widest uppercase" style={{ color: '#7A7874' }}>
            End of the Quran
          </p>
        </div>
      )}

      {/* Modals & Popovers */}
      <WordPopover
        word={selectedWord}
        anchorElement={wordAnchor}
        onClose={() => { setSelectedWord(null); setWordAnchor(null); }}
      />
      {lessonAyah && (
        <AyahLessonModal
          surahNumber={lessonAyah.surah}
          ayahNumber={lessonAyah.ayah}
          words={lessonAyah.words}
          translation={lessonAyah.translation}
          onClose={() => setLessonAyah(null)}
        />
      )}

      {/* Audio player */}
      {audioMode && audioSurah && audioEl && (
        <AudioPlayer
          key={`${audioSurah.surahNumber}-${audioStartAyah}`}
          audioElement={audioEl}
          surahNumber={audioSurah.surahNumber}
          surahName={audioSurah.surahName}
          totalAyahs={audioSurah.ayahs.length}
          startAyah={audioStartAyah}
          playMode={audioPlayMode}
          loopMode={audioLoopMode}
          ayahs={audioSurah.ayahs.map(a => ({ number: a.number, textUthmani: a.textUthmani, translation: a.translation }))}
          onAyahChange={(ayah) => { setAudioCurrentAyah(ayah); updatePlayInfo({ currentAyah: ayah }); }}
          onWordChange={setAudioCurrentWordPos}
          onClose={closeAudioMode}
          onPlayModeChange={setAudioPlayMode}
          onLoopModeChange={setAudioLoopMode}
          selectedQariId={selectedQariId}
          onQariChange={setSelectedQariId}
          repeatPlan={repeatPlan}
          onRepeatPlanChange={setRepeatPlan}
        />
      )}
    </div>
  );
}
