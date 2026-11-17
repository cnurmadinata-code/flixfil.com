import { useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronRight,
  Compass,
  Info,
  Pin,
  Play,
  RotateCcw,
  Trash2,
  User,
} from 'lucide-react';
import type { LanguageCode, Movie, UserProfile } from '../types';
import { playUiSound } from '../utils/audioUi';
import { COPY, formatDuration } from '../utils/i18n';
import { FlixfilLogo } from '../components/FlixfilLogo';
import { FilmPoster } from '../components/FilmPoster';
import { MovieCarousel } from '../components/MovieCarousel';

interface HomePageProps {
  movies: Movie[];
  categories?: string[];
  heroAutoFeature: boolean;
  trendingEnabled?: boolean;
  dashboardDensity?: 'comfortable' | 'compact';
  user: UserProfile | null;
  lang: LanguageCode;
  onSelectMovie: (movie: Movie) => void;
  onWatchMovie: (movie: Movie) => void;
  onRestartMovie: (movie: Movie) => void;
  onRemoveContinueWatching: (movie: Movie) => void;
  onToggleWatchlist: (movie: Movie) => void;
  onNavigateExplore: (category?: string) => void;
  onNavigateAuthOrRoom: () => void;
}

const DEFAULT_HOME_CATEGORIES = [
  'Film Indonesia',
  'Horor Indonesia',
  'Drama Indonesia',
  'Aksi Indonesia',
  'Komedi Indonesia',
  'Romantis Indonesia',
  'Klasik Indonesia',
  'Hollywood',
  'Korea',
  'Jepang',
  'Animasi',
  'Dokumenter',
];

export function HomePage({
  movies,
  categories,
  heroAutoFeature,
  trendingEnabled = true,
  dashboardDensity = 'comfortable',
  user,
  lang,
  onSelectMovie,
  onWatchMovie,
  onRestartMovie,
  onRemoveContinueWatching,
  onToggleWatchlist,
  onNavigateExplore,
  onNavigateAuthOrRoom,
}: HomePageProps) {
  const t = COPY[lang];
  const categoryList = categories && categories.length > 0 ? categories : DEFAULT_HOME_CATEGORIES;

  // Smart Hero Banner selection:
  // 1. Pinned by Admin (isPinnedHero)
  // 2. If Auto Feature is ON: highest Smart Trending score / fastest growth
  // 3. Fallback: Admin Featured / Curator Pick / Latest Published
  const heroCandidates = useMemo(() => {
    if (movies.length === 0) return [];
    const pinned = movies.filter((m) => m.isPinnedHero);
    const ranked = [...movies].sort((a, b) => {
      if (a.isPinnedHero && !b.isPinnedHero) return -1;
      if (!a.isPinnedHero && b.isPinnedHero) return 1;
      if (heroAutoFeature) {
        const diff = (b.trendingScore || 0) - (a.trendingScore || 0);
        if (diff !== 0) return diff;
        const gDiff = (b.growthRate || 0) - (a.growthRate || 0);
        if (gDiff !== 0) return gDiff;
      }
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
    });
    return pinned.length > 0 ? pinned : ranked.slice(0, 5);
  }, [movies, heroAutoFeature]);

  const [heroIdx, setHeroIdx] = useState(0);
  const hero = heroCandidates[heroIdx % Math.max(1, heroCandidates.length)] || null;

  // Continue Watching: ONLY started & incomplete films
  const continueWatching = useMemo(
    () =>
      movies
        .filter((m) => {
          const lib = m.userLibrary;
          if (!lib) return false;
          if (lib.watchStatus === 'completed') return false;
          return lib.progressSeconds > 0;
        })
        .sort((a, b) => {
          const ta = a.userLibrary?.lastWatchedAt ? new Date(a.userLibrary.lastWatchedAt).getTime() : 0;
          const tb = b.userLibrary?.lastWatchedAt ? new Date(b.userLibrary.lastWatchedAt).getTime() : 0;
          return tb - ta;
        }),
    [movies],
  );

  // Smart Trending: real activity only (no fake stats)
  const smartTrendingMovies = useMemo(
    () =>
      trendingEnabled
        ? [...movies]
            .filter((m) => (m.trendingScore || 0) > 0 || (m.viewCount || 0) > 0 || (m.favoriteCount || 0) > 0)
            .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
        : [],
    [movies, trendingEnabled],
  );

  const indonesiaMovies = useMemo(
    () => movies.filter((m) => m.country === 'Indonesia' || m.category.includes('Indonesia')),
    [movies],
  );
  const favoriteMovies = useMemo(() => movies.filter((m) => m.userLibrary?.isFavorite), [movies]);
  const latestMovies = useMemo(
    () =>
      [...movies].sort(
        (a, b) => new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime(),
      ),
    [movies],
  );
  const horrorIndonesia = useMemo(
    () => movies.filter((m) => m.category === 'Horor Indonesia' || (m.genres.includes('Horor') && m.country === 'Indonesia')),
    [movies],
  );
  const actionMovies = useMemo(
    () => movies.filter((m) => m.genres.includes('Aksi') || m.category.includes('Aksi')),
    [movies],
  );
  const internationalMovies = useMemo(() => movies.filter((m) => m.country !== 'Indonesia'), [movies]);
  const adminPicks = useMemo(() => movies.filter((m) => m.isAdminPick), [movies]);
  const premiumMovies = useMemo(() => movies.filter((m) => m.accessTier === 'premium'), [movies]);
  const freeMovies = useMemo(() => movies.filter((m) => m.accessTier === 'free'), [movies]);

  const heroWatchStatusLabel = (m: Movie) => {
    const st = m.userLibrary?.watchStatus;
    if (st === 'completed') return lang === 'id' ? 'Selesai Ditonton' : 'Completed';
    if (st === 'watching' || (m.userLibrary?.progressSeconds || 0) > 0) {
      return lang === 'id' ? 'Sedang Ditonton' : 'Watching';
    }
    return lang === 'id' ? 'Belum Ditonton' : 'Unwatched';
  };

  return (
    <div className="min-h-screen bg-[#080808] pb-16">
      {/* CLEAN EMPTY WELCOME HERO (0 dummy cards, 0 fake movies, no clock, no admin buttons) */}
      {movies.length === 0 ? (
        <section className="relative min-h-[78vh] w-full overflow-hidden pt-20 flex items-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,22,61,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(139,0,31,0.22),transparent_60%)]" />
          <div className="relative z-10 mx-auto w-full max-w-[1440px] px-4 py-14 sm:px-8 lg:px-12">
            <div className="max-w-3xl">
              <FlixfilLogo size="lg" />
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-[#FF163D]">
                Your Story. Your Screen.
              </p>
              <h1 className="mt-2 font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white [text-wrap:balance]">
                {lang === 'id'
                  ? 'Selamat Datang di Sinema Streaming FLIXFIL'
                  : 'Welcome to FLIXFIL Streaming Cinema'}
              </h1>
              <p className="mt-4 text-sm sm:text-base leading-relaxed text-zinc-300">
                {lang === 'id'
                  ? 'Semua film di FLIXFIL gratis ditonton hingga resolusi 1080p standar. Koleksi film resmi akan tampil otomatis di sini segera setelah dipublikasikan.'
                  : 'All films on FLIXFIL are free to watch up to 1080p standard quality. Curated releases appear here automatically once published.'}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    playUiSound('click');
                    onNavigateExplore('all');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FF163D] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#e01034] neon-red-glow"
                >
                  <Compass className="h-4 w-4" />
                  {lang === 'id' ? 'JELAJAHI KATALOG' : 'EXPLORE CATALOG'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playUiSound('click');
                    onNavigateAuthOrRoom();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#171717] px-5 py-3.5 text-sm font-semibold text-zinc-200 transition hover:border-[#FF163D]/60 hover:text-white"
                >
                  <User className="h-4 w-4 text-[#FF163D]" />
                  {user ? 'My Room' : lang === 'id' ? 'Masuk / Akun' : 'Sign In / Account'}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* AUTOMATIC / PINNED SMART HERO BANNER */
        hero && (
          <section className="relative min-h-[76vh] w-full overflow-hidden pt-16 flex items-end">
            <div className="absolute inset-0">
              <FilmPoster movie={hero} variant="backdrop" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#080808] via-[#080808]/82 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/40 to-black/50" />
            </div>

            <div className="relative z-10 mx-auto w-full max-w-[1440px] px-4 py-12 sm:px-8 lg:px-12">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.18em] text-[#FF163D] uppercase">
                  {hero.isPinnedHero && (
                    <span className="inline-flex items-center gap-1 rounded bg-[#FF163D]/20 px-2 py-0.5 text-[10px] text-[#FF163D]">
                      <Pin className="h-3 w-3" /> PINNED HERO
                    </span>
                  )}
                  <span>{t.heroKicker}</span>
                </div>

                <h1 className="mt-2 font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white [text-wrap:balance]">
                  {hero.title}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-zinc-300">
                  <span className="font-mono-tabular font-semibold text-white">{hero.releaseYear}</span>
                  <span aria-hidden="true">·</span>
                  <span>{hero.ageRating}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{formatDuration(hero.durationSeconds)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{hero.genres.slice(0, 3).join(' / ')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-zinc-200">{heroWatchStatusLabel(hero)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400 font-semibold">{t.freeBadge}</span>
                </div>

                <p className="mt-4 text-sm sm:text-base leading-relaxed text-zinc-300 line-clamp-3">
                  {hero.synopsis}
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      playUiSound('player');
                      onWatchMovie(hero);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#FF163D] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#e01034] neon-red-glow whitespace-nowrap"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    {(hero.userLibrary?.progressSeconds || 0) > 0 && hero.userLibrary?.watchStatus !== 'completed'
                      ? lang === 'id'
                        ? 'LANJUTKAN MENONTON'
                        : 'RESUME WATCHING'
                      : t.watchNow}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playUiSound('click');
                      onToggleWatchlist(hero);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-[#FF163D]/70 hover:bg-white/15 whitespace-nowrap"
                  >
                    {hero.userLibrary?.inWatchlist ? (
                      <>
                        <Check className="h-4 w-4 text-[#FF163D]" />
                        {lang === 'id' ? 'Di Daftar Saya' : 'In My List'}
                      </>
                    ) : (
                      <>
                        <Bookmark className="h-4 w-4" />
                        {t.myCollection}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playUiSound('click');
                      onSelectMovie(hero);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#171717]/80 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:text-white whitespace-nowrap"
                  >
                    <Info className="h-4 w-4" />
                    {lang === 'id' ? 'DETAIL' : 'DETAILS'}
                  </button>
                </div>

                {heroCandidates.length > 1 && (
                  <div className="mt-6 space-y-2.5">
                    <div className="flex items-center gap-2">
                      {heroCandidates.map((f, idx) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setHeroIdx(idx)}
                          aria-label={`Sorotan ${f.title}`}
                          className={`h-1.5 rounded-full transition-all ${
                            idx === heroIdx % heroCandidates.length
                              ? 'w-8 bg-[#FF163D]'
                              : 'w-2.5 bg-white/30 hover:bg-white/60'
                          }`}
                        />
                      ))}
                    </div>
                    <div
                      aria-hidden="true"
                      className="relative h-1 w-48 overflow-hidden rounded-full bg-white/15"
                    >
                      <div className="flixfil-pingpong-thumb h-full rounded-full bg-gradient-to-r from-[#8B001F] via-[#FF163D] to-[#ff4f6e]" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )
      )}

      {/* Category Navigation Strip (Always clean & accessible) */}
      <div className="mx-auto max-w-[1440px] px-4 pt-4 pb-2 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {categoryList.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  playUiSound('click');
                  onNavigateExplore(cat);
                }}
                className="rounded-lg border border-white/10 bg-[#171717] px-3 py-1.5 text-xs font-medium text-zinc-300 whitespace-nowrap shrink-0 transition hover:border-[#FF163D]/60 hover:text-white"
              >
                {cat}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onNavigateExplore()}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-[#FF163D] hover:underline whitespace-nowrap shrink-0"
          >
            <span>{t.exploreFilms}</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* CONTINUE WATCHING SECTION (Only started & incomplete films) */}
      {continueWatching.length > 0 && (
        <section className="mx-auto max-w-[1440px] px-4 pt-6 pb-2 sm:px-8 lg:px-12">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">{t.rowContinue}</h2>
              <p className="text-xs text-zinc-400">
                Posisi tontonan Anda tersimpan otomatis &amp; tersinkronisasi lintas perangkat.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {continueWatching.map((m) => {
              const dur = m.userLibrary?.durationSeconds || m.durationSeconds || 1;
              const prog = Math.min(dur, m.userLibrary?.progressSeconds || 0);
              const pct = Math.min(100, Math.max(1, Math.round((prog / dur) * 100)));
              const rem = Math.max(0, dur - prog);
              return (
                <div
                  key={m.id}
                  className="flex gap-4 rounded-2xl border border-white/10 bg-[#171717] p-3.5 transition hover:border-[#FF163D]/50"
                >
                  <button
                    type="button"
                    onClick={() => onWatchMovie(m)}
                    className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10"
                  >
                    <FilmPoster movie={m} />
                  </button>
                  <div className="min-w-0 flex-1 flex flex-col justify-between">
                    <div>
                      <button
                        type="button"
                        onClick={() => onSelectMovie(m)}
                        className="font-display text-sm font-bold text-white truncate block hover:text-[#FF163D] text-left w-full"
                      >
                        {m.title}
                      </button>
                      <p className="mt-1 font-mono-tabular text-[11px] text-zinc-400">
                        {pct}% · Ditonton {formatDuration(prog)} · Sisa {formatDuration(rem)}
                      </p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-[#FF163D]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onWatchMovie(m)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#FF163D] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#e01034]"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        LANJUTKAN MENONTON
                      </button>
                      <button
                        type="button"
                        onClick={() => onRestartMovie(m)}
                        title="Putar ulang dari 00:00"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-white/40 hover:text-white"
                      >
                        <RotateCcw className="h-3 w-3" />
                        RESTART
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveContinueWatching(m)}
                        aria-label={`Hapus ${m.title} dari daftar lanjutkan menonton`}
                        className="ml-auto rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* REAL CATALOG ROWS (Never empty boxes, never fake data) */}
      {movies.length > 0 && (
        <div className={dashboardDensity === 'compact' ? 'space-y-0 pt-1' : 'space-y-2 pt-2'}>
          {smartTrendingMovies.length > 0 && (
            <MovieCarousel
              title={t.rowTrending}
              movies={smartTrendingMovies}
              lang={lang}
              onSelectMovie={onSelectMovie}
              onQuickPlay={onWatchMovie}
            />
          )}

          {latestMovies.length > 0 && (
            <MovieCarousel
              title={t.rowLatest}
              movies={latestMovies}
              lang={lang}
              onSelectMovie={onSelectMovie}
              onQuickPlay={onWatchMovie}
            />
          )}

          {indonesiaMovies.length > 0 && (
            <MovieCarousel
              title={t.rowIndonesia}
              movies={indonesiaMovies}
              lang={lang}
              onSelectMovie={onSelectMovie}
              onQuickPlay={onWatchMovie}
            />
          )}

          {favoriteMovies.length > 0 && (
            <MovieCarousel
              title={t.favoritesHeadline}
              movies={favoriteMovies}
              lang={lang}
              onSelectMovie={onSelectMovie}
              onQuickPlay={onWatchMovie}
            />
          )}

          {horrorIndonesia.length > 0 && (
            <MovieCarousel
              title={t.rowHorrorId}
              movies={horrorIndonesia}
              lang={lang}
              onSelectMovie={onSelectMovie}
              onQuickPlay={onWatchMovie}
            />
          )}

          {actionMovies.length > 0 && (
            <MovieCarousel
              title={t.rowAction}
              movies={actionMovies}
              lang={lang}
              onSelectMovie={onSelectMovie}
              onQuickPlay={onWatchMovie}
            />
          )}

          {internationalMovies.length > 0 && (
            <MovieCarousel
              title={t.rowInternational}
              movies={internationalMovies}
              lang={lang}
              onSelectMovie={onSelectMovie}
              onQuickPlay={onWatchMovie}
            />
          )}

          {adminPicks.length > 0 && (
            <MovieCarousel
              title={t.rowAdminPicks}
              movies={adminPicks}
              lang={lang}
              onSelectMovie={onSelectMovie}
              onQuickPlay={onWatchMovie}
            />
          )}

          {premiumMovies.length > 0 && (
            <MovieCarousel
              title={t.rowPremium}
              movies={premiumMovies}
              lang={lang}
              onSelectMovie={onSelectMovie}
              onQuickPlay={onWatchMovie}
            />
          )}

          {freeMovies.length > 0 && (
            <MovieCarousel
              title={t.rowFree}
              movies={freeMovies}
              lang={lang}
              onSelectMovie={onSelectMovie}
              onQuickPlay={onWatchMovie}
            />
          )}
        </div>
      )}
    </div>
  );
}
