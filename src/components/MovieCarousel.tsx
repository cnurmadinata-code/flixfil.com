import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { Movie, LanguageCode } from '../types';
import { playUiSound } from '../utils/audioUi';
import { formatDuration } from '../utils/i18n';
import { FilmPoster } from './FilmPoster';

interface MovieCarouselProps {
  title: string;
  subtitle?: string;
  movies: Movie[];
  lang: LanguageCode;
  onSelectMovie: (movie: Movie) => void;
  onQuickPlay?: (movie: Movie) => void;
  showProgress?: boolean;
}

export function MovieCarousel({
  title,
  subtitle,
  movies,
  lang,
  onSelectMovie,
  onQuickPlay,
  showProgress = false,
}: MovieCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  if (movies.length === 0) return null;

  const scrollBy = (dir: 'left' | 'right') => {
    playUiSound('click');
    if (!trackRef.current) return;
    const distance = Math.max(320, trackRef.current.clientWidth * 0.75);
    trackRef.current.scrollBy({
      left: dir === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <section className="relative py-4">
      <div className="mb-3 flex items-end justify-between gap-4 px-4 sm:px-8 lg:px-12">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-white">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => scrollBy('left')}
            aria-label="Gulir ke kiri"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#171717] text-zinc-300 transition hover:border-[#FF163D]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF163D]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy('right')}
            aria-label="Gulir ke kanan"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#171717] text-zinc-300 transition hover:border-[#FF163D]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF163D]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-3 sm:px-8 lg:px-12 scroll-smooth"
      >
        {movies.map((movie) => {
          const prog = movie.userLibrary?.progressSeconds || 0;
          const dur = movie.userLibrary?.durationSeconds || movie.durationSeconds || 1;
          const pct = showProgress && prog > 0 ? Math.min(100, Math.round((prog / dur) * 100)) : 0;

          return (
            <div
              key={movie.id}
              className="group relative w-[164px] sm:w-[196px] shrink-0 cursor-pointer"
              onClick={() => {
                playUiSound('click');
                onSelectMovie(movie);
              }}
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-[#171717] transition-all duration-200 group-hover:scale-[1.03] group-hover:border-[#FF163D]/70 group-hover:shadow-[0_12px_32px_-8px_rgba(255,22,61,0.4)]">
                <FilmPoster movie={movie} className="group-hover:scale-105" />

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-80 transition-opacity group-hover:opacity-95" />

                {onQuickPlay && (
                  <button
                    type="button"
                    aria-label={`Putar ${movie.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      playUiSound('player');
                      onQuickPlay(movie);
                    }}
                    className="absolute right-3 bottom-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#FF163D] text-white opacity-0 translate-y-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 hover:bg-[#ff2b4f] shadow-lg"
                  >
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  </button>
                )}

                {pct > 0 && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                    <div className="h-full bg-[#FF163D]" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>

              <div className="mt-2.5 px-0.5">
                <h3 className="text-sm font-semibold text-white truncate group-hover:text-[#FF163D] transition-colors">
                  {movie.title}
                </h3>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 truncate">
                  <span className="font-mono-tabular">{movie.releaseYear}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{movie.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400 font-medium">
                    {lang === 'id' ? 'Gratis' : 'Free'}
                  </span>
                </p>
                {showProgress && prog > 0 && (
                  <p className="mt-0.5 font-mono-tabular text-[11px] text-zinc-500">
                    {formatDuration(prog)} / {formatDuration(dur)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ping-Pong Red Slider Track Indicator */}
      <div className="mx-4 mt-1 sm:mx-8 lg:mx-12">
        <div
          aria-hidden="true"
          className="relative h-1 w-full overflow-hidden rounded-full bg-white/10"
        >
          <div className="flixfil-pingpong-thumb h-full rounded-full bg-gradient-to-r from-[#8B001F] via-[#FF163D] to-[#ff4f6e]" />
        </div>
      </div>
    </section>
  );
}
