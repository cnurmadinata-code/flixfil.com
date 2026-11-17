import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle,
  ArrowLeft,
  Captions,
  Crown,
  ExternalLink,
  FastForward,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SkipForward,
  Sliders,
  Sparkles,
  Square,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Episode, LanguageCode, Movie, SubtitleTrack, UserProfile, UserSettings } from '../types';
import { playUiSound } from '../utils/audioUi';
import { formatDuration } from '../utils/i18n';
import { FlixfilLogo } from './FlixfilLogo';
import { FilmPoster } from './FilmPoster';

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(ts: string): number {
  const clean = ts.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return 0;
}

function parseVttOrSrt(raw: string): SubtitleCue[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const arrowIdx = lines.findIndex((l) => l.includes('-->'));
    if (arrowIdx === -1) continue;
    const [startStr, endStr] = lines[arrowIdx].split('-->').map((s) => s.trim().split(' ')[0]);
    const start = parseTimestamp(startStr);
    const end = parseTimestamp(endStr);
    const text = lines
      .slice(arrowIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '');
    if (Number.isFinite(start) && Number.isFinite(end) && text) {
      cues.push({ start, end, text });
    }
  }
  return cues;
}

interface VideoPlayerViewProps {
  movie: Movie;
  episodes: Episode[];
  subtitles: SubtitleTrack[];
  relatedMovies: Movie[];
  user: UserProfile | null;
  settings: UserSettings | null;
  lang: LanguageCode;
  initialEpisodeId?: string;
  onBack: () => void;
  onJoinPremium: () => void;
  onSelectMovie: (movie: Movie) => void;
  onSaveProgress: (
    movieId: string,
    progressSeconds: number,
    durationSeconds: number,
    completed?: boolean,
    episodeId?: string,
    keepalive?: boolean,
  ) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function VideoPlayerView({
  movie,
  episodes,
  subtitles,
  relatedMovies,
  user,
  settings,
  lang,
  initialEpisodeId,
  onBack,
  onJoinPremium,
  onSelectMovie,
  onSaveProgress,
  onNotify,
}: VideoPlayerViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const [activeEpisodeId, setActiveEpisodeId] = useState<string>(
    initialEpisodeId || movie.userLibrary?.lastEpisodeId || episodes[0]?.id || '',
  );
  const activeEpisode = useMemo(
    () => episodes.find((e) => e.id === activeEpisodeId) || null,
    [episodes, activeEpisodeId],
  );

  const isPremiumMember = user?.subscription_tier === 'premium';
  const [selectedQuality, setSelectedQuality] = useState<string>(
    settings?.auto_quality === 0 && settings?.default_quality ? settings.default_quality : 'auto',
  );

  const baseSourceUrl = activeEpisode?.sourceUrl || movie.sourceUrl;
  const effectiveSourceUrl =
    isPremiumMember && selectedQuality === '1080p Premium HD' && movie.premiumStreamUrl
      ? movie.premiumStreamUrl
      : baseSourceUrl;
  const effectiveEmbedUrl = activeEpisode?.embedUrl || movie.embedUrl;
  const effectiveQualities = useMemo(() => {
    const raw = activeEpisode?.availableQualities?.length
      ? activeEpisode.availableQualities
      : movie.availableQualities;
    return raw.filter((q) => {
      const m = /^(\d+)p/.exec(q);
      return !m || Number(m[1]) <= 1080;
    });
  }, [activeEpisode, movie.availableQualities]);
  const effectiveIntroEnd = activeEpisode?.introEndSeconds ?? movie.introEndSeconds ?? 0;

  // ALL FILMS ARE FREE TO WATCH — never lock playback behind Premium
  const isNativeVideo =
    movie.playbackSupported &&
    (movie.sourceType === 'hls' || movie.sourceType === 'mp4' || movie.sourceType === 'uploaded') &&
    Boolean(effectiveSourceUrl);
  const isEmbedVideo = movie.playbackSupported && !isNativeVideo && Boolean(effectiveEmbedUrl);

  const autoPlayEnabled = settings?.auto_play !== 0;
  const autoResumeEnabled = settings?.auto_resume !== 0;
  const syncProgressEnabled = settings?.sync_progress !== 0 && settings?.hide_watch_history !== 1;

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [networkNotice, setNetworkNotice] = useState<string>('');
  const resumeSaved = movie.userLibrary?.progressSeconds || 0;
  const [currentTime, setCurrentTime] = useState(autoResumeEnabled ? resumeSaved : 0);
  const [duration, setDuration] = useState(activeEpisode?.durationSeconds || movie.durationSeconds || 0);
  const [volume, setVolume] = useState(settings?.default_volume ?? 0.85);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(settings?.default_speed ?? 1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showSettingsPanel, setShowSettingsPanel] = useState<'none' | 'quality' | 'subtitle' | 'audio'>('none');
  const [resumeToastVisible, setResumeToastVisible] = useState(resumeSaved > 2);

  // Quality state (only truly available qualities up to 1080p standard + Premium HD if source supports it)
  const [hlsLevels, setHlsLevels] = useState<
    Array<{ index: number; label: string; height: number; bitrate: number; isPremiumHd?: boolean }>
  >([]);
  const [activePlayingQuality, setActivePlayingQuality] = useState<string>('Auto');

  // Audio state
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<string>(movie.audioTracks[0]?.id || 'orig');
  const [audioSyncOffset, setAudioSyncOffset] = useState<number>(0);

  // Subtitle state
  const preferredSubLang = settings?.default_subtitle_lang || 'id';
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(
    settings?.auto_subtitle !== 0 && preferredSubLang !== 'off',
  );
  const [activeSubId, setActiveSubId] = useState<string>(
    subtitles.find((s) => s.language_code === preferredSubLang)?.id ||
      subtitles.find((s) => s.is_default === 1)?.id ||
      subtitles[0]?.id ||
      '',
  );
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [customSubLabel, setCustomSubLabel] = useState<string>('');
  const [subFontSize, setSubFontSize] = useState<number>(settings?.subtitle_font_size ?? 18);
  const [subColor, setSubColor] = useState<string>(settings?.subtitle_color ?? '#FFFFFF');
  const [subPosition, setSubPosition] = useState<'bottom' | 'top'>(settings?.subtitle_position ?? 'bottom');
  const [subSyncOffset, setSubSyncOffset] = useState<number>(0);
  const [translatingSub, setTranslatingSub] = useState(false);

  const hasSeparatePremiumHd = Boolean(movie.premiumStreamUrl);

  // Record view once (all films free — server enforces bot/30-min cooldown)
  useEffect(() => {
    fetch(`/api/movies/${encodeURIComponent(movie.id)}/view`, { method: 'POST' }).catch(() => {});
  }, [movie.id]);

  useEffect(() => {
    if (!resumeToastVisible) return;
    const t = window.setTimeout(() => setResumeToastVisible(false), 6000);
    return () => window.clearTimeout(t);
  }, [resumeToastVisible]);

  // Load subtitle track
  useEffect(() => {
    if (!activeSubId || activeSubId === 'custom') return;
    fetch(`/api/subtitles/${encodeURIComponent(activeSubId)}/vtt`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((txt) => {
        if (txt) setSubtitleCues(parseVttOrSrt(txt));
      })
      .catch(() => {});
  }, [activeSubId]);

  // Initialize HLS / MP4 video with adaptive ABR + network recovery
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isNativeVideo) return;

    let retryCount = 0;
    let destroyed = false;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const applyStartupPreferences = () => {
      if (autoResumeEnabled && resumeSaved > 2 && resumeSaved < (video.duration || Infinity) - 2) {
        video.currentTime = resumeSaved;
      }
      video.volume = volume;
      video.playbackRate = playbackRate;
      if (autoPlayEnabled) {
        void video.play().catch(() => {});
      }
    };

    if (effectiveSourceUrl.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 60,
          maxBufferLength: 30,
          startLevel: -1,
        });
        hlsRef.current = hls;
        hls.loadSource(effectiveSourceUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          if (destroyed) return;
          const rawLevels = data.levels
            .map((lvl, idx) => ({
              index: idx,
              height: lvl.height || 0,
              bitrate: lvl.bitrate || 0,
              label: lvl.height ? `${lvl.height}p` : `Level ${idx + 1}`,
            }))
            .filter((lvl) => lvl.height <= 1080 || lvl.height === 0);

          // If manifest contains multiple 1080p variants, treat the highest-bitrate 1080p variant as 1080p Premium HD
          const fullHdVariants = rawLevels.filter((l) => l.height === 1080).sort((a, b) => b.bitrate - a.bitrate);
          const highest1080Idx = fullHdVariants.length > 1 ? fullHdVariants[0].index : -1;

          const levels = rawLevels.map((lvl) => ({
            ...lvl,
            label: lvl.index === highest1080Idx ? '1080p Premium HD' : lvl.label,
            isPremiumHd: lvl.index === highest1080Idx,
          }));

          setHlsLevels(levels);

          if (selectedQuality !== 'auto') {
            const target = levels.find(
              (l) => l.label === selectedQuality && (!l.isPremiumHd || isPremiumMember),
            );
            if (target) {
              hls.currentLevel = target.index;
              setActivePlayingQuality(target.label);
            } else {
              const standard1080 = levels.filter((l) => !l.isPremiumHd).pop();
              setActivePlayingQuality(standard1080 ? `Auto (${standard1080.label})` : 'Auto');
            }
          } else {
            const standardTop = levels.filter((l) => !l.isPremiumHd || isPremiumMember).pop();
            setActivePlayingQuality(standardTop ? `Auto (${standardTop.label})` : 'Auto');
          }

          applyStartupPreferences();
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
          const lvl = hls.levels[data.level];
          if (lvl?.height) {
            setActivePlayingQuality(hls.autoLevelEnabled ? `Auto (${lvl.height}p)` : `${lvl.height}p`);
          }
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) {
            if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR && hls.currentLevel > 0) {
              hls.nextLevel = Math.max(0, hls.currentLevel - 1);
              setNetworkNotice('Koneksi melambat — menurunkan kualitas secara otomatis.');
              setTimeout(() => setNetworkNotice(''), 4000);
            }
            return;
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            retryCount += 1;
            if (retryCount <= 4) {
              setNetworkNotice(`Koneksi terputus — menyambungkan kembali (${retryCount}/4)...`);
              setTimeout(() => {
                if (!destroyed) hls.startLoad(video.currentTime);
              }, 1200 * retryCount);
            } else {
              setNetworkNotice('Koneksi tidak stabil. Tekan Sambungkan Ulang.');
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = effectiveSourceUrl;
        video.addEventListener('loadedmetadata', applyStartupPreferences, { once: true });
      }
    } else {
      video.src = effectiveSourceUrl;
      setHlsLevels([]);
      const topStandard = effectiveQualities[effectiveQualities.length - 1] || '1080p';
      setActivePlayingQuality(selectedQuality === '1080p Premium HD' && isPremiumMember ? '1080p Premium HD' : topStandard);
      video.addEventListener('loadedmetadata', applyStartupPreferences, { once: true });
    }

    return () => {
      destroyed = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSourceUrl, isNativeVideo, isPremiumMember]);

  // Cross-device progress sync (respects sync_progress & hide_watch_history settings)
  const syncNow = useCallback(
    (keepalive = false) => {
      if (!user || !syncProgressEnabled || !videoRef.current) return;
      const pos = Math.floor(videoRef.current.currentTime);
      const dur = Math.floor(videoRef.current.duration || duration);
      if (pos > 0) {
        onSaveProgress(movie.id, pos, dur, dur > 0 && pos >= dur - 5, activeEpisodeId, keepalive);
      }
    },
    [user, syncProgressEnabled, duration, movie.id, activeEpisodeId, onSaveProgress],
  );

  useEffect(() => {
    if (!user || !syncProgressEnabled) return;
    const interval = window.setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        syncNow(false);
      }
    }, 5000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') syncNow(true);
    };
    const onPageHide = () => syncNow(true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      syncNow(true);
    };
  }, [user, syncProgressEnabled, syncNow]);

  const pokeControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (isPlaying && showSettingsPanel === 'none') {
        setControlsVisible(false);
      }
    }, 3200);
  }, [isPlaying, showSettingsPanel]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
      syncNow(false);
    }
    pokeControls();
  }, [syncNow, pokeControls]);

  const handleSeekBy = useCallback(
    (deltaSeconds: number) => {
      const v = videoRef.current;
      if (!v) return;
      const maxDur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : duration || 36000;
      const next = Math.max(0, Math.min(maxDur, v.currentTime + deltaSeconds));
      v.currentTime = next;
      setCurrentTime(next);
      pokeControls();
    },
    [duration, pokeControls],
  );

  const handleStop = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    if (user && syncProgressEnabled) {
      onSaveProgress(movie.id, 0, Math.floor(v.duration || duration), false, activeEpisodeId, false);
    }
    pokeControls();
  };

  const handleRestart = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    setCurrentTime(0);
    setResumeToastVisible(false);
    void v.play();
    setIsPlaying(true);
    pokeControls();
  };

  const handleResumeManually = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = resumeSaved;
    setCurrentTime(resumeSaved);
    setResumeToastVisible(false);
    void v.play().catch(() => {});
    setIsPlaying(true);
  };

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // ignore
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (!isNativeVideo) return;

      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSeekBy(-10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSeekBy(10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nextVol = Math.min(1, Number((volume + 0.1).toFixed(2)));
        setVolume(nextVol);
        setMuted(false);
        if (videoRef.current) {
          videoRef.current.volume = nextVol;
          videoRef.current.muted = false;
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextVol = Math.max(0, Number((volume - 0.1).toFixed(2)));
        setVolume(nextVol);
        setMuted(nextVol === 0);
        if (videoRef.current) {
          videoRef.current.volume = nextVol;
          videoRef.current.muted = nextVol === 0;
        }
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        void handleToggleFullscreen();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const nextMuted = !muted;
        setMuted(nextMuted);
        if (videoRef.current) videoRef.current.muted = nextMuted;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isNativeVideo, togglePlay, handleSeekBy, volume, muted, handleToggleFullscreen]);

  const handleQualityChange = (label: string, isPremiumHd = false) => {
    if (isPremiumHd && !isPremiumMember) {
      onNotify('Kualitas 1080p Premium HD (bitrate tinggi) tersedia khusus anggota Premium. Anda tetap bisa menonton gratis hingga 1080p standar.');
      onJoinPremium();
      return;
    }

    setSelectedQuality(label);
    const hls = hlsRef.current;
    if (hls) {
      if (label === 'auto') {
        hls.currentLevel = -1;
        setActivePlayingQuality('Auto');
      } else {
        const match = hlsLevels.find((l) => l.label === label);
        if (match) {
          hls.currentLevel = match.index;
          setActivePlayingQuality(match.label);
        }
      }
    } else {
      setActivePlayingQuality(label);
    }
    setShowSettingsPanel('none');
  };

  const handleTogglePiP = async () => {
    try {
      const v = videoRef.current;
      if (!v) return;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
      }
    } catch {
      onNotify('Mode Picture-in-Picture tidak didukung di browser ini.', true);
    }
  };

  const handleUploadCustomSubtitle = (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.srt') && !ext.endsWith('.vtt')) {
      onNotify('Hanya file subtitle .srt atau .vtt yang didukung.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (/<script|javascript:/i.test(text)) {
        onNotify('File subtitle ditolak oleh pemindai keamanan.', true);
        return;
      }
      setSubtitleCues(parseVttOrSrt(text));
      setActiveSubId('custom');
      setCustomSubLabel(file.name);
      setSubtitlesEnabled(true);
      onNotify(`Subtitle "${file.name}" berhasil dimuat.`);
    };
    reader.readAsText(file);
  };

  const handleTranslateSubtitleAi = async () => {
    if (!activeSubId || activeSubId === 'custom') {
      onNotify('Pilih subtitle yang tersimpan di server terlebih dahulu untuk diterjemahkan AI.', true);
      return;
    }
    setTranslatingSub(true);
    try {
      const res = await fetch('/api/subtitles/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitleId: activeSubId,
          targetLanguage: lang === 'id' ? 'Bahasa Indonesia' : 'English',
        }),
      });
      const data = (await res.json()) as { translatedVtt?: string; languageLabel?: string; error?: string };
      if (!res.ok || !data.translatedVtt) {
        onNotify(data.error || 'Terjemahan AI gagal.', true);
        return;
      }
      setSubtitleCues(parseVttOrSrt(data.translatedVtt));
      setActiveSubId('custom');
      setCustomSubLabel(data.languageLabel || 'AI Translated');
      setSubtitlesEnabled(true);
      onNotify('Subtitle berhasil diterjemahkan menggunakan Gemini AI.');
    } catch {
      onNotify('Gagal menghubungi layanan terjemahan AI.', true);
    } finally {
      setTranslatingSub(false);
    }
  };

  const activeCueText = useMemo(() => {
    if (!subtitlesEnabled || subtitleCues.length === 0) return '';
    const adjusted = currentTime + subSyncOffset;
    const cue = subtitleCues.find((c) => adjusted >= c.start && adjusted <= c.end);
    return cue?.text || '';
  }, [subtitlesEnabled, subtitleCues, currentTime, subSyncOffset]);

  const nextEpisode = useMemo(() => {
    if (!activeEpisode || episodes.length <= 1) return null;
    const idx = episodes.findIndex((e) => e.id === activeEpisode.id);
    return idx >= 0 && idx < episodes.length - 1 ? episodes[idx + 1] : null;
  }, [activeEpisode, episodes]);

  // Build quality menu strictly from real available levels/qualities
  const qualityOptions = useMemo(() => {
    if (hlsLevels.length > 0) {
      return hlsLevels.map((l) => ({
        label: l.label,
        isPremiumHd: Boolean(l.isPremiumHd),
      }));
    }
    const base = effectiveQualities
      .filter((q) => q !== 'Auto' && q !== '1080p Premium HD')
      .map((q) => ({ label: q, isPremiumHd: false }));
    if (hasSeparatePremiumHd) {
      base.push({ label: '1080p Premium HD', isPremiumHd: true });
    }
    return base;
  }, [hlsLevels, effectiveQualities, hasSeparatePremiumHd]);

  return (
    <div className="min-h-screen bg-[#080808] pt-16 text-white">
      <div
        ref={containerRef}
        onMouseMove={pokeControls}
        onTouchStart={pokeControls}
        className="relative mx-auto w-full bg-black select-none"
      >
        {/* Top Floating Player Header */}
        <div
          className={`absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-4 bg-gradient-to-b from-black/90 via-black/45 to-transparent px-4 py-4 sm:px-8 transition-opacity duration-200 ${
            controlsVisible || !isNativeVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                syncNow(false);
                playUiSound('nav');
                onBack();
              }}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs font-medium text-white hover:border-[#FF163D] transition shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{lang === 'id' ? 'Kembali' : 'Back'}</span>
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-sm sm:text-base font-bold text-white truncate">
                {movie.title}
                {activeEpisode ? ` — ${activeEpisode.title}` : ''}
              </h1>
              <p className="text-[11px] text-zinc-400 truncate">
                {activePlayingQuality} · {movie.audioTracks[0]?.channels || 'Stereo 2.0'} ·{' '}
                <span className="text-emerald-400 font-semibold">{lang === 'id' ? 'Gratis' : 'Free'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <FlixfilLogo size="sm" className="hidden md:inline-flex" />
            {movie.sourceUrl && !movie.sourceUrl.startsWith('/streams/') && (
              <a
                href={movie.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-[#FF163D] hover:text-white transition"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{lang === 'id' ? 'Sumber Asli' : 'Original Source'}</span>
              </a>
            )}
          </div>
        </div>

        {/* Player Stage (All films open & playable for all visitors) */}
        <div className="relative aspect-video max-h-[82vh] w-full bg-black flex items-center justify-center overflow-hidden">
          {isNativeVideo ? (
            <>
              <video
                ref={videoRef}
                playsInline
                onClick={togglePlay}
                onTimeUpdate={() => {
                  if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
                    setDuration(videoRef.current.duration);
                  }
                }}
                onWaiting={() => setIsBuffering(true)}
                onPlaying={() => {
                  setIsBuffering(false);
                  setIsPlaying(true);
                }}
                onPause={() => {
                  setIsPlaying(false);
                  syncNow(false);
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  if (user && syncProgressEnabled) {
                    onSaveProgress(movie.id, Math.floor(duration), Math.floor(duration), true, activeEpisodeId, false);
                  }
                  if (nextEpisode) setActiveEpisodeId(nextEpisode.id);
                }}
                className="h-full w-full object-contain bg-black cursor-pointer"
              />

              {/* Resume Position Indicator */}
              {resumeToastVisible && (
                <div className="absolute top-20 right-6 z-30 flex items-center gap-3 rounded-xl border border-[#FF163D]/40 bg-black/85 px-4 py-2 text-xs text-white">
                  <span>
                    {autoResumeEnabled ? 'Melanjutkan dari ' : 'Posisi tersimpan: '}
                    <strong className="font-mono-tabular text-[#FF163D]">{formatDuration(resumeSaved)}</strong>
                  </span>
                  {!autoResumeEnabled && (
                    <button
                      type="button"
                      onClick={handleResumeManually}
                      className="rounded bg-[#FF163D] px-2.5 py-0.5 text-[11px] font-semibold text-white"
                    >
                      Lanjutkan
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="rounded border border-white/20 px-2 py-0.5 text-[11px] hover:border-[#FF163D]"
                  >
                    Mulai Ulang
                  </button>
                </div>
              )}

              {/* Subtitle Overlay */}
              {activeCueText && (
                <div
                  className={`pointer-events-none absolute inset-x-6 z-20 flex justify-center text-center ${
                    subPosition === 'top' ? 'top-20' : 'bottom-24 sm:bottom-28'
                  }`}
                >
                  <span
                    className="max-w-3xl rounded-md bg-black/75 px-3.5 py-1.5 font-medium leading-snug shadow-lg whitespace-pre-line"
                    style={{ fontSize: `${subFontSize}px`, color: subColor }}
                  >
                    {activeCueText}
                  </span>
                </div>
              )}

              {/* Buffering / Network Stability Notice */}
              {(isBuffering || networkNotice) && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-lg border border-white/15 bg-black/85 px-4 py-2 text-xs text-zinc-200">
                  {networkNotice ? (
                    <AlertTriangle className="h-4 w-4 text-[#FF163D] shrink-0" />
                  ) : (
                    <RefreshCw className="h-4 w-4 animate-spin text-[#FF163D] shrink-0" />
                  )}
                  <span>{networkNotice || 'Menyesuaikan buffer adaptif...'}</span>
                  {networkNotice && hlsRef.current && (
                    <button
                      type="button"
                      onClick={() => {
                        setNetworkNotice('');
                        hlsRef.current?.startLoad(currentTime);
                      }}
                      className="ml-2 rounded bg-[#FF163D] px-2 py-0.5 text-[11px] font-semibold text-white"
                    >
                      Sambungkan Ulang
                    </button>
                  )}
                </div>
              )}

              {/* Skip Intro */}
              {effectiveIntroEnd > 0 && currentTime > 1 && currentTime < effectiveIntroEnd && (
                <button
                  type="button"
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime = effectiveIntroEnd;
                  }}
                  className="absolute right-6 bottom-28 z-30 flex items-center gap-2 rounded-lg border border-white/25 bg-black/80 px-4 py-2 text-xs font-semibold text-white hover:border-[#FF163D] transition"
                >
                  <FastForward className="h-3.5 w-3.5 text-[#FF163D]" />
                  Lewati Intro
                </button>
              )}

              {/* Bottom Controls Bar (Supports up to 10h / 36,000s) */}
              <div
                className={`absolute bottom-0 inset-x-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-4 pb-4 pt-10 sm:px-8 transition-opacity duration-200 ${
                  controlsVisible || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                {/* Seekbar */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="font-mono-tabular text-xs text-zinc-300 w-16 shrink-0">
                    {formatDuration(currentTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, duration)}
                    step={0.5}
                    value={currentTime}
                    onChange={(e) => {
                      const t = Number(e.target.value);
                      setCurrentTime(t);
                      if (videoRef.current) videoRef.current.currentTime = t;
                    }}
                    aria-label="Timeline pemutaran"
                    className="h-2 flex-1 cursor-pointer accent-[#FF163D]"
                  />
                  <span className="font-mono-tabular text-xs text-zinc-400 w-24 text-right shrink-0">
                    -{formatDuration(Math.max(0, duration - currentTime))}
                  </span>
                </div>

                {/* Action Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={isPlaying ? 'Pause' : 'Play / Resume'}
                      title="Play / Pause (Spasi)"
                      className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#FF163D] text-white hover:bg-[#e01034]"
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={handleStop}
                      aria-label="Stop"
                      title="Stop & Reset"
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-black/50 text-zinc-200 hover:border-[#FF163D] hover:text-white"
                    >
                      <Square className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSeekBy(-10)}
                      aria-label="Mundur 10 detik"
                      title="Mundur 10 detik (Panah Kiri)"
                      className="flex h-11 px-2.5 items-center justify-center gap-1 rounded-lg border border-white/15 bg-black/50 text-xs font-mono-tabular text-zinc-200 hover:border-[#FF163D] hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>10s</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSeekBy(10)}
                      aria-label="Maju 10 detik"
                      title="Maju 10 detik (Panah Kanan)"
                      className="flex h-11 px-2.5 items-center justify-center gap-1 rounded-lg border border-white/15 bg-black/50 text-xs font-mono-tabular text-zinc-200 hover:border-[#FF163D] hover:text-white"
                    >
                      <span>10s</span>
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>

                    <div className="flex items-center gap-2 ml-1">
                      <button
                        type="button"
                        onClick={() => {
                          const nextMuted = !muted;
                          setMuted(nextMuted);
                          if (videoRef.current) videoRef.current.muted = nextMuted;
                        }}
                        aria-label="Bisukan suara"
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white"
                      >
                        {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={muted ? 0 : volume}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setVolume(v);
                          setMuted(v === 0);
                          if (videoRef.current) {
                            videoRef.current.volume = v;
                            videoRef.current.muted = v === 0;
                          }
                        }}
                        aria-label="Volume"
                        className="hidden sm:block w-20 accent-[#FF163D] cursor-pointer"
                      />
                    </div>

                    {nextEpisode && (
                      <button
                        type="button"
                        onClick={() => setActiveEpisodeId(nextEpisode.id)}
                        className="flex h-11 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-medium text-white hover:border-[#FF163D]"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        <span className="hidden md:inline">Episode Berikutnya</span>
                      </button>
                    )}
                  </div>

                  {/* Right Controls: Quality, Subtitle, Audio/Speed, PiP, Fullscreen */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSettingsPanel((p) => (p === 'quality' ? 'none' : 'quality'))}
                      className="h-11 rounded-lg border border-white/15 bg-black/60 px-3 text-xs font-medium text-zinc-200 hover:border-[#FF163D]"
                    >
                      {activePlayingQuality}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSettingsPanel((p) => (p === 'subtitle' ? 'none' : 'subtitle'))}
                      aria-label="Pengaturan subtitle"
                      className={`flex h-11 items-center gap-1 rounded-lg border px-3 text-xs font-medium transition ${
                        subtitlesEnabled
                          ? 'border-[#FF163D]/60 bg-[#FF163D]/15 text-white'
                          : 'border-white/15 bg-black/60 text-zinc-400'
                      }`}
                    >
                      <Captions className="h-4 w-4" />
                      <span className="hidden sm:inline">Subtitle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSettingsPanel((p) => (p === 'audio' ? 'none' : 'audio'))}
                      aria-label="Pengaturan audio dan kecepatan"
                      className="flex h-11 items-center gap-1 rounded-lg border border-white/15 bg-black/60 px-3 text-xs font-medium text-zinc-200 hover:border-[#FF163D]"
                    >
                      <Sliders className="h-3.5 w-3.5" />
                      <span className="font-mono-tabular">{playbackRate}x</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleTogglePiP}
                      aria-label="Picture in Picture"
                      className="hidden sm:flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white"
                    >
                      <PictureInPicture2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleFullscreen}
                      aria-label="Layar penuh"
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white"
                    >
                      {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Quality / Subtitle / Audio Settings Popover */}
              {showSettingsPanel !== 'none' && (
                <div className="absolute right-4 bottom-24 z-40 w-80 max-w-[92vw] rounded-xl border border-white/15 bg-[#171717]/95 p-4 shadow-2xl backdrop-blur-md">
                  {showSettingsPanel === 'quality' && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                        Kualitas Video Tersedia
                      </h3>
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => handleQualityChange('auto')}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs ${
                            selectedQuality === 'auto' ? 'bg-[#FF163D] text-white' : 'text-zinc-300 hover:bg-white/5'
                          }`}
                        >
                          <span>Auto (Adaptif)</span>
                          <span className="font-mono-tabular">{activePlayingQuality}</span>
                        </button>
                        {qualityOptions.map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => handleQualityChange(opt.label, opt.isPremiumHd)}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs ${
                              selectedQuality === opt.label
                                ? 'bg-[#FF163D] text-white'
                                : 'text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              {opt.isPremiumHd && <Crown className="h-3.5 w-3.5 text-amber-400" />}
                              <span>{opt.label}</span>
                            </span>
                            {opt.isPremiumHd ? (
                              <span className="text-[10px] font-semibold text-amber-300">
                                {isPremiumMember ? 'Bitrate Tinggi' : 'Premium'}
                              </span>
                            ) : opt.label === '1080p' ? (
                              <span className="text-[10px] font-semibold text-emerald-400">Standar Gratis</span>
                            ) : opt.label === '720p' ? (
                              <span className="text-[10px] font-semibold">HD</span>
                            ) : null}
                          </button>
                        ))}
                        <p className="mt-2 text-[11px] text-zinc-400 border-t border-white/10 pt-2">
                          Semua film gratis ditonton hingga 1080p standar.
                          {!isPremiumMember &&
                            qualityOptions.some((o) => o.isPremiumHd) &&
                            ' Paket Premium membuka bitrate 1080p Premium HD.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {showSettingsPanel === 'subtitle' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Pengaturan Subtitle
                        </h3>
                        <button
                          type="button"
                          onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            subtitlesEnabled ? 'bg-[#FF163D] text-white' : 'bg-white/10 text-zinc-300'
                          }`}
                        >
                          {subtitlesEnabled ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </div>

                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {subtitles.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setActiveSubId(s.id);
                              setSubtitlesEnabled(true);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs ${
                              activeSubId === s.id ? 'bg-[#FF163D] text-white' : 'text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            <span>{s.language_label}</span>
                            <span className="uppercase text-[10px]">{s.format}</span>
                          </button>
                        ))}
                        {customSubLabel && (
                          <div className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white">
                            Aktif: {customSubLabel}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-[#FF163D]">
                          <Upload className="h-3.5 w-3.5" />
                          <span>Unggah SRT/VTT</span>
                          <input
                            type="file"
                            accept=".srt,.vtt"
                            className="hidden"
                            onChange={(e) => handleUploadCustomSubtitle(e.target.files?.[0])}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={translatingSub}
                          onClick={handleTranslateSubtitleAi}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#FF163D]/20 border border-[#FF163D]/50 px-2.5 py-1.5 text-xs text-white hover:bg-[#FF163D]/35 disabled:opacity-50"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-[#FF163D]" />
                          <span>{translatingSub ? 'Menerjemahkan...' : 'Terjemah AI'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2 text-xs">
                        <label className="space-y-1">
                          <span className="text-zinc-400">Ukuran ({subFontSize}px)</span>
                          <input
                            type="range"
                            min={14}
                            max={28}
                            value={subFontSize}
                            onChange={(e) => setSubFontSize(Number(e.target.value))}
                            className="w-full accent-[#FF163D]"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-zinc-400">Sinkron ({subSyncOffset > 0 ? `+${subSyncOffset}` : subSyncOffset}s)</span>
                          <input
                            type="range"
                            min={-10}
                            max={10}
                            step={0.5}
                            value={subSyncOffset}
                            onChange={(e) => setSubSyncOffset(Number(e.target.value))}
                            className="w-full accent-[#FF163D]"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-zinc-400">Warna Teks</span>
                          <select
                            value={subColor}
                            onChange={(e) => setSubColor(e.target.value)}
                            className="w-full rounded bg-black/60 border border-white/10 px-2 py-1 text-xs text-white"
                          >
                            <option value="#FFFFFF">Putih</option>
                            <option value="#FDE047">Kuning Sinema</option>
                            <option value="#67E8F9">Biru Muda</option>
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-zinc-400">Posisi</span>
                          <select
                            value={subPosition}
                            onChange={(e) => setSubPosition(e.target.value === 'top' ? 'top' : 'bottom')}
                            className="w-full rounded bg-black/60 border border-white/10 px-2 py-1 text-xs text-white"
                          >
                            <option value="bottom">Bawah</option>
                            <option value="top">Atas</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  )}

                  {showSettingsPanel === 'audio' && (
                    <div className="space-y-3 text-xs">
                      <h3 className="font-semibold uppercase tracking-wider text-zinc-400">
                        Audio &amp; Kecepatan Pemutaran
                      </h3>

                      <div>
                        <p className="text-zinc-400 mb-1.5">Track Audio</p>
                        {movie.audioTracks.map((tr) => (
                          <button
                            key={tr.id}
                            type="button"
                            onClick={() => setSelectedAudioTrack(tr.id)}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 mb-1 ${
                              selectedAudioTrack === tr.id ? 'bg-[#FF163D] text-white' : 'bg-black/40 text-zinc-300'
                            }`}
                          >
                            <span>{tr.label}</span>
                            <span className="text-[10px] opacity-80">{tr.channels}</span>
                          </button>
                        ))}
                      </div>

                      <div>
                        <p className="text-zinc-400 mb-1.5">Kecepatan</p>
                        <div className="grid grid-cols-6 gap-1">
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                            <button
                              key={spd}
                              type="button"
                              onClick={() => {
                                setPlaybackRate(spd);
                                if (videoRef.current) videoRef.current.playbackRate = spd;
                              }}
                              className={`rounded py-1 font-mono-tabular ${
                                playbackRate === spd ? 'bg-[#FF163D] text-white' : 'bg-black/50 text-zinc-300'
                              }`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="block space-y-1 border-t border-white/10 pt-2">
                        <span className="text-zinc-400">
                          Sinkronisasi Audio ({audioSyncOffset}ms)
                        </span>
                        <input
                          type="range"
                          min={-500}
                          max={500}
                          step={50}
                          value={audioSyncOffset}
                          onChange={(e) => setAudioSyncOffset(Number(e.target.value))}
                          className="w-full accent-[#FF163D]"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : isEmbedVideo ? (
            <iframe
              src={effectiveEmbedUrl}
              title={movie.title}
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex flex-col items-center justify-center px-6 text-center max-w-lg">
              <ExternalLink className="h-12 w-12 text-[#FF163D] mb-4" />
              <h2 className="font-display text-xl font-bold text-white">
                Pemutaran di Platform Resmi Asli
              </h2>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Sumber tautan ini dilindungi oleh sistem DRM / kebijakan embed penyedia asli. FLIXFIL tidak melewati DRM dan menyediakan akses langsung ke aplikasi resmi.
              </p>
              {movie.sourceUrl && (
                <a
                  href={movie.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF163D] px-6 py-3 text-sm font-semibold text-white hover:bg-[#e01034]"
                >
                  <ExternalLink className="h-4 w-4" />
                  Buka di Aplikasi Asli
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Episodes + Related below player */}
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 lg:px-12 space-y-8">
        {episodes.length > 0 && (
          <div>
            <h2 className="font-display text-lg font-bold text-white mb-4">Daftar Episode</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {episodes.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => setActiveEpisodeId(ep.id)}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
                    ep.id === activeEpisodeId
                      ? 'border-[#FF163D] bg-[#FF163D]/10'
                      : 'border-white/10 bg-[#171717] hover:border-white/25'
                  }`}
                >
                  <div className="flex w-full items-center justify-between text-xs text-zinc-400">
                    <span>Musim {ep.seasonNumber} · Ep {ep.episodeNumber}</span>
                    <span className="font-mono-tabular">{formatDuration(ep.durationSeconds)}</span>
                  </div>
                  <p className="mt-1 font-semibold text-sm text-white">{ep.title}</p>
                  <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{ep.synopsis}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {relatedMovies.length > 0 && (
          <div>
            <h2 className="font-display text-lg font-bold text-white mb-4">Film Terkait</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {relatedMovies.map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => onSelectMovie(rel)}
                  className="text-left group"
                >
                  <div className="aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-[#171717] group-hover:border-[#FF163D]/70 transition">
                    <FilmPoster movie={rel} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-white truncate group-hover:text-[#FF163D]">
                    {rel.title}
                  </p>
                  <p className="text-[11px] text-zinc-400">{rel.releaseYear} · {rel.category}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
