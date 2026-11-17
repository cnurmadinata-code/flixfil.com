import { useState } from 'react';
import { Film } from 'lucide-react';
import type { Movie } from '../types';

interface FilmPosterProps {
  movie: Pick<
    Movie,
    'id' | 'title' | 'posterUrl' | 'backdropUrl' | 'releaseYear' | 'category' | 'country' | 'director' | 'accessTier'
  >;
  variant?: 'poster' | 'backdrop';
  className?: string;
}

export function FilmPoster({ movie, variant = 'poster', className = '' }: FilmPosterProps) {
  const [failed, setFailed] = useState(false);
  const src = variant === 'backdrop' ? movie.backdropUrl || movie.posterUrl : movie.posterUrl;
  const showImage = Boolean(src) && !failed;

  if (showImage) {
    return (
      <img
        src={src}
        alt={movie.title}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-transform duration-300 ease-out ${className}`}
      />
    );
  }

  // Authentic FLIXFIL Typographic Edition fallback (never broken frame, never invented AI poster)
  return (
    <div
      className={`relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-[#19191b] via-[#111113] to-[#26070f] p-4 select-none ${className}`}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl"
        style={{ background: '#FF163D' }}
      />
      <div className="relative flex items-center justify-between text-[10px] tracking-[0.18em] text-zinc-400 uppercase">
        <span className="font-display font-bold text-[#FF163D]">FLIXFIL</span>
        <span className="font-mono-tabular">{movie.releaseYear}</span>
      </div>

      <div className="relative my-auto py-2">
        <Film className="mb-2 h-5 w-5 text-zinc-500" aria-hidden="true" />
        <p className="font-display text-sm font-bold leading-snug text-white line-clamp-3">
          {movie.title}
        </p>
        {movie.director && (
          <p className="mt-1.5 text-[11px] text-zinc-400 truncate">
            {movie.director}
          </p>
        )}
      </div>

      <div className="relative border-t border-white/10 pt-2 text-[10px] text-zinc-400 flex items-center justify-between gap-2">
        <span className="truncate">{movie.category}</span>
        <span className="shrink-0 font-medium text-zinc-300">{movie.country}</span>
      </div>
    </div>
  );
}
