'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AudioVisualizer } from './AudioVisualizer';
import { GuidedPractice } from './GuidedPractice';
import { QARI_LIBRARY, getDefaultQari, getQariById, buildAyahAudioUrl, type QariInfo } from '@/lib/audio/qariLibrary';
import { G, SPEED_OPTIONS, formatTime } from './audio/playerTokens';
import { EqBars, SeekBar, VolumeControl } from './audio/PlayerControls';
import { useAudioKeyboard } from './audio/useAudioKeyboard';
import { useQariMenu } from './audio/useQariMenu';
import { SurahGlyph } from './audio/SurahGlyph';
import { QariProfile } from './audio/QariProfile';
import { HifzPanel } from './audio/HifzPanel';
import { nextUnderPlan, type RepeatPlan } from '@/lib/hifz';

type ExpandedTab = 'lyrics' | 'qari' | 'pitch' | 'practice';

interface AyahAudio {
  ayahNumber: number;
  url: string;
  segments: [number, number, number][];
}

export type PlayMode = 'ayah' | 'surah';
export type LoopMode = 'none' | 'ayah' | 'surah';

interface AyahDisplay {
  number: number;
  textUthmani: string;
  translation?: string;
}

interface Props {
  audioElement: HTMLAudioElement;
  surahNumber: number;
  surahName: string;
  totalAyahs: number;
  startAyah: number;
  playMode: PlayMode;
  loopMode: LoopMode;
  ayahs: AyahDisplay[];
  onAyahChange: (ayahNumber: number) => void;
  onWordChange: (wordPos: number | null) => void;
  onClose: () => void;
  onPlayModeChange: (mode: PlayMode) => void;
  onLoopModeChange: (mode: LoopMode) => void;
  selectedQariId?: string;
  onQariChange?: (qariId: string) => void;
  /** Hifz repeat: a range, repeats per ayah, rounds and a pause (lib/hifz). Null = play normally. */
  repeatPlan?: RepeatPlan | null;
  onRepeatPlanChange?: (plan: RepeatPlan | null) => void;
}

export function AudioPlayer({
  audioElement,
  surahNumber,
  surahName,
  totalAyahs,
  startAyah,
  playMode,
  loopMode,
  ayahs: ayahsList,
  onAyahChange,
  onWordChange,
  onClose,
  onPlayModeChange,
  onLoopModeChange,
  selectedQariId,
  onQariChange,
  repeatPlan = null,
  onRepeatPlanChange,
}: Props) {
  const selectedQari: QariInfo = getQariById(selectedQariId ?? '') ?? getDefaultQari();
  const { showQariMenu, setShowQariMenu } = useQariMenu();
  const ayahDataRef        = useRef<Map<number, AyahAudio>>(new Map());
  const chapterAudioUrlRef = useRef<string | null>(null);
  const usingSurahAudioRef = useRef(false);
  /** Surah-mode fallback: no chapter audio file available, so play ayahs back-to-back. */
  const usingStitchedSurahRef = useRef(false);
  /** Internal ayah index used by stitched-surah mode (no UI highlight). */
  const stitchedAyahRef = useRef(1);
  const playingBismillahRef = useRef(false);
  const hasBismillah = surahNumber !== 1 && surahNumber !== 9;
  const onAyahChangeRef   = useRef(onAyahChange);
  const onWordChangeRef   = useRef(onWordChange);
  onAyahChangeRef.current = onAyahChange;
  onWordChangeRef.current = onWordChange;

  const playModeRef    = useRef(playMode);
  const loopModeRef    = useRef(loopMode);
  const currentAyahRef = useRef(startAyah);
  const totalAyahsRef  = useRef(totalAyahs);
  playModeRef.current    = playMode;
  loopModeRef.current    = loopMode;
  totalAyahsRef.current  = totalAyahs;

  const rafRef = useRef<number | null>(null);

  // Hifz repeat: where we are in the plan, and the pause timer while the listener recites back
  const planRef  = useRef<RepeatPlan | null>(repeatPlan);
  const countRef = useRef(1);
  const roundRef = useRef(1);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  planRef.current = repeatPlan;
  const [hifzOpen, setHifzOpen] = useState(false);
  const [hifzStep, setHifzStep] = useState({ count: 1, round: 1 });
  const [reciting, setReciting] = useState(false);
  const [hifzDone, setHifzDone] = useState(false);
  const clearGap = useCallback(() => {
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    gapTimerRef.current = null;
    setReciting(false);
  }, []);

  const [isPlaying, setIsPlaying]         = useState(false);
  const [currentAyah, _setCurrentAyah]    = useState(startAyah);
  const setCurrentAyah = useCallback((v: number | ((prev: number) => number)) => {
    _setCurrentAyah(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      currentAyahRef.current = next;
      return next;
    });
  }, []);
  const [progress, setProgress]           = useState(0);
  const [currentTime, setCurrentTime]     = useState(0);
  const [duration, setDuration]           = useState(0);
  const [playRevision, setPlayRevision]   = useState(0);
  const [timingsLoaded, setTimingsLoaded] = useState(false);
  const [timingsError, setTimingsError]   = useState(false);
  const [expanded, setExpanded]           = useState(false);
  const [expandedTab, setExpandedTab]     = useState<ExpandedTab>('lyrics');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackSpeedRef                  = useRef(1);
  const [volume, setVolume]               = useState(1);
  const [isSeeking, setIsSeeking]         = useState(false);
  const preloadedAudioRef                 = useRef<HTMLAudioElement | null>(null);
  const seekBarRef                        = useRef<HTMLDivElement>(null);
  const volumeBarRef                      = useRef<HTMLDivElement>(null);
  const lyricsContainerRef               = useRef<HTMLDivElement>(null);
  const lastScrolledAyahRef              = useRef<number | null>(null);
  const [analyserNode, setAnalyserNode]   = useState<AnalyserNode | null>(null);
  const audioCtxRef                       = useRef<AudioContext | null>(null);

  const analyserNodeRef = useRef<AnalyserNode | null>(null);

  const ensureAnalyser = useCallback(() => {
    // Already created in this mount — just resume if needed
    if (analyserNodeRef.current) {
      const existingCtx = audioCtxRef.current;
      if (existingCtx?.state === 'suspended') existingCtx.resume().catch(() => {});
      return analyserNodeRef.current;
    }
    try {
      // Check if a previous mount already attached a MediaElementSource to this element.
      // createMediaElementSource can only be called ONCE per element — a second call throws
      // InvalidStateError. This guard survives React Strict Mode double-mounts.
      const el = audioElement as any;
      if (el.__qurootsAnalyser && el.__qurootsCtx) {
        const ctx = el.__qurootsCtx as AudioContext;
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        analyserNodeRef.current = el.__qurootsAnalyser;
        setAnalyserNode(el.__qurootsAnalyser);
        return el.__qurootsAnalyser as AnalyserNode;
      }

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      if (!audioElement.paused) ctx.resume().catch(() => {});

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      const source = ctx.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      // Persist on the element so future mounts can reuse
      el.__qurootsCtx = ctx;
      el.__qurootsAnalyser = analyser;

      analyserNodeRef.current = analyser;
      setAnalyserNode(analyser);
      return analyser;
    } catch (e) {
      console.warn('Audio visualizer setup failed:', e);
      return null;
    }
  }, [audioElement]);

  // ── Data fetching — refetches when surah OR qari changes ──────────────────
  // Track qari changes so we can re-trigger playback at the same ayah
  // when the user switches reciters mid-session.
  const prevRecitationIdRef = useRef(selectedQari.quranComRecitationId);
  const [pendingQariSwap, setPendingQariSwap] = useState(false);
  useEffect(() => {
    const recitationId = selectedQari.quranComRecitationId;
    const isQariChange = prevRecitationIdRef.current !== recitationId;
    if (isQariChange) {
      prevRecitationIdRef.current = recitationId;
      setPendingQariSwap(true);
      // Reset transient state so the timings-arrived effect picks it up cleanly
      usingSurahAudioRef.current = false;
      usingStitchedSurahRef.current = false;
      playingBismillahRef.current = false;
    }
    setTimingsLoaded(false);
    setTimingsError(false);
    fetch(`/api/audio/timings/${surahNumber}?recitationId=${recitationId}`)
      .then((r) => r.json())
      .then((data) => {
        const ayahList: AyahAudio[] = Array.isArray(data) ? data : data.ayahs ?? [];
        const map = new Map<number, AyahAudio>();
        for (const d of ayahList) map.set(d.ayahNumber, d);
        ayahDataRef.current = map;
        chapterAudioUrlRef.current = data?.chapterAudioUrl ?? null;
        setTimingsLoaded(true);
      })
      .catch(() => {
        setTimingsError(true);
        setTimingsLoaded(true);
      });
  }, [surahNumber, selectedQari.quranComRecitationId]);

  // ── Playback ───────────────────────────────────────────────────────────────
  const preloadNextAyah = useCallback((currentAyahNumber: number) => {
    const nextAyah = currentAyahNumber + 1;
    if (nextAyah > totalAyahs) return;
    const nextData = ayahDataRef.current.get(nextAyah);
    const nextSrc  = nextData?.url ?? buildAyahAudioUrl(selectedQari, surahNumber, nextAyah);
    // Warm HTTP cache so the audio element can start the next ayah with minimal gap
    fetch(nextSrc, { cache: 'force-cache' }).catch(() => {});
    const preload  = new Audio();
    preload.preload = 'auto';
    preload.src = nextSrc;
    preloadedAudioRef.current = preload;
  }, [surahNumber, totalAyahs]);

  const playAyah = useCallback((ayahNumber: number) => {
    const audio   = audioElement;
    countRef.current = 1;
    const ayahData = ayahDataRef.current.get(ayahNumber);
    const src     = ayahData?.url ?? buildAyahAudioUrl(selectedQari, surahNumber, ayahNumber);
    usingSurahAudioRef.current = false;
    usingStitchedSurahRef.current = false;
    playingBismillahRef.current = false;
    audio.src = src;
    audio.load();
    audio.playbackRate = playbackSpeedRef.current;
    audio.play().catch(() => setIsPlaying(false));
    setCurrentAyah(ayahNumber);
    setIsPlaying(true);
    setProgress(0);
    onAyahChangeRef.current(ayahNumber);
    onWordChangeRef.current(null);
    preloadNextAyah(ayahNumber);
  }, [audioElement, surahNumber, preloadNextAyah]);

  // Stitched surah mode: when no chapter audio file is available (some
  // surahs/qaris have only per-ayah files), play ayah audio back-to-back
  // continuously with NO highlighting — true "listen straight through".
  const playStitchedSurah = useCallback((startAt: number = 1) => {
    const audio = audioElement;
    usingSurahAudioRef.current = true;
    usingStitchedSurahRef.current = true;
    playingBismillahRef.current = false;
    stitchedAyahRef.current = startAt;
    const ayahData = ayahDataRef.current.get(startAt);
    audio.src = ayahData?.url ?? buildAyahAudioUrl(selectedQari, surahNumber, startAt);
    audio.load();
    audio.currentTime = 0;
    audio.playbackRate = playbackSpeedRef.current;
    audio.play().catch(() => setIsPlaying(false));
    setCurrentAyah(0);
    setIsPlaying(true);
    setProgress(0);
    // No highlighting in stitched surah mode
    onAyahChangeRef.current(0);
    onWordChangeRef.current(null);
  }, [audioElement, selectedQari, surahNumber]);

  // Play the full chapter audio file (surah mode). No ayah/word highlighting.
  // For surahs that have Bismillah, play it first then seamlessly switch to
  // the chapter audio (handled in handleEnded via playingBismillahRef).
  // Falls back to stitched mode when no chapter audio file is available.
  const playChapterAudio = useCallback(() => {
    const audio = audioElement;
    const url = chapterAudioUrlRef.current;
    if (!url) { playStitchedSurah(1); return; }
    usingSurahAudioRef.current = true;
    usingStitchedSurahRef.current = false;
    if (hasBismillah) {
      playingBismillahRef.current = true;
      audio.src = buildAyahAudioUrl(selectedQari, 1, 1);
    } else {
      playingBismillahRef.current = false;
      audio.src = url;
    }
    audio.load();
    audio.currentTime = 0;
    audio.playbackRate = playbackSpeedRef.current;
    audio.play().catch(() => setIsPlaying(false));
    setCurrentAyah(0);
    setIsPlaying(true);
    setProgress(0);
    // In surah mode we don't highlight any ayah on the page
    onAyahChangeRef.current(0);
    onWordChangeRef.current(null);
  }, [audioElement, playStitchedSurah, hasBismillah, selectedQari]);

  useEffect(() => {
    const audio = audioElement;
    // If audio is already playing (e.g. user navigated away and came back),
    // don't restart — just sync state and start the RAF loop.
    if (!audio.paused && audio.src !== '') {
      setIsPlaying(true);
      startRAF();
      return;
    }
    if (playModeRef.current === 'surah') {
      if (timingsLoaded) playChapterAudio();
      // else: effect below will kick off when timings arrive
    } else {
      playAyah(startAyah);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When timings (and chapterAudioUrl) arrive after mount OR after a qari swap
  useEffect(() => {
    if (!timingsLoaded) return;
    // Qari was swapped mid-session: restart at the same position in the same mode
    if (pendingQariSwap) {
      setPendingQariSwap(false);
      if (playModeRef.current === 'surah') {
        playChapterAudio();
      } else {
        playAyah(currentAyahRef.current || 1);
      }
      return;
    }
    // Only auto-start chapter audio if nothing is already playing. When we
    // adopt ongoing playback on return to the reader, the element is still
    // playing — restarting it would jump back to the first ayah.
    if (playModeRef.current === 'surah' && !usingSurahAudioRef.current && audioElement.paused) {
      playChapterAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timingsLoaded, pendingQariSwap]);

  // React to playMode changes mid-session
  const prevPlayModeRef = useRef(playMode);
  useEffect(() => {
    const prev = prevPlayModeRef.current;
    prevPlayModeRef.current = playMode;
    if (prev === playMode) return;
    if (playMode === 'surah') {
      playChapterAudio();
    } else {
      playAyah(currentAyahRef.current || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playMode]);

  // ── RAF highlight loop — runs at 60fps for precise word/ayah sync ──────────
  const doHighlight = useCallback(() => {
    const audio = audioElement;
    const ms = audio.currentTime * 1000;
    // Surah mode = single chapter audio file, no ayah/word highlighting
    if (usingSurahAudioRef.current) {
      onWordChangeRef.current(null);
      return;
    }
    // Safety net: verify the audio src matches the expected ayah.
    // If they're out of sync (e.g. due to event ordering), resync the highlight.
    const src = audioElement.src;
    const srcMatch = src.match(/(\d{3})(\d{3})\.mp3/);
    if (srcMatch) {
      const srcSurah = parseInt(srcMatch[1], 10);
      const srcAyah = parseInt(srcMatch[2], 10);
      if (srcSurah === surahNumber && srcAyah !== currentAyahRef.current && srcAyah > 0) {
        setCurrentAyah(srcAyah);
        onAyahChangeRef.current(srcAyah);
      }
    }
    const segments = ayahDataRef.current.get(currentAyahRef.current)?.segments ?? [];
    const active = segments.find(([, start, end]) => ms >= start && ms < end);
    onWordChangeRef.current(active ? active[0] : null);
  }, [audioElement, surahNumber]);

  const startRAF = useCallback(() => {
    if (rafRef.current !== null) return;
    const tick = () => {
      doHighlight();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [doHighlight]);

  const stopRAF = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Audio event handlers ───────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioElement;

    function handleTimeUpdate() {
      if (isSeeking) return;
      const pct = audio.duration ? audio.currentTime / audio.duration : 0;
      setProgress(pct);
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);
    }

    function handleEnded() {
      setIsPlaying(false);
      onWordChangeRef.current(null);
      const loop = loopModeRef.current;
      // Stitched surah mode: advance to next ayah audio without highlighting
      if (usingSurahAudioRef.current && usingStitchedSurahRef.current) {
        const next = stitchedAyahRef.current + 1;
        const total = totalAyahsRef.current;
        if (next <= total) {
          stitchedAyahRef.current = next;
          const ayahData = ayahDataRef.current.get(next);
          audio.src = ayahData?.url ?? buildAyahAudioUrl(selectedQari, surahNumber, next);
          audio.load();
          audio.currentTime = 0;
          audio.playbackRate = playbackSpeedRef.current;
          audio.play().catch(() => setIsPlaying(false));
          setIsPlaying(true);
          setProgress(0);
        } else if (loop === 'surah') {
          // Loop the whole stitched surah
          setPlayRevision(r => r + 1);
          stitchedAyahRef.current = 1;
          const ayahData = ayahDataRef.current.get(1);
          audio.src = ayahData?.url ?? buildAyahAudioUrl(selectedQari, surahNumber, 1);
          audio.load();
          audio.currentTime = 0;
          audio.playbackRate = playbackSpeedRef.current;
          audio.play().catch(() => setIsPlaying(false));
          setIsPlaying(true);
          setProgress(0);
        }
        return;
      }
      // Surah mode = bismillah (optional) → chapter audio. Loop or stop.
      if (usingSurahAudioRef.current) {
        // Bismillah just finished — swap to the chapter audio file
        if (playingBismillahRef.current) {
          playingBismillahRef.current = false;
          const url = chapterAudioUrlRef.current;
          if (url) {
            audio.src = url;
            audio.load();
            audio.currentTime = 0;
            audio.playbackRate = playbackSpeedRef.current;
            audio.play().catch(() => setIsPlaying(false));
            setIsPlaying(true);
            setProgress(0);
          }
          return;
        }
        if (loop === 'surah') {
          audio.currentTime = 0;
          audio.play().catch(() => setIsPlaying(false));
          setIsPlaying(true);
          setProgress(0);
          setPlayRevision(r => r + 1);
        }
        return;
      }
      const plan = planRef.current;
      if (plan) {
        const next = nextUnderPlan(plan, currentAyahRef.current, countRef.current, roundRef.current);
        if (!next) { setHifzDone(true); return; }
        const go = () => {
          audio.removeEventListener('hifz-skip-gap', go);
          if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
          gapTimerRef.current = null;
          setReciting(false);
          roundRef.current = next.round;
          if (next.ayah === currentAyahRef.current) {
            // same ayah again: seek instead of reloading to keep the analyser connected
            audio.currentTime = 0;
            audio.play().catch(() => setIsPlaying(false));
            setIsPlaying(true);
            setProgress(0);
            setPlayRevision(r => r + 1);
          } else {
            playAyah(next.ayah);
          }
          countRef.current = next.count;
          setHifzStep({ count: next.count, round: next.round });
        };
        if (plan.gap > 0) {
          setReciting(true);
          gapTimerRef.current = setTimeout(go, plan.gap * 1000);
          // tapping play during the pause skips it (togglePlay)
          audio.addEventListener('hifz-skip-gap', go, { once: true });
        } else go();
        return;
      }
      if (loop === 'ayah') {
        // Same ayah — seek instead of reloading to keep analyser connected
        audio.currentTime = 0;
        audio.play().catch(() => setIsPlaying(false));
        setIsPlaying(true);
        setProgress(0);
        setPlayRevision(r => r + 1);
        return;
      }
      // Ayah mode: chain continuously through the surah
      const ayah = currentAyahRef.current;
      const total = totalAyahsRef.current;
      if (ayah < total) {
        playAyah(ayah + 1);
      } else if (loop === 'surah') {
        setPlayRevision(r => r + 1);
        playAyah(1);
      }
    }

    function handlePlay() {
      setIsPlaying(true);
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      startRAF();
    }
    function handlePause() {
      setIsPlaying(false);
      stopRAF();
      onWordChangeRef.current(null);
    }
    function handleLoadedMetadata() {
      setDuration(audio.duration || 0);
    }

    audio.addEventListener('timeupdate',     handleTimeUpdate);
    audio.addEventListener('ended',          handleEnded);
    audio.addEventListener('play',           handlePlay);
    audio.addEventListener('pause',          handlePause);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      audio.removeEventListener('timeupdate',     handleTimeUpdate);
      audio.removeEventListener('ended',          handleEnded);
      audio.removeEventListener('play',           handlePlay);
      audio.removeEventListener('pause',          handlePause);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      stopRAF();
    };
  // currentAyah/totalAyahs accessed via refs to avoid stale closures + re-attaching listeners
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioElement, playAyah, isSeeking, startRAF, stopRAF]);

  // ── Controls ───────────────────────────────────────────────────────────────
  function togglePlay() {
    const audio = audioElement;
    const plan = planRef.current;
    if (plan && gapTimerRef.current) {
      clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
      setReciting(false);
      audio.dispatchEvent(new Event('hifz-skip-gap'));
      return;
    }
    if (plan && hifzDone) {
      setHifzDone(false);
      roundRef.current = 1;
      setHifzStep({ count: 1, round: 1 });
      playAyah(plan.from);
      return;
    }
    if (audio.src) {
      isPlaying ? audio.pause() : audio.play().catch(() => {});
    } else if (playMode === 'surah') {
      playChapterAudio();
    } else {
      playAyah(currentAyah);
    }
  }

  function prevAyah() {
    // Stitched surah mode: jump to previous ayah audio
    if (usingStitchedSurahRef.current) {
      const prev = Math.max(1, stitchedAyahRef.current - 1);
      playStitchedSurah(prev);
      return;
    }
    if (usingSurahAudioRef.current) {
      audioElement.currentTime = Math.max(0, audioElement.currentTime - 10);
      return;
    }
    if (currentAyah <= 1) return;
    playAyah(currentAyah - 1);
  }

  function nextAyah() {
    // Stitched surah mode: jump to next ayah audio
    if (usingStitchedSurahRef.current) {
      const next = Math.min(totalAyahsRef.current, stitchedAyahRef.current + 1);
      if (next === stitchedAyahRef.current) return;
      playStitchedSurah(next);
      return;
    }
    if (usingSurahAudioRef.current) {
      audioElement.currentTime = Math.min(audioElement.duration || 0, audioElement.currentTime + 10);
      return;
    }
    if (currentAyah >= totalAyahs) return;
    playAyah(currentAyah + 1);
  }

  function startFromBeginning() {
    if (playMode === 'surah') {
      if (usingSurahAudioRef.current) {
        audioElement.currentTime = 0;
        if (!isPlaying) audioElement.play().catch(() => {});
      } else {
        playChapterAudio();
      }
    } else {
      playAyah(1);
    }
  }

  // A new plan starts at its first ayah, in ayah mode, from the top of its counters
  const prevPlanRef = useRef(repeatPlan);
  useEffect(() => {
    const prev = prevPlanRef.current;
    prevPlanRef.current = repeatPlan;
    if (prev === repeatPlan) return;
    clearGap();
    setHifzDone(false);
    roundRef.current = 1;
    setHifzStep({ count: 1, round: 1 });
    if (!repeatPlan) return;
    currentAyahRef.current = repeatPlan.from;
    if (playModeRef.current === 'surah') onPlayModeChange('ayah');   // the mode change plays currentAyahRef
    else playAyah(repeatPlan.from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatPlan]);

  // no stray repeat after the player closes
  useEffect(() => () => { if (gapTimerRef.current) clearTimeout(gapTimerRef.current); }, []);

  function cycleLoop() {
    const order: LoopMode[] = ['none', 'ayah', 'surah'];
    const idx = order.indexOf(loopMode);
    onLoopModeChange(order[(idx + 1) % order.length]);
  }

  function cycleSpeed() {
    const idx  = SPEED_OPTIONS.indexOf(playbackSpeed as typeof SPEED_OPTIONS[number]);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    playbackSpeedRef.current  = next;
    setPlaybackSpeed(next);
    audioElement.playbackRate = next;
  }

  function seekToAyah(ayahNumber: number) {
    playAyah(ayahNumber);
  }

  // Auto-scroll lyrics to current ayah
  useEffect(() => {
    if (!expanded || !lyricsContainerRef.current) return;
    if (lastScrolledAyahRef.current === currentAyah) return;
    lastScrolledAyahRef.current = currentAyah;
    const el = lyricsContainerRef.current.querySelector(`[data-ayah="${currentAyah}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [expanded, currentAyah]);

  function handleSeek(clientX: number) {
    if (!seekBarRef.current) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setProgress(pct);
    if (audioElement.duration) {
      audioElement.currentTime = pct * audioElement.duration;
      setCurrentTime(pct * audioElement.duration);
    }
  }

  function handleVolumeChange(clientX: number) {
    if (!volumeBarRef.current) return;
    const rect = volumeBarRef.current.getBoundingClientRect();
    const vol  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setVolume(vol);
    audioElement.volume = vol;
  }

  useAudioKeyboard({
    togglePlay,
    nextAyah,
    prevAyah,
    toggleExpanded: () => setExpanded((v) => !v),
    isPlaying,
    currentAyah,
  });

  const loopLabel = loopMode === 'ayah' ? '1' : loopMode === 'surah' ? '∞' : '';

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const seekBarProps = {
    progress,
    currentTime,
    duration,
    isSeeking,
    setIsSeeking,
    handleSeek,
    seekBarRef,
  };
  const volumeControlProps = {
    volume,
    setVolume,
    audioElement,
    handleVolumeChange,
    volumeBarRef,
  };

  // ── EXPANDED VIEW ──────────────────────────────────────────────────────────
  const hifzPanel = hifzOpen ? (
    <HifzPanel
      surahNumber={surahNumber}
      totalAyahs={totalAyahs}
      currentAyah={currentAyah}
      plan={repeatPlan}
      onStart={(p) => { onRepeatPlanChange?.(p); setHifzOpen(false); }}
      onStop={() => { onRepeatPlanChange?.(null); setHifzOpen(false); }}
      onClose={() => setHifzOpen(false)}
    />
  ) : null;

  if (expanded) {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex flex-col overflow-hidden animate-slide-up"
        style={{ background: G.bg }}
      >
        {/* Manuscript ruling lines — faint horizontal gold hairlines */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'repeating-linear-gradient(to bottom, transparent, transparent 31px, rgba(212,162,70,0.018) 31px, rgba(212,162,70,0.018) 32px)',
          }}
        />
        {/* Radial gold vignette from top */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-56 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 90% 100% at 50% 0%, rgba(212,162,70,0.07) 0%, transparent 100%)',
          }}
        />

        {/* All content sits above the decorative layers */}
        <div className="relative z-10 flex flex-col h-full">

          {/* ── Top bar ── */}
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <button
              onClick={() => setExpanded(false)}
              className="w-10 h-10 flex items-center justify-center rounded-full transition-colors"
              style={{ background: G.surface, border: `1px solid ${G.border}` }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke={G.textTert}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            <span
              className="text-[11px] font-semibold tracking-[0.15em] uppercase"
              style={{ color: G.textTert }}
            >
              Now Playing
            </span>

            <button
              onClick={() => { audioElement.pause(); setExpanded(false); onClose(); }}
              className="w-10 h-10 flex items-center justify-center rounded-full transition-colors"
              style={{ background: G.surface, border: `1px solid ${G.border}` }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke={G.textTert}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Surah name + qari selector — with hero glyph ── */}
          <div className="text-center px-8 pt-1 pb-2 flex flex-col items-center">
            {/* Hero glyph — the now-playing artwork */}
            <div className="mb-3 relative">
              <SurahGlyph surahNumber={surahNumber} size={88} />
              {isPlaying && (
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    boxShadow: '0 0 60px rgba(212,162,70,0.25), 0 0 24px rgba(212,162,70,0.15)',
                    animation: 'pulse-glow 3s ease-in-out infinite',
                  }}
                />
              )}
            </div>
            <h3
              className="text-2xl sm:text-[26px] font-heading"
              style={{
                color: G.textPrimary,
                letterSpacing: '-0.015em',
                fontVariationSettings: '"opsz" 144, "SOFT" 30',
              }}
            >
              {surahName}
            </h3>

            <div className="relative inline-block mt-1">
              <button
                onClick={(e) => { e.stopPropagation(); setShowQariMenu(!showQariMenu); }}
                className="flex items-center gap-1.5 mx-auto text-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  color: G.textPrimary,
                  background: 'rgba(212,162,70,0.08)',
                  border: `1px solid ${G.goldBorder}`,
                  borderRadius: '9999px',
                  padding: '5px 12px',
                }}
                aria-label="Change qari"
              >
                {selectedQari.name}
                <span
                  className="px-1.5 py-0.5 rounded text-[11px] font-semibold"
                  style={{ background: 'rgba(212,162,70,0.18)', color: G.gold }}
                >
                  {selectedQari.styleLabel}
                </span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke={G.gold}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {showQariMenu && (
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 rounded-xl p-2 z-50"
                  style={{ background: '#161513', border: `1px solid ${G.goldBorder}`, boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}
                >
                  {QARI_LIBRARY.map((qari) => (
                    <button
                      key={qari.id}
                      onClick={() => { onQariChange?.(qari.id); setShowQariMenu(false); }}
                      className="w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-3"
                      style={{
                        background: qari.id === selectedQari.id ? 'rgba(212,162,70,0.08)' : 'transparent',
                        color: qari.id === selectedQari.id ? G.gold : G.textSecond,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{qari.name}</span>
                          <span
                            className="text-[11px] px-1.5 py-0.5 rounded font-medium shrink-0"
                            style={{ background: 'rgba(255,255,255,0.06)', color: G.textTert }}
                          >
                            {qari.styleLabel}
                          </span>
                        </div>
                        <p className="text-[12px] mt-0.5 truncate" style={{ color: G.textTert }}>{qari.description}</p>
                      </div>
                      {qari.id === selectedQari.id && (
                        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke={G.gold}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[12px] mt-1" style={{ color: G.textTert }}>
              Ayah {currentAyah} / {totalAyahs}
            </p>
          </div>

          {/* ── Tab bar — underline style ── */}
          <div
            className="flex items-end justify-center gap-0 px-6"
            style={{ borderBottom: `1px solid ${G.border}` }}
          >
            {([
              { id: 'lyrics'   as ExpandedTab, label: 'Lyrics',    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg> },
              { id: 'qari'     as ExpandedTab, label: 'Qari',      icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg> },
              { id: 'pitch'    as ExpandedTab, label: 'Melody',    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" /></svg> },
              { id: 'practice' as ExpandedTab, label: 'Practice',  icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg> },
            ]).map((tab) => {
              const active = expandedTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { if (tab.id !== 'lyrics') ensureAnalyser(); setExpandedTab(tab.id); }}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs font-medium transition-colors"
                  style={{
                    color: active ? G.gold : G.textTert,
                    borderBottom: active ? `2px solid ${G.gold}` : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Tab content ── */}
          {expandedTab === 'lyrics' ? (
            <div
              ref={lyricsContainerRef}
              className="flex-1 overflow-y-auto px-4 sm:px-8 min-h-0 scroll-smooth"
              style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)' }}
            >
              <div className="max-w-lg mx-auto py-6 space-y-3">
                {playMode === 'surah' ? (
                  <div
                    className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl"
                    style={{ border: `1px solid ${G.border}`, background: G.surface }}
                  >
                    <svg className="w-8 h-8 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke={G.gold}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                    </svg>
                    <p className="text-sm font-medium mb-1" style={{ color: G.textPrimary }}>
                      Full surah playback
                    </p>
                    <p className="text-xs leading-relaxed max-w-[16rem]" style={{ color: G.textSecond }}>
                      Switch to <span style={{ color: G.gold }}>Ayah mode</span> to see verses and follow along.
                    </p>
                    <button
                      onClick={() => onPlayModeChange('ayah')}
                      className="mt-5 px-4 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: 'rgba(212,162,70,0.1)',
                        border: `1px solid ${G.goldBorder}`,
                        color: G.gold,
                      }}
                    >
                      Switch to Ayah mode
                    </button>
                  </div>
                ) : (<>
                {surahNumber !== 9 && surahNumber !== 1 && (
                  <p
                    className="font-arabic text-xl text-center pb-4"
                    style={{ color: G.textTert, borderBottom: `1px solid ${G.border}` }}
                  >
                    بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                  </p>
                )}
                {ayahsList.map((ayah) => {
                  const isActive = ayah.number === currentAyah;
                  return (
                    <button
                      key={ayah.number}
                      data-ayah={ayah.number}
                      onClick={() => seekToAyah(ayah.number)}
                      className="w-full text-right rounded-xl px-4 py-3 transition-all duration-300 border"
                      style={{
                        background: isActive ? 'rgba(212,162,70,0.06)' : 'transparent',
                        borderColor: isActive ? 'rgba(212,162,70,0.18)' : 'transparent',
                        transform: isActive ? 'scale(1.01)' : 'scale(1)',
                      }}
                      dir="rtl"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[12px] font-medium mt-1 transition-colors"
                          style={{
                            background: isActive ? G.gold : 'rgba(255,255,255,0.06)',
                            color:      isActive ? G.bg   : G.textTert,
                          }}
                        >
                          {ayah.number}
                        </span>
                        <span
                          className="font-arabic text-xl sm:text-2xl leading-[2] transition-colors"
                          style={{ color: isActive ? G.gold : G.textSecond }}
                        >
                          {ayah.textUthmani}
                        </span>
                      </div>
                      {ayah.translation && (
                        <p
                          className="text-xs leading-relaxed mt-2 text-left transition-colors"
                          dir="ltr"
                          style={{ color: isActive ? G.textSecond : G.textTert }}
                        >
                          {ayah.translation}
                        </p>
                      )}
                    </button>
                  );
                })}
                </>)}
                <div className="h-8" />
              </div>
            </div>

          ) : expandedTab === 'qari' ? (
            <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              <QariProfile qari={selectedQari} onQariChange={onQariChange} />
            </div>

          ) : expandedTab === 'practice' ? (
            <div className="flex-1 overflow-hidden px-4 sm:px-6 py-3" style={{ minHeight: 0 }}>
              <div
                className="w-full h-full max-w-2xl mx-auto rounded-2xl overflow-hidden relative"
                style={{ border: `1px solid ${G.goldBorder}`, background: 'rgba(255,255,255,0.015)' }}
              >
                <GuidedPractice
                  analyserNode={analyserNode}
                  isPlaying={isPlaying}
                  currentAyah={currentAyah}
                  totalAyahs={totalAyahs}
                  surahNumber={surahNumber}
                  selectedQari={selectedQari}
                  ayahs={ayahsList}
                  playRevision={playRevision}
                  onNextAyah={() => { if (currentAyah < totalAyahs) seekToAyah(currentAyah + 1); }}
                  onPause={() => audioElement.pause()}
                />
              </div>
            </div>

          ) : (
            <div className="flex-1 overflow-hidden px-4 sm:px-6 py-3" style={{ minHeight: 0 }}>
              <div
                className="w-full h-full max-w-2xl mx-auto rounded-2xl overflow-hidden relative"
                style={{ border: `1px solid ${G.border}`, background: 'rgba(255,255,255,0.015)' }}
              >
                <AudioVisualizer
                  analyserNode={analyserNode}
                  isPlaying={isPlaying}
                  mode="pitch"
                  currentAyah={currentAyah}
                />
                <div
                  className="absolute top-3 right-3 text-[11px] px-2 py-1 rounded-md"
                  style={{ background: 'rgba(14,13,12,0.8)', color: G.textTert, backdropFilter: 'blur(6px)' }}
                >
                  The qari&apos;s melody — copy the contour
                </div>
              </div>
            </div>
          )}

          {/* ── Seekbar ── */}
          <div className="px-8 mt-4">
            <div className="max-w-sm mx-auto">
              <SeekBar large {...seekBarProps} />
            </div>
          </div>

          {/* ── Transport controls ── */}
          <div className="px-8 mt-5 mb-1">
            <div className="max-w-sm mx-auto flex items-center justify-between">

              {/* Loop */}
              <button
                onClick={cycleLoop}
                className="w-10 h-10 flex items-center justify-center rounded-full transition-colors relative"
                style={{ color: loopMode !== 'none' ? G.gold : G.textTert }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
                </svg>
                {loopLabel && (
                  <span className="absolute -top-0.5 -right-0.5 text-[11px] font-bold" style={{ color: G.gold }}>{loopLabel}</span>
                )}
              </button>

              {/* Previous */}
              <button
                onClick={prevAyah}
                disabled={currentAyah <= 1}
                className="w-12 h-12 flex items-center justify-center disabled:opacity-25 transition-all active:scale-90"
                style={{ color: G.textSecond }}
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                </svg>
              </button>

              {/* Play/Pause — hero button with gradient + inset highlight */}
              <button
                onClick={togglePlay}
                className="w-16 h-16 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  borderRadius: '9999px',
                  background: `radial-gradient(circle at 30% 28%, #F0C168, ${G.gold} 65%, ${G.goldDim} 100%)`,
                  color: '#1A1310',
                  boxShadow: `0 0 36px rgba(212,162,70,0.4), 0 6px 24px rgba(212,162,70,0.25), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 6px rgba(120,80,20,0.2)`,
                }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7 translate-x-[2px]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Next */}
              <button
                onClick={nextAyah}
                disabled={currentAyah >= totalAyahs}
                className="w-12 h-12 flex items-center justify-center disabled:opacity-25 transition-all active:scale-90"
                style={{ color: G.textSecond }}
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>

              {/* Speed */}
              <button
                onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
                className="w-10 h-10 flex items-center justify-center rounded-full text-xs font-bold transition-colors"
                style={{
                  color: playbackSpeed !== 1 ? G.gold : G.textTert,
                  background: playbackSpeed !== 1 ? 'rgba(212,162,70,0.1)' : 'transparent',
                }}
              >
                {playbackSpeed}x
              </button>
            </div>
          </div>

          {/* ── Bottom row ── */}
          <div className="px-8 pb-8 pt-3">
            <div className="max-w-sm mx-auto flex items-center justify-between">
              <button
            onClick={(e) => { e.stopPropagation(); setHifzOpen(true); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
            style={{
              color: repeatPlan ? G.gold : G.textSecond,
              background: repeatPlan ? 'rgba(212,162,70,0.12)' : G.surface,
              border: `1px solid ${repeatPlan ? 'rgba(212,162,70,0.35)' : G.border}`,
            }}
            aria-label="Hifz repeat"
          >
            Hifz
          </button>
              {/* Play mode toggle */}
              <button
                onClick={() => onPlayModeChange(playMode === 'ayah' ? 'surah' : 'ayah')}
                className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
                style={{
                  background: playMode === 'surah' ? 'rgba(212,162,70,0.1)' : G.surface,
                  color: playMode === 'surah' ? G.gold : G.textTert,
                  border: `1px solid ${playMode === 'surah' ? G.goldBorder : G.border}`,
                }}
              >
                {playMode === 'ayah' ? 'Ayah mode' : 'Surah mode'}
              </button>

              <VolumeControl {...volumeControlProps} />

              {currentAyah > 1 && (
                <button
                  onClick={startFromBeginning}
                  className="text-xs transition-colors"
                  style={{ color: G.textTert }}
                >
                  Restart
                </button>
              )}
            </div>
          </div>

        </div>
        {hifzPanel}
      </div>,
      document.body
    );
  }

  // ── COLLAPSED MINI-BAR ─────────────────────────────────────────────────────
  return createPortal(
    <div
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+64px)] left-0 right-0 lg:bottom-0 lg:left-64 z-30"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Refined top seekbar — 2px hairline, gold-on-warm */}
      <div
        ref={!expanded ? seekBarRef : undefined}
        className="relative w-full h-[2px] cursor-pointer group/seek"
        style={{ background: 'rgba(212,162,70,0.10)' }}
        onMouseDown={(e) => {
          setIsSeeking(true);
          handleSeek(e.clientX);
          const onMove = (ev: MouseEvent) => handleSeek(ev.clientX);
          const onUp   = () => { setIsSeeking(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
        onTouchStart={(e) => {
          setIsSeeking(true);
          handleSeek(e.touches[0].clientX);
          const onMove = (ev: TouchEvent) => handleSeek(ev.touches[0].clientX);
          const onEnd  = () => { setIsSeeking(false); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
          window.addEventListener('touchmove', onMove);
          window.addEventListener('touchend', onEnd);
        }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-75"
          style={{
            width: `${progress * 100}%`,
            background: `linear-gradient(to right, ${G.teal}, ${G.gold})`,
            boxShadow: progress > 0.01 ? `0 0 8px rgba(212,162,70,0.5)` : 'none',
          }}
        />
        {/* Larger invisible hit area */}
        <div className="absolute -top-3 -bottom-3 left-0 right-0" />
      </div>

      {/* Bar body — warm radial backdrop, manuscript hairline above */}
      <div
        className="relative flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 cursor-pointer"
        style={{
          background:
            'radial-gradient(ellipse 80% 140% at 20% 50%, rgba(36,28,18,0.98) 0%, rgba(14,13,12,0.98) 60%), rgba(14,13,12,0.96)',
          backdropFilter: 'blur(24px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
          borderTop: `1px solid ${G.goldBorder}`,
          boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          setExpanded(true);
        }}
      >
        {/* Procedural surah glyph — replaces the number-in-square */}
        <div className="shrink-0 relative flex items-center justify-center">
          <SurahGlyph surahNumber={surahNumber} size={44} dim={!isPlaying} />
          {isPlaying && (
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: '0 0 24px rgba(212,162,70,0.25)',
              }}
            />
          )}
        </div>

        {/* Info — quieter type, more breathing room */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[15px] font-heading leading-tight truncate"
            style={{ color: G.textPrimary, letterSpacing: '-0.01em' }}
          >
            {surahName}
          </p>
          <p
            className="text-[12px] truncate mt-0.5 tabular-nums"
            style={{ color: G.textTert, letterSpacing: '0.01em' }}
          >
            {playMode === 'surah'
              ? `Surah ${surahNumber}`
              : repeatPlan
                ? (hifzDone ? `Done · ${surahNumber}:${repeatPlan.from}${repeatPlan.to !== repeatPlan.from ? `–${repeatPlan.to}` : ''}`
                  : reciting ? `Your turn · ayah ${currentAyah}`
                  : `Ayah ${currentAyah} · ${hifzStep.count}/${repeatPlan.each} · round ${hifzStep.round}/${repeatPlan.times || '∞'}`)
                : `Ayah ${currentAyah} · ${totalAyahs}`}
            {duration > 0 && ` — ${formatTime(currentTime)} / ${formatTime(duration)}`}
            {timingsError && ' · sync unavailable'}
          </p>
        </div>

        {/* Transport — hero play with circular progress ring */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevAyah}
            disabled={currentAyah <= 1}
            className="w-9 h-9 flex items-center justify-center disabled:opacity-20 transition-all hover:scale-110 active:scale-90"
            style={{ color: G.textSecond }}
            aria-label="Previous ayah"
          >
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>

          {/* Hero play button with circular progress ring — ring sits flush around button */}
          <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
            <button
              onClick={togglePlay}
              className="w-10 h-10 flex items-center justify-center transition-all active:scale-90 hover:scale-105 shrink-0"
              style={{
                borderRadius: '9999px',
                background: `radial-gradient(circle at 30% 30%, #E8B85C, ${G.gold} 70%)`,
                color: '#1A1310',
                boxShadow: `0 4px 16px rgba(212,162,70,0.4), inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-[18px] h-[18px] translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            {/* Progress ring — pointer-events-none so the button stays clickable */}
            <svg
              className="absolute inset-0 -rotate-90 pointer-events-none"
              width="44"
              height="44"
              viewBox="0 0 44 44"
              aria-hidden
            >
              <circle
                cx="22"
                cy="22"
                r="21"
                fill="none"
                stroke="rgba(212,162,70,0.18)"
                strokeWidth="1.5"
              />
              <circle
                cx="22"
                cy="22"
                r="21"
                fill="none"
                stroke={G.gold}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 21}
                strokeDashoffset={2 * Math.PI * 21 * (1 - progress)}
                style={{
                  transition: 'stroke-dashoffset 0.1s linear',
                  filter: 'drop-shadow(0 0 4px rgba(212,162,70,0.6))',
                }}
              />
            </svg>
          </div>

          <button
            onClick={nextAyah}
            disabled={currentAyah >= totalAyahs}
            className="w-9 h-9 flex items-center justify-center disabled:opacity-20 transition-all hover:scale-110 active:scale-90"
            style={{ color: G.textSecond }}
            aria-label="Next ayah"
          >
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        {/* Hifz repeat — on every screen size: it is what memorisers come for */}
        <button
            onClick={(e) => { e.stopPropagation(); setHifzOpen(true); }}
            className="h-8 px-3 rounded-full text-[12px] font-semibold shrink-0"
            style={{
              color: repeatPlan ? G.gold : G.textSecond,
              background: repeatPlan ? 'rgba(212,162,70,0.12)' : G.surface,
              border: `1px solid ${repeatPlan ? 'rgba(212,162,70,0.35)' : G.border}`,
            }}
            aria-label="Hifz repeat"
          >
            Hifz
          </button>

        {/* Right-side mini controls — visually demoted, secondary tier */}
        <div className="hidden sm:flex items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
            className="text-[12px] font-bold px-2 py-1 rounded-md transition-colors"
            style={{
              color: playbackSpeed !== 1 ? G.gold : G.textTert,
              background: playbackSpeed !== 1 ? 'rgba(212,162,70,0.1)' : 'transparent',
            }}
          >
            {playbackSpeed}x
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onPlayModeChange(playMode === 'ayah' ? 'surah' : 'ayah'); }}
            className="text-[12px] font-medium px-2 py-1 rounded-md transition-colors"
            style={{
              color: playMode === 'surah' ? G.gold : G.textTert,
              background: playMode === 'surah' ? 'rgba(212,162,70,0.1)' : 'transparent',
            }}
          >
            {playMode === 'ayah' ? 'Ayah' : 'Surah'}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); cycleLoop(); }}
            className="relative w-8 h-8 flex items-center justify-center rounded-md transition-colors"
            style={{ color: loopMode !== 'none' ? G.gold : G.textTert }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
            </svg>
            {loopLabel && (
              <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold" style={{ color: G.gold }}>{loopLabel}</span>
            )}
          </button>

          <VolumeControl {...volumeControlProps} />
        </div>

        {/* Close */}
        <button
          onClick={(e) => { e.stopPropagation(); audioElement.pause(); onClose(); }}
          className="w-8 h-8 flex items-center justify-center transition-colors"
          style={{ color: G.textTert }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {hifzPanel}
    </div>,
    document.body
  );
}
