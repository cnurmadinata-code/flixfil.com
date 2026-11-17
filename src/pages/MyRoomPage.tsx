import { useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  Clock,
  Crown,
  FolderPlus,
  Heart,
  Lock,
  Play,
  StickyNote,
  Trash2,
  Unlock,
  User,
} from 'lucide-react';
import type { CustomList, LanguageCode, Movie, PaymentRecord, UserProfile } from '../types';
import { formatDuration, formatRupiah } from '../utils/i18n';
import { FilmPoster } from '../components/FilmPoster';

interface MyRoomPageProps {
  user: UserProfile | null;
  movies: Movie[];
  customLists: CustomList[];
  payments: PaymentRecord[];
  lang: LanguageCode;
  initialTab?: 'collections' | 'favorites' | 'watchlist' | 'history' | 'notes' | 'subscription';
  onRequireAuth: () => void;
  onSelectMovie: (movie: Movie) => void;
  onWatchMovie: (movie: Movie) => void;
  onRefreshLists: () => Promise<void>;
  onRefreshUser: () => Promise<void>;
  onNavigatePremium: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function MyRoomPage({
  user,
  movies,
  customLists,
  payments,
  initialTab = 'collections',
  onRequireAuth,
  onSelectMovie,
  onWatchMovie,
  onRefreshLists,
  onRefreshUser,
  onNavigatePremium,
  onNotify,
}: MyRoomPageProps) {
  const [tab, setTab] = useState(initialTab);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [newListPublic, setNewListPublic] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [isPublicProfile, setIsPublicProfile] = useState(Boolean(user?.is_profile_public));

  if (!user) {
    return (
      <div className="min-h-screen bg-[#080808] pt-28 px-4 text-center text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#171717] p-8">
          <Lock className="mx-auto h-10 w-10 text-[#FF163D]" />
          <h1 className="mt-4 font-display text-2xl font-bold">MY ROOM</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Ruang pribadi FLIXFIL hanya dapat diakses oleh pemilik akun. Masuk untuk mengelola koleksi, catatan, dan riwayat tontonan Anda.
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="mt-6 w-full rounded-xl bg-[#FF163D] py-3 text-sm font-semibold text-white hover:bg-[#e01034]"
          >
            Masuk / Daftar Sekarang
          </button>
        </div>
      </div>
    );
  }

  const favorites = movies.filter((m) => m.userLibrary?.isFavorite);
  const watchlist = movies.filter((m) => m.userLibrary?.inWatchlist);
  const history = movies
    .filter((m) => (m.userLibrary?.progressSeconds || 0) > 0 || m.userLibrary?.lastWatchedAt)
    .sort((a, b) =>
      String(b.userLibrary?.lastWatchedAt || '').localeCompare(String(a.userLibrary?.lastWatchedAt || '')),
    );
  const completedCount = movies.filter((m) => m.userLibrary?.watchStatus === 'completed').length;
  const totalWatchSeconds = movies.reduce((acc, m) => acc + (m.userLibrary?.progressSeconds || 0), 0);
  const notesMovies = movies.filter((m) => Boolean(m.userLibrary?.personalNote));

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    const res = await fetch('/api/my/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newListName.trim(),
        description: newListDesc.trim(),
        isPublic: newListPublic,
      }),
    });
    if (res.ok) {
      setNewListName('');
      setNewListDesc('');
      onNotify('Koleksi pribadi baru berhasil dibuat.');
      await onRefreshLists();
    }
  };

  const handleDeleteList = async (listId: string) => {
    await fetch(`/api/my/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
    onNotify('Koleksi dihapus.');
    await onRefreshLists();
  };

  const handleClearHistory = async () => {
    await fetch('/api/my/history', { method: 'DELETE' });
    onNotify('Riwayat tontonan dibersihkan.');
    await onRefreshUser();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/my/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName,
        bio,
        avatarUrl,
        isProfilePublic: isPublicProfile,
      }),
    });
    if (res.ok) {
      setEditingProfile(false);
      onNotify('Profil pribadi diperbarui.');
      await onRefreshUser();
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] pt-24 pb-16 px-4 sm:px-8 lg:px-12 text-white">
      <div className="mx-auto max-w-[1440px] space-y-8">
        {/* Profile Header */}
        <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#171717] via-[#121214] to-[#23060d] p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-5">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[#FF163D]/40 bg-black/60 flex items-center justify-center">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.display_name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-9 w-9 text-[#FF163D]" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
                    {user.display_name}
                  </h1>
                  <span className="text-xs font-semibold text-[#FF163D]">
                    {user.subscription_tier === 'premium' ? 'PREMIUM' : 'FREE'}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {user.is_profile_public ? '· Profil Publik' : '· Profil Privat'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">@{user.username}</p>
                <p className="mt-2 text-sm text-zinc-300 max-w-xl">
                  {user.bio || 'Belum ada bio singkat.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="text-left sm:text-right">
                <p className="font-mono-tabular text-xl font-bold text-white">{completedCount}</p>
                <p className="text-xs text-zinc-400">Film Selesai</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-mono-tabular text-xl font-bold text-white">
                  {formatDuration(totalWatchSeconds)}
                </p>
                <p className="text-xs text-zinc-400">Waktu Menonton</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDisplayName(user.display_name);
                  setBio(user.bio);
                  setAvatarUrl(user.avatar_url);
                  setIsPublicProfile(Boolean(user.is_profile_public));
                  setEditingProfile(!editingProfile);
                }}
                className="rounded-xl border border-white/15 bg-black/50 px-4 py-2 text-xs font-semibold text-white hover:border-[#FF163D]"
              >
                {editingProfile ? 'Batal Edit' : 'Edit Profil'}
              </button>
            </div>
          </div>

          {editingProfile && (
            <form onSubmit={handleSaveProfile} className="mt-6 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nama Tampilan"
                className="rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
              />
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="URL Foto Profil (opsional)"
                className="rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
              />
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={isPublicProfile}
                  onChange={(e) => setIsPublicProfile(e.target.checked)}
                  className="accent-[#FF163D]"
                />
                Tampilkan profil saya sebagai publik (email tetap disembunyikan)
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Bio singkat Anda..."
                className="sm:col-span-2 rounded-xl border border-white/10 bg-black/60 p-3 text-sm text-white"
              />
              <div className="flex items-end justify-end">
                <button
                  type="submit"
                  className="rounded-xl bg-[#FF163D] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#e01034]"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          )}
        </section>

        {/* My Room Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-white/10 pb-3">
          {[
            { id: 'collections', label: 'Koleksi Pribadi', icon: FolderPlus },
            { id: 'favorites', label: `Favorit (${favorites.length})`, icon: Heart },
            { id: 'watchlist', label: `Ingin Ditonton (${watchlist.length})`, icon: Bookmark },
            { id: 'history', label: `Riwayat (${history.length})`, icon: Clock },
            { id: 'notes', label: `Catatan (${notesMovies.length})`, icon: StickyNote },
            { id: 'subscription', label: 'Langganan', icon: Crown },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as typeof tab)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                  tab === item.id ? 'bg-[#FF163D] text-white' : 'bg-[#171717] text-zinc-300 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        {tab === 'collections' && (
          <div className="grid gap-8 lg:grid-cols-3">
            <form onSubmit={handleCreateList} className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4 h-fit">
              <h2 className="font-display text-lg font-bold">Buat Daftar Koleksi</h2>
              <input
                type="text"
                required
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Nama koleksi (mis. Horor Terbaik)"
                className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
              />
              <textarea
                rows={3}
                value={newListDesc}
                onChange={(e) => setNewListDesc(e.target.value)}
                placeholder="Deskripsi koleksi..."
                className="w-full rounded-xl border border-white/10 bg-black/60 p-3 text-sm text-white"
              />
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={newListPublic}
                  onChange={(e) => setNewListPublic(e.target.checked)}
                  className="accent-[#FF163D]"
                />
                Jadikan koleksi ini publik
              </label>
              <button
                type="submit"
                className="w-full rounded-xl bg-[#FF163D] py-2.5 text-xs font-semibold text-white hover:bg-[#e01034]"
              >
                Buat Koleksi
              </button>
            </form>

            <div className="lg:col-span-2 space-y-4">
              {customLists.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[#171717] p-8 text-center text-xs text-zinc-400">
                  Anda belum membuat daftar koleksi pribadi. Buat koleksi di sebelah kiri, lalu tambahkan film dari halaman detail film.
                </div>
              ) : (
                customLists.map((list) => (
                  <div key={list.id} className="rounded-2xl border border-white/10 bg-[#171717] p-5 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-base font-bold text-white">{list.name}</h3>
                          {list.isPublic ? (
                            <Unlock className="h-3.5 w-3.5 text-zinc-400" />
                          ) : (
                            <Lock className="h-3.5 w-3.5 text-[#FF163D]" />
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">{list.description || 'Koleksi pribadi'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteList(list.id)}
                        className="text-zinc-400 hover:text-red-400 p-1"
                        aria-label="Hapus koleksi"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {list.items.length === 0 ? (
                      <p className="text-xs text-zinc-500">Belum ada film dalam koleksi ini.</p>
                    ) : (
                      <div className="flex gap-3 overflow-x-auto no-scrollbar pt-1">
                        {list.items.map((item) => {
                          const full = movies.find((m) => m.id === item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => full && onSelectMovie(full)}
                              className="w-24 shrink-0 text-left"
                            >
                              <div className="aspect-[2/3] overflow-hidden rounded-lg border border-white/10">
                                {full && <FilmPoster movie={full} />}
                              </div>
                              <p className="mt-1 text-[11px] font-medium text-white truncate">{item.title}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {(tab === 'favorites' || tab === 'watchlist') && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {(tab === 'favorites' ? favorites : watchlist).map((movie) => (
              <div key={movie.id} onClick={() => onSelectMovie(movie)} className="group cursor-pointer">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-[#171717] group-hover:border-[#FF163D]">
                  <FilmPoster movie={movie} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onWatchMovie(movie);
                    }}
                    className="absolute right-2.5 bottom-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF163D] text-white"
                  >
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  </button>
                </div>
                <p className="mt-2 text-xs font-semibold text-white truncate">{movie.title}</p>
                <p className="text-[11px] text-zinc-400">{movie.releaseYear} · {movie.category}</p>
              </div>
            ))}
            {(tab === 'favorites' ? favorites : watchlist).length === 0 && (
              <p className="col-span-full rounded-2xl border border-white/10 bg-[#171717] p-8 text-center text-xs text-zinc-400">
                Belum ada film di daftar ini.
              </p>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleClearHistory()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:border-[#FF163D] hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus Riwayat Tontonan
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-[#171717] p-8 text-center text-xs text-zinc-400">
                Riwayat tontonan Anda masih kosong.
              </p>
            ) : (
              <div className="space-y-3">
                {history.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => onWatchMovie(m)}
                    className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#171717] p-4 cursor-pointer hover:border-[#FF163D]/60"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10">
                        <FilmPoster movie={m} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">{m.title}</h3>
                        <p className="text-xs text-zinc-400 font-mono-tabular">
                          Posisi terakhir: {formatDuration(m.userLibrary?.progressSeconds || 0)} /{' '}
                          {formatDuration(m.durationSeconds)}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF163D] px-3 py-1.5 text-xs font-semibold text-white shrink-0">
                      <Play className="h-3 w-3 fill-current" />
                      Lanjutkan
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {notesMovies.length === 0 ? (
              <p className="sm:col-span-2 rounded-2xl border border-white/10 bg-[#171717] p-8 text-center text-xs text-zinc-400">
                Anda belum menambahkan catatan film pribadi.
              </p>
            ) : (
              notesMovies.map((m) => (
                <div
                  key={m.id}
                  onClick={() => onSelectMovie(m)}
                  className="rounded-2xl border border-white/10 bg-[#171717] p-4 cursor-pointer hover:border-[#FF163D]/60"
                >
                  <p className="text-sm font-bold text-white">{m.title}</p>
                  <p className="mt-2 text-xs text-zinc-300 leading-relaxed">{m.userLibrary?.personalNote}</p>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'subscription' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-3">
              <div className="flex items-center gap-2 text-[#FF163D] text-xs font-bold uppercase">
                <CheckCircle2 className="h-4 w-4" />
                Status Keanggotaan
              </div>
              <p className="font-display text-2xl font-bold text-white">
                {user.subscription_tier === 'premium' ? 'FLIXFIL Premium' : 'FLIXFIL Gratis'}
              </p>
              {user.subscription_expires_at && (
                <p className="text-xs text-zinc-400">
                  Berlaku hingga: {new Date(user.subscription_expires_at).toLocaleDateString('id-ID')}
                </p>
              )}
              <button
                type="button"
                onClick={onNavigatePremium}
                className="mt-2 rounded-xl bg-[#FF163D] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#e01034]"
              >
                {user.subscription_tier === 'premium' ? 'Perpanjang Paket' : 'JOIN PREMIUM'}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-3">
              <h3 className="font-display text-base font-bold text-white">Riwayat Pembayaran</h3>
              {payments.length === 0 ? (
                <p className="text-xs text-zinc-400">Belum ada riwayat transaksi pembayaran.</p>
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-black/40 p-3 text-xs">
                      <div>
                        <p className="font-semibold text-white">{p.plan_name}</p>
                        <p className="text-zinc-400 font-mono-tabular">{p.external_ref}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono-tabular font-semibold text-white">{formatRupiah(p.amount_idr)}</p>
                        <p className={p.status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}>{p.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
