import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ExternalLink,
  Heart,
  Play,
  Plus,
  Star,
} from 'lucide-react';
import type { CustomList, Episode, LanguageCode, Movie, ReviewItem, SubtitleTrack, UserProfile } from '../types';
import { playUiSound } from '../utils/audioUi';
import { COPY, formatDuration } from '../utils/i18n';
import { formatJakartaDateShort } from '../utils/jakartaTime';
import { FilmPoster } from '../components/FilmPoster';

interface MovieDetailPageProps {
  movieId: string;
  user: UserProfile | null;
  lang: LanguageCode;
  customLists: CustomList[];
  onBack: () => void;
  onWatch: (movie: Movie, episodeId?: string) => void;
  onSelectMovie: (movie: Movie) => void;
  onUpdateLibrary: (movieId: string, payload: Record<string, unknown>) => Promise<void>;
  onAddToCustomList: (listId: string, movieId: string) => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function MovieDetailPage({
  movieId,
  user,
  lang,
  customLists,
  onBack,
  onWatch,
  onSelectMovie,
  onUpdateLibrary,
  onAddToCustomList,
  onNotify,
}: MovieDetailPageProps) {
  const t = COPY[lang];
  const [movie, setMovie] = useState<Movie | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [related, setRelated] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  const [personalNote, setPersonalNote] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [selectedListId, setSelectedListId] = useState('');

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/movies/${encodeURIComponent(movieId)}`);
      if (!res.ok) throw new Error('Not found');
      const data = (await res.json()) as {
        movie: Movie;
        episodes: Episode[];
        subtitles: SubtitleTrack[];
        reviews: ReviewItem[];
        related: Movie[];
      };
      setMovie(data.movie);
      setEpisodes(data.episodes);
      setSubtitles(data.subtitles);
      setReviews(data.reviews);
      setRelated(data.related);
      setPersonalNote(data.movie.userLibrary?.personalNote || '');
      setCustomCategory(data.movie.userLibrary?.customCategory || '');
    } catch {
      setMovie(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] pt-24 px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="relative h-80 rounded-2xl bg-[#171717] overflow-hidden skeleton-shimmer" />
          <div className="relative h-40 rounded-2xl bg-[#171717] overflow-hidden skeleton-shimmer" />
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-[#080808] pt-28 px-6 text-center">
        <p className="text-lg font-semibold text-white">Film tidak ditemukan.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-xl bg-[#FF163D] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Kembali
        </button>
      </div>
    );
  }

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onNotify('Silakan masuk akun untuk memberi ulasan.', true);
      return;
    }
    const res = await fetch(`/api/movies/${encodeURIComponent(movie.id)}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
    });
    if (res.ok) {
      setReviewComment('');
      onNotify('Ulasan berhasil disimpan.');
      void loadDetail();
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] pb-16 text-white">
      {/* Official Backdrop Banner */}
      <div className="relative min-h-[58vh] w-full overflow-hidden pt-20">
        <div className="absolute inset-0">
          <FilmPoster movie={movie} variant="backdrop" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/75 to-black/55" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#080808] via-[#080808]/70 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto max-w-[1440px] px-4 py-10 sm:px-8 lg:px-12">
          <button
            type="button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/60 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:border-[#FF163D] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali</span>
          </button>

          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="w-44 sm:w-56 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-[#171717] shadow-2xl aspect-[2/3]">
              <FilmPoster movie={movie} />
            </div>

            <div className="flex-1 max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF163D]">
                {movie.category} · {movie.country}
              </p>
              <h1 className="mt-2 font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white [text-wrap:balance]">
                {movie.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-zinc-300">
                <span className="font-mono-tabular font-semibold text-white">{movie.releaseYear}</span>
                <span aria-hidden="true">·</span>
                <span>{movie.ageRating}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">{formatDuration(movie.durationSeconds)}</span>
                <span aria-hidden="true">·</span>
                <span>{movie.genres.join(', ')}</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-400 font-semibold">
                  {t.freeBadge} {movie.premiumStreamUrl ? '· 1080p HD Ready' : ''}
                </span>
              </div>

              <p className="mt-4 text-sm sm:text-base leading-relaxed text-zinc-300">
                {movie.synopsis}
              </p>

              <div className="mt-4 grid gap-2 text-xs sm:text-sm text-zinc-300 sm:grid-cols-2">
                <p>
                  <span className="text-zinc-500">Sutradara:</span> {movie.director || '—'}
                </p>
                <p>
                  <span className="text-zinc-500">Pemeran:</span> {movie.cast.join(', ') || '—'}
                </p>
                <p>
                  <span className="text-zinc-500">Kualitas Video:</span>{' '}
                  {movie.availableQualities.length > 0 ? movie.availableQualities.join(', ') : 'Platform Asli'}
                </p>
                <p>
                  <span className="text-zinc-500">Subtitle Tersedia:</span>{' '}
                  {subtitles.length > 0 ? subtitles.map((s) => s.language_label).join(', ') : 'Dapat unggah SRT/VTT'}
                </p>
                {movie.originalReleaseDate && (
                  <p>
                    <span className="text-zinc-500">Tanggal Rilis Asli:</span>{' '}
                    <span className="font-mono-tabular">{formatJakartaDateShort(movie.originalReleaseDate)}</span>
                  </p>
                )}
                <p>
                  <span className="text-zinc-500">Masuk FLIXFIL:</span>{' '}
                  <span className="font-mono-tabular">{formatJakartaDateShort(movie.publishedAt || movie.createdAt)}</span>
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {movie.playbackSupported ? (
                  <button
                    type="button"
                    onClick={() => {
                      playUiSound('player');
                      onWatch(movie);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#FF163D] px-6 py-3 text-sm font-bold text-white hover:bg-[#e01034] neon-red-glow"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    {movie.userLibrary?.progressSeconds ? t.continueWatching : t.watchNow}
                  </button>
                ) : (
                  movie.sourceUrl && (
                    <a
                      href={movie.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#FF163D] px-6 py-3 text-sm font-bold text-white hover:bg-[#e01034]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Buka di Aplikasi Asli
                    </a>
                  )
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (!user) return onNotify('Silakan masuk akun untuk menyimpan favorit.', true);
                    const next = !movie.userLibrary?.isFavorite;
                    void onUpdateLibrary(movie.id, { isFavorite: next }).then(() => loadDetail());
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    movie.userLibrary?.isFavorite
                      ? 'border-[#FF163D] bg-[#FF163D]/15 text-white'
                      : 'border-white/15 bg-[#171717] text-zinc-200 hover:border-white/30'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${movie.userLibrary?.isFavorite ? 'fill-[#FF163D] text-[#FF163D]' : ''}`} />
                  <span>{movie.userLibrary?.isFavorite ? 'Difavoritkan' : 'Favorit'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!user) return onNotify('Silakan masuk akun untuk menyimpan daftar tontonan.', true);
                    const next = !movie.userLibrary?.inWatchlist;
                    void onUpdateLibrary(movie.id, { inWatchlist: next }).then(() => loadDetail());
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    movie.userLibrary?.inWatchlist
                      ? 'border-[#FF163D] bg-[#FF163D]/15 text-white'
                      : 'border-white/15 bg-[#171717] text-zinc-200 hover:border-white/30'
                  }`}
                >
                  {movie.userLibrary?.inWatchlist ? <Check className="h-4 w-4 text-[#FF163D]" /> : <Bookmark className="h-4 w-4" />}
                  <span>{movie.userLibrary?.inWatchlist ? 'Di Daftar Nanti' : 'Simpan Nanti'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Personal Status, Notes & Custom Lists + Episodes + Reviews */}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12 mt-8 space-y-10">
        {user && (
          <section className="rounded-2xl border border-white/10 bg-[#171717] p-6 grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="font-display text-lg font-bold text-white">Status & Catatan Pribadi</h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'unwatched', label: 'Belum Ditonton' },
                  { id: 'watching', label: 'Sedang Ditonton' },
                  { id: 'completed', label: 'Selesai Ditonton' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => void onUpdateLibrary(movie.id, { watchStatus: st.id }).then(() => loadDetail())}
                    className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                      (movie.userLibrary?.watchStatus || 'unwatched') === st.id
                        ? 'bg-[#FF163D] text-white'
                        : 'bg-black/40 text-zinc-300 hover:text-white'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Kategori pribadi (mis. Malam Minggu)"
                  className="rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 text-xs text-white"
                />
                <div className="flex gap-2">
                  <select
                    value={selectedListId}
                    onChange={(e) => setSelectedListId(e.target.value)}
                    className="flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs text-white"
                  >
                    <option value="">Masukkan ke Koleksi My Room...</option>
                    {customLists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedListId}
                    onClick={() => void onAddToCustomList(selectedListId, movie.id)}
                    className="rounded-xl border border-white/15 bg-black/60 px-3 text-xs text-white hover:border-[#FF163D] disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <textarea
                rows={3}
                value={personalNote}
                onChange={(e) => setPersonalNote(e.target.value)}
                placeholder="Tulis catatan pribadi atau kesan film ini (hanya terlihat oleh Anda)..."
                className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-xs text-white placeholder:text-zinc-500 focus:border-[#FF163D] focus:outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  void onUpdateLibrary(movie.id, { personalNote, customCategory }).then(() => {
                    onNotify('Catatan pribadi tersimpan.');
                    void loadDetail();
                  })
                }
                className="rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-[#FF163D] transition"
              >
                Simpan Catatan Pribadi
              </button>
            </div>
          </section>
        )}

        {episodes.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold text-white mb-4">Episode</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {episodes.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => onWatch(movie, ep.id)}
                  className="flex flex-col items-start rounded-xl border border-white/10 bg-[#171717] p-4 text-left hover:border-[#FF163D]/60 transition"
                >
                  <div className="flex w-full items-center justify-between text-xs text-zinc-400">
                    <span>Musim {ep.seasonNumber} · Episode {ep.episodeNumber}</span>
                    <span className="font-mono-tabular">{formatDuration(ep.durationSeconds)}</span>
                  </div>
                  <p className="mt-1.5 font-semibold text-sm text-white">{ep.title}</p>
                  <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{ep.synopsis}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Reviews */}
        <section className="grid gap-8 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#171717] p-6">
            <h2 className="font-display text-lg font-bold text-white">Beri Ulasan</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Rating rata-rata: <strong className="text-white font-mono-tabular">{movie.ratingAvg.toFixed(1)}</strong> / 5 ({movie.ratingCount} ulasan)
            </p>
            <form onSubmit={handleSubmitReview} className="mt-4 space-y-3">
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className="p-1"
                    aria-label={`${star} bintang`}
                  >
                    <Star
                      className={`h-5 w-5 ${
                        star <= reviewRating ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Bagaimana pendapat Anda tentang film ini?"
                className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-xs text-white focus:border-[#FF163D] focus:outline-none"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-[#FF163D] py-2.5 text-xs font-semibold text-white hover:bg-[#e01034]"
              >
                Kirim Ulasan
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <h2 className="font-display text-lg font-bold text-white">Ulasan Penonton</h2>
            {reviews.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-[#171717] p-6 text-xs text-zinc-400">
                Belum ada ulasan. Jadilah yang pertama mengulas film ini.
              </p>
            ) : (
              reviews.map((rev) => (
                <div key={rev.id} className="rounded-xl border border-white/10 bg-[#171717] p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{rev.display_name}</span>
                    <span className="inline-flex items-center gap-1 text-amber-400 font-mono-tabular">
                      <Star className="h-3.5 w-3.5 fill-amber-400" />
                      {rev.rating}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-300 leading-relaxed">{rev.comment}</p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Related Films */}
        {related.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold text-white mb-4">Rekomendasi Serupa</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {related.map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => onSelectMovie(rel)}
                  className="group text-left"
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
          </section>
        )}
      </div>
    </div>
  );
}
