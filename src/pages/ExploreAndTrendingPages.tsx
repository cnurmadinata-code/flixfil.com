import { useEffect, useMemo, useState } from 'react';
import { Flame, Play, Search, Sparkles, Star, TrendingUp } from 'lucide-react';
import type { LanguageCode, Movie } from '../types';
import { playUiSound } from '../utils/audioUi';
import { COPY, formatDuration } from '../utils/i18n';
import { formatJakartaDateShort } from '../utils/jakartaTime';
import { FilmPoster } from '../components/FilmPoster';

interface ExplorePageProps {
  movies: Movie[];
  categories?: string[];
  lang: LanguageCode;
  initialCategory?: string;
  indonesiaFocus?: boolean;
  onSelectMovie: (movie: Movie) => void;
  onWatchMovie: (movie: Movie) => void;
}

const DEFAULT_CATEGORIES_ID = [
  'Film Indonesia',
  'Horor Indonesia',
  'Drama Indonesia',
  'Aksi Indonesia',
  'Komedi Indonesia',
  'Romantis Indonesia',
  'Klasik Indonesia',
  'Film Pendek Indonesia',
  'Independen Indonesia',
  'Hollywood',
  'Korea',
  'Jepang',
  'Thailand',
  'China',
  'Eropa',
  'Animasi',
  'Dokumenter',
];

export function ExplorePage({
  movies,
  categories,
  lang,
  initialCategory = 'all',
  indonesiaFocus = false,
  onSelectMovie,
  onWatchMovie,
}: ExplorePageProps) {
  const t = COPY[lang];
  const categoryChips = useMemo(
    () => ['all', ...(categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES_ID)],
    [categories],
  );
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(indonesiaFocus ? 'Indonesia' : initialCategory);

  useEffect(() => {
    setCategory(indonesiaFocus ? 'Indonesia' : initialCategory);
  }, [indonesiaFocus, initialCategory]);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'trending' | 'newest' | 'rating' | 'title'>('trending');

  const [smartResults, setSmartResults] = useState<Movie[] | null>(null);
  const [smartIntent, setSmartIntent] = useState('');
  const [usedAi, setUsedAi] = useState(false);
  const [searching, setSearching] = useState(false);

  const handleSmartSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    playUiSound('click');
    if (!query.trim()) {
      setSmartResults(null);
      setSmartIntent('');
      return;
    }
    setSearching(true);
    try {
      const res = await fetch('/api/search/smart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as {
        movies?: Movie[];
        interpretedIntent?: string;
        usedAi?: boolean;
      };
      setSmartResults(data.movies || []);
      setSmartIntent(data.interpretedIntent || '');
      setUsedAi(Boolean(data.usedAi));
    } catch {
      setSmartResults(null);
    } finally {
      setSearching(false);
    }
  };

  const displayedMovies = useMemo(() => {
    const base = smartResults !== null ? smartResults : movies;
    const filtered = base.filter((m) => {
      if (category === 'Indonesia') {
        if (m.country !== 'Indonesia' && !m.category.includes('Indonesia')) return false;
      } else if (category !== 'all') {
        if (m.category !== category && !m.genres.includes(category)) return false;
      }
      if (sourceFilter !== 'all' && m.sourceType !== sourceFilter) return false;
      return true;
    });

    if (smartResults !== null) return filtered;

    return [...filtered].sort((a, b) => {
      if (sortBy === 'newest') return b.releaseYear - a.releaseYear;
      if (sortBy === 'rating') return b.ratingAvg - a.ratingAvg;
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return (b.trendingScore || 0) - (a.trendingScore || 0);
    });
  }, [movies, smartResults, category, sourceFilter, sortBy]);

  return (
    <div className="min-h-screen bg-[#080808] pt-24 pb-16 px-4 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FF163D]">
            {indonesiaFocus ? 'Local Stories. Big Screens.' : 'FLIXFIL CATALOG'}
          </p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl font-extrabold text-white">
            {indonesiaFocus
              ? lang === 'id'
                ? 'Perfilman Indonesia Pilihan'
                : 'Indonesian Cinema Spotlight'
              : lang === 'id'
                ? 'Jelajahi Film & Pencarian Cerdas'
                : 'Explore Films & Smart Search'}
          </h1>
          <p className="mt-1.5 text-xs text-zinc-400">
            {lang === 'id'
              ? 'Seluruh koleksi film gratis ditonton hingga resolusi 1080p standar.'
              : 'All catalog films are free to watch up to 1080p standard quality.'}
          </p>
        </div>

        {/* Smart Semantic Search Bar */}
        <form onSubmit={handleSmartSearch} className="mb-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value.trim()) {
                  setSmartResults(null);
                  setSmartIntent('');
                }
              }}
              placeholder={t.searchPlaceholder}
              className="w-full rounded-xl border border-white/15 bg-[#171717] py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-zinc-500 focus:border-[#FF163D] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF163D] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#e01034] disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4" />
            <span>{searching ? 'Mencari...' : lang === 'id' ? 'Cari Cerdas' : 'Smart Search'}</span>
          </button>
        </form>

        {/* Quick Example Smart Prompts */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span>Contoh:</span>
          {[
            'Film horor Indonesia terbaru',
            'Film tentang keluarga',
            'Film perang atau sejarah',
            'Romantis dengan akhir bahagia',
          ].map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuery(ex);
                setTimeout(() => void handleSmartSearch(), 20);
              }}
              className="rounded-lg border border-white/10 bg-[#171717] px-2.5 py-1 hover:border-[#FF163D]/60 hover:text-white transition"
            >
              {ex}
            </button>
          ))}
        </div>

        {smartIntent && (
          <div className="mb-6 rounded-xl border border-[#FF163D]/30 bg-[#FF163D]/10 px-4 py-3 text-xs text-zinc-200 flex items-center justify-between gap-4">
            <span>
              <strong className="text-white">{usedAi ? 'Pencarian Semantik AI:' : 'Hasil Pencarian:'}</strong>{' '}
              {smartIntent}
            </span>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSmartResults(null);
                setSmartIntent('');
              }}
              className="text-[#FF163D] font-semibold hover:underline shrink-0"
            >
              Reset
            </button>
          </div>
        )}

        {/* Filters Row */}
        <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-y border-white/10 py-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {categoryChips.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                  category === cat
                    ? 'bg-[#FF163D] text-white'
                    : 'bg-[#171717] text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {cat === 'all' ? 'Semua Kategori' : cat}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label="Filter sumber"
              className="rounded-lg border border-white/10 bg-[#171717] px-3 py-2 text-xs text-white"
            >
              <option value="all">Semua Sumber</option>
              <option value="hls">HLS Adaptif (1080p)</option>
              <option value="mp4">Direct MP4</option>
              <option value="youtube">YouTube</option>
              <option value="archive">Internet Archive</option>
              <option value="external_only">Platform Eksternal</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'trending' | 'newest' | 'rating' | 'title')}
              aria-label="Urutkan"
              className="rounded-lg border border-white/10 bg-[#171717] px-3 py-2 text-xs text-white"
            >
              <option value="trending">Paling Populer</option>
              <option value="newest">Tahun Terbaru</option>
              <option value="rating">Rating Tertinggi</option>
              <option value="title">Judul A–Z</option>
            </select>
          </div>
        </div>

        {/* Results Grid */}
        {displayedMovies.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#171717] p-12 text-center">
            <p className="text-base font-semibold text-white">
              {movies.length === 0
                ? 'Katalog film FLIXFIL masih kosong.'
                : 'Tidak ada film yang cocok dengan filter ini.'}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {movies.length === 0
                ? 'Judul film resmi akan tampil otomatis di sini segera setelah dipublikasikan.'
                : 'Coba kata kunci lain atau ubah filter kategori di atas.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {displayedMovies.map((movie) => (
              <div
                key={movie.id}
                onClick={() => onSelectMovie(movie)}
                className="group cursor-pointer"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-[#171717] transition duration-200 group-hover:scale-[1.03] group-hover:border-[#FF163D]/70">
                  <FilmPoster movie={movie} />
                  <button
                    type="button"
                    aria-label={`Putar ${movie.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onWatchMovie(movie);
                    }}
                    className="absolute right-2.5 bottom-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF163D] text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  </button>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-white truncate group-hover:text-[#FF163D]">
                  {movie.title}
                </h3>
                <p className="text-xs text-zinc-400 truncate">
                  <span className="font-mono-tabular">{movie.releaseYear}</span> · {movie.category} ·{' '}
                  <span className="text-emerald-400">{lang === 'id' ? 'Gratis' : 'Free'}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TrendingPageProps {
  movies: Movie[];
  trendingEnabled?: boolean;
  lang: LanguageCode;
  onSelectMovie: (movie: Movie) => void;
  onWatchMovie: (movie: Movie) => void;
}

export function TrendingPage({
  movies,
  trendingEnabled = true,
  lang,
  onSelectMovie,
  onWatchMovie,
}: TrendingPageProps) {
  const [tab, setTab] = useState<'trending_now' | 'most_watched' | 'trending_id' | 'newly_added' | 'popular_week'>(
    'trending_now',
  );

  const ranked = useMemo(() => {
    const list = [...movies];
    if (tab === 'most_watched') {
      return list.sort((a, b) => b.viewCount - a.viewCount || (b.trendingScore || 0) - (a.trendingScore || 0));
    }
    if (tab === 'trending_id') {
      return list
        .filter((m) => m.country === 'Indonesia' || m.category.includes('Indonesia'))
        .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0));
    }
    if (tab === 'newly_added') {
      return list.sort(
        (a, b) => new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime(),
      );
    }
    if (tab === 'popular_week') {
      return list.sort(
        (a, b) => (b.views7d || 0) - (a.views7d || 0) || (b.trendingScore || 0) - (a.trendingScore || 0),
      );
    }
    return list.sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0));
  }, [movies, tab]);

  return (
    <div className="min-h-screen bg-[#080808] pt-24 pb-16 px-4 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FF163D]">
            SMART TRENDING ENGINE
          </p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl font-extrabold text-white">
            TRENDING NOW
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Peringkat otomatis berdasarkan tontonan nyata 24 jam, 7 hari, penyelesaian film, favorit, dan pertumbuhan popularitas (dengan perlindungan anti-bot).
          </p>
        </div>

        {!trendingEnabled && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200">
            Fitur Smart Trending di beranda sedang dinonaktifkan sementara oleh Administrator. Daftar berikut menampilkan urutan katalog terbaru.
          </div>
        )}

        <div className="mb-8 flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
          {[
            { id: 'trending_now', label: 'Trending Now' },
            { id: 'most_watched', label: 'Paling Banyak Ditonton' },
            { id: 'trending_id', label: 'Trending Indonesia' },
            { id: 'newly_added', label: 'Baru Ditambahkan' },
            { id: 'popular_week', label: 'Popular This Week' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                tab === item.id ? 'bg-[#FF163D] text-white' : 'bg-[#171717] text-zinc-300 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {ranked.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#171717] p-12 text-center">
            <p className="text-base font-semibold text-white">
              Belum ada film dalam daftar peringkat ini.
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Peringkat Trending akan terisi otomatis saat film ditambahkan dan ditonton oleh pengguna FLIXFIL.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {ranked.map((movie, idx) => (
              <div
                key={movie.id}
                onClick={() => onSelectMovie(movie)}
                className="group flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-white/10 bg-[#171717] p-4 cursor-pointer transition hover:border-[#FF163D]/60"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className="font-mono-tabular text-2xl sm:text-3xl font-extrabold text-zinc-500 w-10 text-center shrink-0 group-hover:text-[#FF163D]">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10">
                    <FilmPoster movie={movie} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base sm:text-lg font-bold text-white truncate group-hover:text-[#FF163D]">
                      {movie.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {movie.releaseYear} · {movie.category} · {movie.country} · {formatDuration(movie.durationSeconds)} · Masuk {formatJakartaDateShort(movie.publishedAt || movie.createdAt)}
                    </p>
                    <p className="mt-1.5 text-xs text-zinc-300 line-clamp-2">{movie.synopsis}</p>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0 border-t sm:border-t-0 border-white/10 pt-3 sm:pt-0">
                  <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-zinc-300 font-mono-tabular">
                    <span className="inline-flex items-center gap-1" title="Tontonan 24 jam terakhir">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                      {movie.views24h ?? 0} (24j)
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Flame className="h-3.5 w-3.5 text-[#FF163D]" />
                      {movie.viewCount.toLocaleString('id-ID')} tontonan
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                      {movie.ratingAvg.toFixed(1)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onWatchMovie(movie);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF163D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e01034]"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {lang === 'id' ? 'Tonton' : 'Watch'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
