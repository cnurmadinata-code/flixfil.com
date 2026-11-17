import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Heart,
  Link2,
  PenLine,
  Play,
  Plus,
  Trash2,
  Tv,
} from 'lucide-react';
import type { PersonalVaultItem, UserProfile } from '../types';
import { playUiSound } from '../utils/audioUi';

interface TambahTontonanPageProps {
  user: UserProfile | null;
  onRequireAuth: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

interface InspectedMeta {
  platformName: string;
  sourceType: string;
  title: string;
  synopsis: string;
  director: string;
  releaseYear: number;
  posterUrl: string;
  sourceUrl: string;
  embedUrl: string;
  playbackSupported: boolean;
  notice: string;
}

export function TambahTontonanPage({ user, onRequireAuth, onNotify }: TambahTontonanPageProps) {
  const [mode, setMode] = useState<'link' | 'manual'>('link');
  const [urlInput, setUrlInput] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [inspected, setInspected] = useState<InspectedMeta | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Film');
  const [customCategory, setCustomCategory] = useState('');
  const [releaseYear, setReleaseYear] = useState(new Date().getFullYear());
  const [synopsis, setSynopsis] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [personalNote, setPersonalNote] = useState('');

  const [vaultItems, setVaultItems] = useState<PersonalVaultItem[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [playingItem, setPlayingItem] = useState<PersonalVaultItem | null>(null);

  const loadVault = async () => {
    if (!user) return;
    const res = await fetch('/api/my/vault');
    if (res.ok) {
      const data = (await res.json()) as { items: PersonalVaultItem[] };
      setVaultItems(data.items);
    }
  };

  useEffect(() => {
    void loadVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    playUiSound('click');
    setInspecting(true);
    try {
      const res = await fetch('/api/inspect-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = (await res.json()) as { metadata?: InspectedMeta; error?: string };
      if (!res.ok || !data.metadata) {
        onNotify(data.error || 'Tautan tidak didukung atau tidak dapat diperiksa.', true);
        return;
      }
      setInspected(data.metadata);
      setTitle(data.metadata.title);
      setSynopsis(data.metadata.synopsis);
      setReleaseYear(data.metadata.releaseYear);
      setPosterUrl(data.metadata.posterUrl);
      if (data.metadata.sourceType === 'youtube') setCategory('Video YouTube');
      onNotify(`Sumber ${data.metadata.platformName} berhasil dideteksi.`);
    } catch {
      onNotify('Gagal memeriksa tautan.', true);
    } finally {
      setInspecting(false);
    }
  };

  const handleSaveToVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!title.trim()) {
      onNotify('Judul tontonan wajib diisi.', true);
      return;
    }

    const res = await fetch('/api/my/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        category,
        customCategory: customCategory.trim(),
        releaseYear,
        synopsis,
        posterUrl,
        platformName: mode === 'link' ? inspected?.platformName || 'Tautan Eksternal' : 'Manual',
        sourceUrl: mode === 'link' ? inspected?.sourceUrl || urlInput.trim() : '',
        embedUrl: mode === 'link' ? inspected?.embedUrl || '' : '',
        playbackSupported: mode === 'link' ? Boolean(inspected?.playbackSupported) : false,
        personalNote,
      }),
    });

    if (res.ok) {
      onNotify('Tontonan berhasil ditambahkan ke Koleksi Pribadi Anda.');
      setUrlInput('');
      setInspected(null);
      setTitle('');
      setSynopsis('');
      setPosterUrl('');
      setPersonalNote('');
      setCustomCategory('');
      void loadVault();
    } else {
      const err = (await res.json()) as { error?: string };
      onNotify(err.error || 'Gagal menyimpan tontonan.', true);
    }
  };

  const handleToggleItem = async (id: string, payload: Record<string, unknown>) => {
    await fetch(`/api/my/vault/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    void loadVault();
  };

  const handleDeleteItem = async (id: string) => {
    await fetch(`/api/my/vault/${encodeURIComponent(id)}`, { method: 'DELETE' });
    onNotify('Tontonan dihapus dari koleksi pribadi.');
    void loadVault();
  };

  const filteredItems = vaultItems.filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'favorite') return item.isFavorite;
    if (activeFilter === 'unwatched' || activeFilter === 'watching' || activeFilter === 'completed') {
      return item.watch_status === activeFilter;
    }
    return item.category === activeFilter || item.custom_category === activeFilter;
  });

  return (
    <div className="min-h-screen bg-[#080808] pt-24 pb-16 px-4 sm:px-8 lg:px-12 text-white">
      <div className="mx-auto max-w-6xl space-y-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FF163D]">
            PERSONAL WATCH VAULT
          </p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl font-extrabold text-white">
            TAMBAH TONTONAN
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-2xl">
            Tempel tautan dari YouTube, Netflix, Bstation/Bilibili, Vimeo, Dailymotion, atau Internet Archive untuk menyimpannya ke koleksi pribadi Anda dalam hitungan detik.
          </p>
        </div>

        {/* Add Form Card */}
        <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-white/10 pb-4">
            <button
              type="button"
              onClick={() => setMode('link')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                mode === 'link' ? 'bg-[#FF163D] text-white' : 'bg-black/40 text-zinc-300 hover:text-white'
              }`}
            >
              <Link2 className="h-4 w-4" />
              Tambahkan melalui Tautan
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                mode === 'manual' ? 'bg-[#FF163D] text-white' : 'bg-black/40 text-zinc-300 hover:text-white'
              }`}
            >
              <PenLine className="h-4 w-4" />
              Tambahkan secara Manual
            </button>
          </div>

          {mode === 'link' && (
            <form onSubmit={handleInspect} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="url"
                  required
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Tempel tautan film/video (mis. https://www.youtube.com/watch?v=... atau https://www.netflix.com/...)"
                  className="flex-1 rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#FF163D] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={inspecting}
                  className="rounded-xl bg-[#FF163D] px-6 py-3 text-sm font-semibold text-white hover:bg-[#e01034] disabled:opacity-50 whitespace-nowrap"
                >
                  {inspecting ? 'Memeriksa...' : 'Periksa Tautan'}
                </button>
              </div>

              {inspected && (
                <div className="rounded-xl border border-white/15 bg-black/50 p-4 flex flex-col sm:flex-row gap-4 items-start">
                  {inspected.posterUrl && (
                    <img
                      src={inspected.posterUrl}
                      alt={inspected.title}
                      referrerPolicy="no-referrer"
                      className="h-28 w-44 rounded-lg object-cover shrink-0 border border-white/10"
                    />
                  )}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-[#FF163D] font-semibold">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Platform terdeteksi: {inspected.platformName}</span>
                    </div>
                    <p className="text-sm font-bold text-white">{inspected.title}</p>
                    <p className="text-zinc-300 leading-relaxed">{inspected.notice}</p>
                  </div>
                </div>
              )}
            </form>
          )}

          {(mode === 'manual' || inspected) && (
            <form onSubmit={handleSaveToVault} className="grid gap-4 sm:grid-cols-2 border-t border-white/10 pt-5">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Judul Tontonan</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Kategori</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white"
                  >
                    {['Film', 'Serial', 'Anime', 'Drama', 'Dokumenter', 'Video YouTube'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Tahun</label>
                  <input
                    type="number"
                    value={releaseYear}
                    onChange={(e) => setReleaseYear(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white font-mono-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Kategori Buatan Sendiri (Opsional)</label>
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Mis. Maraton Akhir Pekan"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">URL Poster Resmi (Opsional)</label>
                <input
                  type="url"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs text-zinc-400 mb-1.5">Sinopsis / Catatan Pribadi</label>
                <textarea
                  rows={2}
                  value={personalNote || synopsis}
                  onChange={(e) => {
                    setPersonalNote(e.target.value);
                    setSynopsis(e.target.value);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/60 p-3 text-sm text-white"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FF163D] px-6 py-3 text-sm font-semibold text-white hover:bg-[#e01034]"
                >
                  <Plus className="h-4 w-4" />
                  Tambahkan ke Koleksi Pribadi
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Embedded Quick Player Modal for Personal Vault Item */}
        {playingItem && (
          <div className="rounded-2xl border border-[#FF163D]/40 bg-black overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#171717]">
              <span className="text-sm font-semibold text-white">{playingItem.title}</span>
              <button
                type="button"
                onClick={() => setPlayingItem(null)}
                className="text-xs text-zinc-300 hover:text-white"
              >
                Tutup Pemutar
              </button>
            </div>
            <div className="aspect-video w-full">
              {playingItem.embed_url ? (
                <iframe
                  src={playingItem.embed_url}
                  title={playingItem.title}
                  allow="autoplay; fullscreen; encrypted-media"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : (
                <video src={playingItem.source_url} controls className="h-full w-full" />
              )}
            </div>
          </div>
        )}

        {/* Saved Personal Vault List */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-xl font-bold text-white">Tontonan Pribadi Tersimpan</h2>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'Semua' },
                { id: 'Film', label: 'Film' },
                { id: 'Serial', label: 'Serial' },
                { id: 'Anime', label: 'Anime' },
                { id: 'Video YouTube', label: 'YouTube' },
                { id: 'favorite', label: 'Favorit' },
                { id: 'unwatched', label: 'Belum Ditonton' },
                { id: 'watching', label: 'Sedang Ditonton' },
                { id: 'completed', label: 'Selesai' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveFilter(f.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                    activeFilter === f.id ? 'bg-[#FF163D] text-white' : 'bg-[#171717] text-zinc-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {!user ? (
            <div className="rounded-2xl border border-white/10 bg-[#171717] p-8 text-center">
              <p className="text-sm text-zinc-300">Masuk ke akun FLIXFIL untuk menyimpan dan mengelola tautan pribadi Anda.</p>
              <button
                type="button"
                onClick={onRequireAuth}
                className="mt-4 rounded-xl bg-[#FF163D] px-5 py-2.5 text-xs font-semibold text-white"
              >
                Masuk / Daftar
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#171717] p-8 text-center text-xs text-zinc-400">
              Belum ada tontonan di kategori ini. Tempel tautan di atas untuk mulai mengoleksi.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#171717] p-4 space-y-3"
                >
                  <div className="flex gap-3">
                    <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-black/60 border border-white/10 flex items-center justify-center">
                      {item.poster_url ? (
                        <img
                          src={item.poster_url}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Tv className="h-6 w-6 text-zinc-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-[#FF163D]">
                        {item.platform_name} · {item.custom_category || item.category}
                      </p>
                      <h3 className="mt-0.5 text-sm font-bold text-white line-clamp-2">{item.title}</h3>
                      <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{item.personal_note || item.synopsis}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <div className="flex items-center gap-1.5">
                      {item.playbackSupported && (item.embed_url || item.source_url) ? (
                        <button
                          type="button"
                          onClick={() => setPlayingItem(item)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#FF163D] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          Putar
                        </button>
                      ) : (
                        item.source_url && (
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#FF163D]"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Buka di Aplikasi Asli
                          </a>
                        )
                      )}

                      <select
                        value={item.watch_status}
                        onChange={(e) => void handleToggleItem(item.id, { watchStatus: e.target.value })}
                        className="rounded-lg border border-white/10 bg-black/60 px-2 py-1.5 text-[11px] text-zinc-200"
                      >
                        <option value="unwatched">Belum</option>
                        <option value="watching">Sedang</option>
                        <option value="completed">Selesai</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleToggleItem(item.id, { isFavorite: !item.isFavorite })}
                        className="p-1.5 rounded-lg hover:bg-white/10"
                        aria-label="Favorit"
                      >
                        <Heart className={`h-4 w-4 ${item.isFavorite ? 'fill-[#FF163D] text-[#FF163D]' : 'text-zinc-400'}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteItem(item.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:bg-white/10 hover:text-red-400"
                        aria-label="Hapus"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
