import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Captions,
  CheckCircle2,
  Crown,
  Database,
  Film,
  FolderKanban,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Pin,
  PlusCircle,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminSubTab,
  Movie,
  PaymentRecord,
  PublishStatus,
  SubscriptionPlan,
  UserProfile,
  WebsiteConfig,
} from '../types';
import { formatDuration, formatRupiah } from '../utils/i18n';
import { formatJakartaDateShort } from '../utils/jakartaTime';
import { FilmPoster } from '../components/FilmPoster';

interface AdminDashboardPageProps {
  user: UserProfile | null;
  movies: Movie[];
  plans: SubscriptionPlan[];
  payments: PaymentRecord[];
  websiteConfig: WebsiteConfig | null;
  heroAutoFeature: boolean;
  initialTab?: AdminSubTab;
  onTabChange?: (tab: AdminSubTab) => void;
  onRefreshAll: () => Promise<void>;
  onRequireAuth: () => void;
  onLogout: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

interface AdminStats {
  totalUsers: number;
  totalMovies: number;
  totalViews: number;
  totalPremium: number;
  totalRevenue: number;
}

const STATUS_BADGE: Record<PublishStatus, { label: string; cls: string }> = {
  ready: { label: 'Siap Ditayangkan', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  pending_check: { label: 'Menunggu Pemeriksaan', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  processing: { label: 'Sedang Diproses', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  failed: { label: 'Gagal Diproses', cls: 'bg-red-500/20 text-red-300 border-red-500/40' },
  unavailable: { label: 'Sumber Tidak Tersedia', cls: 'bg-zinc-600/30 text-zinc-300 border-zinc-500/40' },
};

export function AdminDashboardPage({
  user,
  movies,
  plans,
  websiteConfig,
  heroAutoFeature,
  initialTab = 'overview',
  onTabChange,
  onRefreshAll,
  onRequireAuth,
  onLogout,
  onNotify,
}: AdminDashboardPageProps) {
  const [adminPassword, setAdminPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [elevating, setElevating] = useState(false);

  const [tab, setTab] = useState<AdminSubTab>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const switchTab = (next: AdminSubTab) => {
    setTab(next);
    onTabChange?.(next);
  };

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [topMovies, setTopMovies] = useState<Array<Record<string, unknown>>>([]);
  const [adminMovies, setAdminMovies] = useState<Movie[]>([]);
  const [audits, setAudits] = useState<Array<Record<string, unknown>>>([]);
  const [errorLogs, setErrorLogs] = useState<Array<Record<string, unknown>>>([]);
  const [backups, setBackups] = useState<string[]>([]);
  const [adminUsers, setAdminUsers] = useState<Array<Record<string, unknown>>>([]);
  const [adminPayments, setAdminPayments] = useState<PaymentRecord[]>([]);

  // Add / Upload Movie State
  const [linkInput, setLinkInput] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(websiteConfig?.categories?.[0] || 'Film Indonesia');
  const [type, setType] = useState<Movie['type']>('film');
  const [country, setCountry] = useState('Indonesia');
  const [releaseYear, setReleaseYear] = useState(2026);
  const [originalReleaseDate, setOriginalReleaseDate] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(5400);
  const [director, setDirector] = useState('');
  const [castStr, setCastStr] = useState('');
  const [genresStr, setGenresStr] = useState('Drama, Indonesia');
  const [synopsis, setSynopsis] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [backdropUrl, setBackdropUrl] = useState('');
  const [sourceType, setSourceType] = useState('hls');
  const [sourceUrl, setSourceUrl] = useState('');
  const [premiumStreamUrl, setPremiumStreamUrl] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [playbackSupported, setPlaybackSupported] = useState(true);
  const [availableQualities, setAvailableQualities] = useState<string[]>(['Auto']);
  const [publishStatus, setPublishStatus] = useState<PublishStatus>('ready');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isPinnedHero, setIsPinnedHero] = useState(false);
  const [isAdminPick, setIsAdminPick] = useState(true);
  const [securityConfirmed, setSecurityConfirmed] = useState(false);
  const [publishPassword, setPublishPassword] = useState('');

  // Categories Manager State
  const [categoriesDraft, setCategoriesDraft] = useState<string[]>(websiteConfig?.categories || []);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Website Settings State
  const [siteTagline, setSiteTagline] = useState(websiteConfig?.tagline || 'Your Story. Your Screen.');
  const [maintenanceMode, setMaintenanceMode] = useState(Boolean(websiteConfig?.maintenanceMode));
  const [trendingEnabled, setTrendingEnabled] = useState(websiteConfig?.trendingEnabled ?? true);
  const [siteHeroAuto, setSiteHeroAuto] = useState(heroAutoFeature);
  const [uploadMaxHours, setUploadMaxHours] = useState(websiteConfig?.uploadMaxHours || 10);
  const [siteTimezone, setSiteTimezone] = useState(websiteConfig?.timezone || 'Asia/Jakarta');
  const [allowedDomains, setAllowedDomains] = useState(
    websiteConfig?.allowedStreamDomains || 'youtube.com,vimeo.com,dailymotion.com,archive.org,bilibili.com',
  );
  const [siteSettingsPw, setSiteSettingsPw] = useState('');
  const [danaQrVersion, setDanaQrVersion] = useState(Date.now());

  useEffect(() => {
    if (websiteConfig) {
      setCategoriesDraft(websiteConfig.categories || []);
      setSiteTagline(websiteConfig.tagline || 'Your Story. Your Screen.');
      setMaintenanceMode(Boolean(websiteConfig.maintenanceMode));
      setTrendingEnabled(websiteConfig.trendingEnabled ?? true);
      setSiteHeroAuto(websiteConfig.heroAutoFeature ?? heroAutoFeature);
      setUploadMaxHours(websiteConfig.uploadMaxHours || 10);
      setSiteTimezone(websiteConfig.timezone || 'Asia/Jakarta');
      setAllowedDomains(websiteConfig.allowedStreamDomains || '');
    }
  }, [websiteConfig, heroAutoFeature]);

  // Content Matching Verification State
  const [matchResult, setMatchResult] = useState<{
    matched: boolean;
    warnings: string[];
    detected?: { title: string; durationSeconds: number; resolution: string; audio: string };
  } | null>(null);
  const [verifyingMatch, setVerifyingMatch] = useState(false);

  // Resumable Chunk Upload State (up to 10h)
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');

  // Subtitle Upload
  const [subMovieId, setSubMovieId] = useState('');
  const [subLangLabel, setSubLangLabel] = useState('Bahasa Indonesia');
  const [subLangCode, setSubLangCode] = useState('id');

  // Poster Manager State
  const [posterDrafts, setPosterDrafts] = useState<Record<string, { posterUrl: string; backdropUrl: string }>>({});

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<Movie | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  // Change Master Password State
  const [currentMasterPw, setCurrentMasterPw] = useState('');
  const [newMasterPw, setNewMasterPw] = useState('');
  const [confirmMasterPw, setConfirmMasterPw] = useState('');

  const loadAdminData = async () => {
    const [statsRes, usersRes, moviesRes, paymentsRes] = await Promise.all([
      fetch('/api/admin/stats'),
      fetch('/api/admin/users'),
      fetch('/api/admin/movies'),
      fetch('/api/admin/payments'),
    ]);
    if (statsRes.ok) {
      const s = (await statsRes.json()) as {
        stats: AdminStats;
        topMovies: Array<Record<string, unknown>>;
        recentAudits: Array<Record<string, unknown>>;
        recentErrors?: Array<Record<string, unknown>>;
        backups: string[];
      };
      setStats(s.stats);
      setTopMovies(s.topMovies);
      setAudits(s.recentAudits);
      setErrorLogs(s.recentErrors || []);
      setBackups(s.backups);
    }
    if (usersRes.ok) {
      const u = (await usersRes.json()) as { users: Array<Record<string, unknown>> };
      setAdminUsers(u.users);
    }
    if (moviesRes.ok) {
      const mv = (await moviesRes.json()) as { movies: Movie[] };
      setAdminMovies(mv.movies || []);
    }
    if (paymentsRes.ok) {
      const py = (await paymentsRes.json()) as { payments: PaymentRecord[] };
      setAdminPayments(py.payments || []);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin' && user.is_admin_elevated) {
      void loadAdminData();
    }
  }, [user?.role, user?.is_admin_elevated]);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#080808] pt-28 px-4 text-center text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#171717] p-8 space-y-4">
          <Lock className="mx-auto h-10 w-10 text-[#FF163D]" />
          <h1 className="font-display text-2xl font-bold">Panel Administrator FLIXFIL</h1>
          <p className="text-xs text-zinc-400">Login dengan akun Administrator terotorisasi diperlukan.</p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="w-full rounded-xl bg-[#FF163D] py-3 text-xs font-semibold text-white"
          >
            Masuk sebagai Administrator
          </button>
        </div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#080808] pt-28 px-4 text-center text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-[#FF163D]/40 bg-[#171717] p-8 space-y-3">
          <ShieldAlert className="mx-auto h-10 w-10 text-[#FF163D]" />
          <h1 className="font-display text-xl font-bold">Akses Ditolak (403)</h1>
          <p className="text-xs text-zinc-400">
            Halaman ini dilindungi di level backend dan hanya dapat dibuka oleh Administrator FLIXFIL.
          </p>
        </div>
      </div>
    );
  }

  const handleElevateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setElevating(true);
    try {
      const res = await fetch('/api/admin/elevate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword, totpCode }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        onNotify(data.error || 'Verifikasi password khusus administrator gagal.', true);
        return;
      }
      setAdminPassword('');
      setTotpCode('');
      onNotify('Sesi Administrator terverifikasi (berlaku 2 jam).');
      await onRefreshAll();
    } finally {
      setElevating(false);
    }
  };

  if (!user.is_admin_elevated) {
    return (
      <div className="min-h-screen bg-[#080808] pt-28 px-4 flex items-start justify-center text-white">
        <form
          onSubmit={handleElevateAdmin}
          className="w-full max-w-md rounded-2xl border border-[#FF163D]/40 bg-[#171717] p-8 space-y-5 shadow-2xl"
        >
          <div className="flex items-center gap-3">
            <KeyRound className="h-7 w-7 text-[#FF163D]" />
            <div>
              <h1 className="font-display text-xl font-bold">Verifikasi Keamanan Admin</h1>
              <p className="text-xs text-zinc-400">
                Masukkan password khusus administrator untuk membuka kontrol penuh.
              </p>
            </div>
          </div>

          <input
            type="password"
            required
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Password Khusus Administrator"
            className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white focus:border-[#FF163D] focus:outline-none"
          />

          {user.totp_enabled === 1 && (
            <input
              type="text"
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="Kode 2FA Administrator (6 digit)"
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white font-mono-tabular"
            />
          )}

          <button
            type="submit"
            disabled={elevating}
            className="w-full rounded-xl bg-[#FF163D] py-3 text-sm font-semibold text-white hover:bg-[#e01034]"
          >
            {elevating ? 'Memverifikasi...' : 'Buka Dashboard Administrator'}
          </button>
        </form>
      </div>
    );
  }

  const catalogForAdmin = adminMovies.length > 0 ? adminMovies : movies;

  const handleInspectAdminLink = async () => {
    if (!linkInput.trim()) return;
    setMatchResult(null);
    const res = await fetch('/api/inspect-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: linkInput.trim() }),
    });
    const data = (await res.json()) as { metadata?: Record<string, unknown>; error?: string };
    if (!res.ok || !data.metadata) {
      onNotify(data.error || 'Tautan tidak dapat diperiksa.', true);
      return;
    }
    const md = data.metadata;
    setTitle(String(md.title || ''));
    setSynopsis(String(md.synopsis || ''));
    setDirector(String(md.director || ''));
    setReleaseYear(Number(md.releaseYear) || 2026);
    setPosterUrl(String(md.posterUrl || ''));
    setBackdropUrl(String(md.posterUrl || ''));
    setSourceType(String(md.sourceType || 'external_only'));
    setSourceUrl(String(md.sourceUrl || linkInput.trim()));
    setEmbedUrl(String(md.embedUrl || ''));
    setPlaybackSupported(Boolean(md.playbackSupported));
    setAvailableQualities(Array.isArray(md.availableQualities) ? (md.availableQualities as string[]) : ['Auto']);
    onNotify(String(md.notice || 'Metadata berhasil diambil.'));
  };

  const handleVerifyContentMatch = async () => {
    setVerifyingMatch(true);
    try {
      const res = await fetch('/api/admin/verify-content-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          releaseYear,
          durationSeconds,
          sourceUrl,
          sourceType,
        }),
      });
      const data = (await res.json()) as {
        matched: boolean;
        warnings: string[];
        detected?: { title: string; durationSeconds: number; resolution: string; audio: string };
        error?: string;
      };
      if (!res.ok) {
        onNotify(data.error || 'Pemeriksaan kesesuaian gagal.', true);
        return;
      }
      setMatchResult({ matched: data.matched, warnings: data.warnings || [], detected: data.detected });
      if (data.detected?.durationSeconds && data.detected.durationSeconds > 0) {
        setDurationSeconds(data.detected.durationSeconds);
      }
      onNotify(
        data.matched
          ? 'Verifikasi kesesuaian video & metadata berhasil: COCOK.'
          : 'Ditemukan peringatan perbedaan metadata/sumber. Periksa detail sebelum publikasi.',
        !data.matched,
      );
    } finally {
      setVerifyingMatch(false);
    }
  };

  const handleResumableVideoUpload = async (file: File | undefined) => {
    if (!file) return;
    setMatchResult(null);
    const chunkSize = 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
    setUploadStatusText('Memulai sesi unggahan terenkripsi & pemindaian keamanan...');
    setUploadProgress(0);
    setTranscodeProgress(0);

    const initRes = await fetch('/api/admin/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || 'video/mp4',
        totalSize: file.size,
        totalChunks,
        durationSeconds,
      }),
    });
    const initData = (await initRes.json()) as { uploadId?: string; error?: string };
    if (!initRes.ok || !initData.uploadId) {
      setUploadStatusText('');
      onNotify(initData.error || 'File ditolak oleh pemeriksaan awal.', true);
      return;
    }

    const uploadId = initData.uploadId;
    for (let i = 0; i < totalChunks; i += 1) {
      const slice = file.slice(i * chunkSize, (i + 1) * chunkSize);
      const buf = await slice.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let b = 0; b < bytes.length; b += 1) binary += String.fromCharCode(bytes[b]);
      const dataBase64 = btoa(binary);

      const chunkRes = await fetch(`/api/admin/upload/${uploadId}/chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunkIndex: i, dataBase64 }),
      });
      if (!chunkRes.ok) {
        const err = (await chunkRes.json()) as { error?: string };
        setUploadStatusText('');
        onNotify(err.error || 'File diblokir oleh pemindai virus/signature.', true);
        return;
      }
      setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
    }

    setUploadStatusText('Menggabungkan berkas & memulai transcoding HLS adaptif (FFmpeg)...');
    await fetch(`/api/admin/upload/${uploadId}/complete`, { method: 'POST' });

    const poll = window.setInterval(async () => {
      const stRes = await fetch(`/api/admin/upload/${uploadId}/status`);
      if (!stRes.ok) return;
      const st = (await stRes.json()) as {
        status: string;
        transcode_progress: number;
        output_hls_url: string;
        output_poster_url: string;
        availableQualities: string[];
        duration_seconds: number;
        error_message: string;
      };
      setTranscodeProgress(st.transcode_progress || 0);
      if (st.status === 'ready') {
        window.clearInterval(poll);
        setSourceType('hls');
        setSourceUrl(st.output_hls_url);
        if (st.output_poster_url && !posterUrl) setPosterUrl(st.output_poster_url);
        if (st.output_poster_url && !backdropUrl) setBackdropUrl(st.output_poster_url);
        setAvailableQualities(st.availableQualities);
        if (st.duration_seconds > 0) setDurationSeconds(st.duration_seconds);
        setPlaybackSupported(true);
        setPublishStatus('ready');
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
        setUploadStatusText('Transcoding HLS selesai! Video siap dipratinjau dan dipublikasikan.');
        onNotify('Video berhasil diunggah, dipindai, dan ditranskode.');
      } else if (st.status === 'failed') {
        window.clearInterval(poll);
        setUploadStatusText('');
        onNotify(st.error_message || 'Transcoding gagal.', true);
      }
    }, 1200);
  };

  const handleSavePublicMovie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityConfirmed) {
      onNotify('Centang konfirmasi keamanan admin terlebih dahulu.', true);
      return;
    }
    if (!publishPassword) {
      onNotify('Masukkan konfirmasi password administrator untuk memublikasikan film.', true);
      return;
    }
    const res = await fetch('/api/admin/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        category,
        type,
        country,
        releaseYear,
        originalReleaseDate,
        durationSeconds,
        director,
        cast: castStr.split(',').map((s) => s.trim()).filter(Boolean),
        genres: genresStr.split(',').map((s) => s.trim()).filter(Boolean),
        synopsis,
        posterUrl,
        backdropUrl: backdropUrl || posterUrl,
        sourceType,
        sourceUrl,
        premiumStreamUrl,
        embedUrl,
        playbackSupported,
        availableQualities,
        accessTier: 'free',
        freeMaxQuality: '1080p',
        publishStatus,
        isFeatured,
        isPinnedHero,
        isAdminPick,
        securityConfirmed,
        confirmAdminPassword: publishPassword,
      }),
    });
    if (res.ok) {
      onNotify(
        publishStatus === 'ready'
          ? 'Film berhasil dipublikasikan ke katalog publik FLIXFIL (gratis ditonton).'
          : `Film disimpan dengan status "${STATUS_BADGE[publishStatus].label}".`,
      );
      setTitle('');
      setSynopsis('');
      setLinkInput('');
      setSourceUrl('');
      setPremiumStreamUrl('');
      setEmbedUrl('');
      setPosterUrl('');
      setBackdropUrl('');
      setOriginalReleaseDate('');
      setPublishPassword('');
      setSecurityConfirmed(false);
      setMatchResult(null);
      await onRefreshAll();
      await loadAdminData();
    } else {
      const err = (await res.json()) as { error?: string };
      onNotify(err.error || 'Gagal menyimpan film.', true);
    }
  };

  const handlePatchMovie = async (m: Movie, patch: Record<string, unknown>, successMsg: string) => {
    const res = await fetch(`/api/admin/movies/${encodeURIComponent(m.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      onNotify(successMsg);
      await onRefreshAll();
      await loadAdminData();
    } else {
      const err = (await res.json()) as { error?: string };
      onNotify(err.error || 'Gagal memperbarui film.', true);
    }
  };

  const handleCheckMovieSource = async (m: Movie) => {
    const res = await fetch(`/api/admin/movies/${encodeURIComponent(m.id)}/check-source`, {
      method: 'POST',
    });
    const data = (await res.json()) as { publishStatus?: PublishStatus; error?: string };
    if (res.ok && data.publishStatus) {
      onNotify(`Pemeriksaan sumber "${m.title}": ${STATUS_BADGE[data.publishStatus].label}.`);
      await onRefreshAll();
      await loadAdminData();
    } else {
      onNotify(data.error || 'Pemeriksaan sumber gagal.', true);
    }
  };

  const handleConfirmDeleteMovie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/movies/${encodeURIComponent(deleteTarget.id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        securityConfirmed: true,
        confirmAdminPassword: deletePassword,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      onNotify(data.error || 'Gagal menghapus film.', true);
      return;
    }
    onNotify(`Film "${deleteTarget.title}" berhasil dihapus dari katalog.`);
    setDeleteTarget(null);
    setDeletePassword('');
    await onRefreshAll();
    await loadAdminData();
  };

  const handleUploadSubtitleToMovie = async (file: File | undefined) => {
    if (!file || !subMovieId) return;
    const content = await file.text();
    const res = await fetch(`/api/admin/movies/${encodeURIComponent(subMovieId)}/subtitles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        content,
        languageCode: subLangCode,
        languageLabel: subLangLabel,
        isDefault: subLangCode === 'id',
      }),
    });
    if (res.ok) {
      onNotify(`Subtitle ${subLangLabel} berhasil diunggah & dipindai.`);
    } else {
      const err = (await res.json()) as { error?: string };
      onNotify(err.error || 'Subtitle ditolak.', true);
    }
  };

  const handleSaveCategories = async () => {
    const res = await fetch('/api/admin/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: categoriesDraft }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok) {
      onNotify('Daftar kategori website berhasil diperbarui.');
      await onRefreshAll();
    } else {
      onNotify(data.error || 'Gagal menyimpan kategori.', true);
    }
  };

  const handleUploadDanaQr = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const imageDataUrl = String(reader.result || '');
      const res = await fetch('/api/admin/dana-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok) {
        setDanaQrVersion(Date.now());
        onNotify('Gambar QR Code DANA resmi berhasil disimpan apa adanya tanpa modifikasi.');
        await onRefreshAll();
      } else {
        onNotify(data.error || 'Gagal mengunggah QR Code DANA.', true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVerifyPayment = async (payId: string, action: 'approve' | 'reject') => {
    const res = await fetch(`/api/admin/payments/${encodeURIComponent(payId)}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok) {
      onNotify(
        action === 'approve'
          ? 'Pembayaran terverifikasi! Keanggotaan Premium pengguna telah aktif.'
          : 'Transaksi pembayaran ditolak.',
      );
      await loadAdminData();
      await onRefreshAll();
    } else {
      onNotify(data.error || 'Gagal memproses verifikasi pembayaran.', true);
    }
  };

  const handleSaveWebsiteSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/website-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tagline: siteTagline,
        maintenanceMode,
        trendingEnabled,
        heroAutoFeature: siteHeroAuto,
        uploadMaxHours,
        timezone: siteTimezone,
        allowedStreamDomains: allowedDomains,
        confirmAdminPassword: siteSettingsPw,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok) {
      setSiteSettingsPw('');
      onNotify('Pengaturan website berhasil diperbarui & dicatat ke audit log.');
      await onRefreshAll();
      await loadAdminData();
    } else {
      onNotify(data.error || 'Gagal menyimpan pengaturan website.', true);
    }
  };

  const handleChangeMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMasterPw.length < 12) {
      onNotify('Password administrator baru minimal 12 karakter.', true);
      return;
    }
    if (newMasterPw !== confirmMasterPw) {
      onNotify('Konfirmasi password administrator baru tidak cocok.', true);
      return;
    }
    const res = await fetch('/api/admin/change-master-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: currentMasterPw,
        newPassword: newMasterPw,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    if (res.ok) {
      setCurrentMasterPw('');
      setNewMasterPw('');
      setConfirmMasterPw('');
      onNotify(data.message || 'Password administrator berhasil diganti.');
      await loadAdminData();
    } else {
      onNotify(data.error || 'Gagal mengganti password administrator.', true);
    }
  };

  const handleUpdatePlanPrice = async (planId: string, priceIdr: number) => {
    const res = await fetch(`/api/admin/plans/${encodeURIComponent(planId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceIdr }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok) {
      onNotify('Harga paket langganan diperbarui.');
      await onRefreshAll();
    } else {
      onNotify(data.error || 'Gagal memperbarui harga.', true);
    }
  };

  const handleTriggerBackup = async () => {
    const res = await fetch('/api/admin/backup', { method: 'POST' });
    if (res.ok) {
      onNotify('Backup basis data berhasil dibuat.');
      await loadAdminData();
    }
  };

  const renderMetadataForm = () => (
    <form onSubmit={handleSavePublicMovie} className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Detail, Pratinjau &amp; Publikasi Katalog</h2>
        <button
          type="button"
          disabled={verifyingMatch}
          onClick={() => void handleVerifyContentMatch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#FF163D]/60 bg-[#FF163D]/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#FF163D]/30"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-[#FF163D]" />
          {verifyingMatch ? 'Memeriksa...' : 'Periksa Kesesuaian Video'}
        </button>
      </div>

      {/* Live Video Preview before publish */}
      {(sourceUrl || embedUrl) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
          <p className="border-b border-white/10 bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-zinc-400">
            Pratinjau Sumber Video ({sourceType.toUpperCase()})
          </p>
          {embedUrl && !sourceUrl.endsWith('.mp4') && !sourceUrl.endsWith('.m3u8') ? (
            <iframe
              src={embedUrl}
              title="Preview Video"
              className="aspect-video w-full border-0"
              allowFullScreen
            />
          ) : (
            <video src={sourceUrl} controls className="aspect-video w-full bg-black" />
          )}
        </div>
      )}

      {matchResult && (
        <div
          className={`rounded-xl border p-3.5 text-xs space-y-1.5 ${
            matchResult.matched
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-500/50 bg-amber-500/10 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {matchResult.matched ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            )}
            <span>
              {matchResult.matched
                ? 'Kesesuaian Video & Metadata Terverifikasi Cocok'
                : 'Peringatan Ketidaksesuaian Konten'}
            </span>
          </div>
          {matchResult.detected && (
            <p className="text-[11px] opacity-90 font-mono-tabular">
              Terdeteksi: {matchResult.detected.title || title} · {formatDuration(matchResult.detected.durationSeconds)} ·{' '}
              {matchResult.detected.resolution} · {matchResult.detected.audio}
            </p>
          )}
          {matchResult.warnings.map((w, i) => (
            <p key={i} className="text-[11px]">• {w}</p>
          ))}
        </div>
      )}

      <input
        type="text"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Judul Film Resmi"
        className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
      />
      <div className="grid grid-cols-2 gap-3 text-xs">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white"
        >
          {(categoriesDraft.length > 0 ? categoriesDraft : ['Film Indonesia', 'Horor Indonesia', 'Drama Indonesia', 'Hollywood']).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as Movie['type'])}
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white"
        >
          <option value="film">Film</option>
          <option value="series">Serial</option>
          <option value="anime">Anime</option>
          <option value="drama">Drama</option>
          <option value="documentary">Dokumenter</option>
          <option value="concert">Konser / Panjang</option>
          <option value="short">Film Pendek</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <input
          type="text"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Negara"
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white"
        />
        <input
          type="number"
          value={releaseYear}
          onChange={(e) => setReleaseYear(Number(e.target.value))}
          placeholder="Tahun"
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white font-mono-tabular"
        />
        <input
          type="date"
          value={originalReleaseDate}
          onChange={(e) => setOriginalReleaseDate(e.target.value)}
          title="Tanggal Rilis Asli Film"
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white font-mono-tabular"
        />
        <input
          type="text"
          value={director}
          onChange={(e) => setDirector(e.target.value)}
          placeholder="Sutradara"
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <input
          type="text"
          value={genresStr}
          onChange={(e) => setGenresStr(e.target.value)}
          placeholder="Genre (pisahkan koma)"
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white"
        />
        <input
          type="text"
          value={castStr}
          onChange={(e) => setCastStr(e.target.value)}
          placeholder="Pemeran (pisahkan koma)"
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <input
          type="url"
          value={posterUrl}
          onChange={(e) => setPosterUrl(e.target.value)}
          placeholder="URL Poster Resmi"
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white"
        />
        <input
          type="url"
          value={backdropUrl}
          onChange={(e) => setBackdropUrl(e.target.value)}
          placeholder="URL Backdrop Hero Resmi"
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 text-xs">
        <input
          type="text"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="URL Sumber Video / HLS (.m3u8) / MP4 (Gratis hingga 1080p)"
          className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2 text-white"
        />
        <input
          type="text"
          value={premiumStreamUrl}
          onChange={(e) => setPremiumStreamUrl(e.target.value)}
          placeholder="URL 1080p Premium HD Bitrate Tinggi (Opsional)"
          className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2 text-white"
        />
      </div>

      <textarea
        rows={3}
        value={synopsis}
        onChange={(e) => setSynopsis(e.target.value)}
        placeholder="Sinopsis resmi film..."
        className="w-full rounded-xl border border-white/10 bg-black/60 p-3 text-xs text-white"
      />

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-200">
          <p className="font-semibold">Kebijakan Akses FLIXFIL</p>
          <p className="text-[11px] opacity-90">Semua film gratis ditonton (144p–1080p Standar)</p>
        </div>
        <div>
          <label className="text-zinc-400 block mb-1">Status Publikasi</label>
          <select
            value={publishStatus}
            onChange={(e) => setPublishStatus(e.target.value as PublishStatus)}
            className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-white"
          >
            <option value="ready">Siap Ditayangkan (Publik)</option>
            <option value="pending_check">Menunggu Pemeriksaan</option>
            <option value="processing">Sedang Diproses</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-zinc-300">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isPinnedHero} onChange={(e) => setIsPinnedHero(e.target.checked)} className="accent-[#FF163D]" />
          PIN TO FEATURE (Hero Utama)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="accent-[#FF163D]" />
          Unggulan Katalog
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isAdminPick} onChange={(e) => setIsAdminPick(e.target.checked)} className="accent-[#FF163D]" />
          Pilihan Kurator
        </label>
      </div>

      <label className="flex items-start gap-2 rounded-xl border border-[#FF163D]/40 bg-[#FF163D]/10 p-3 text-xs text-zinc-200">
        <input
          type="checkbox"
          checked={securityConfirmed}
          onChange={(e) => setSecurityConfirmed(e.target.checked)}
          className="mt-0.5 accent-[#FF163D]"
        />
        <span>
          Konfirmasi Keamanan Admin: Saya memastikan konten sah secara hukum dan metadata sesuai dengan isi video.
        </span>
      </label>

      <input
        type="password"
        required
        value={publishPassword}
        onChange={(e) => setPublishPassword(e.target.value)}
        placeholder="Konfirmasi Password Administrator untuk Publikasi"
        className="w-full rounded-xl border border-[#FF163D]/40 bg-black/60 px-3.5 py-2.5 text-xs text-white"
      />

      <button
        type="submit"
        className="w-full rounded-xl bg-[#FF163D] py-3 text-sm font-semibold text-white hover:bg-[#e01034]"
      >
        SIMPAN &amp; PUBLIKASIKAN FILM
      </button>
    </form>
  );

  return (
    <div className="min-h-screen bg-[#080808] pt-24 pb-16 px-4 sm:px-8 lg:px-12 text-white">
      <div className="mx-auto max-w-[1440px] space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FF163D]">
              FLIXFIL ADMIN CONSOLE
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold">Panel Administrator</h1>
          </div>
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/admin/lock', { method: 'POST' });
              await onRefreshAll();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#171717] px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:border-[#FF163D]"
          >
            <Lock className="h-3.5 w-3.5 text-[#FF163D]" />
            Kunci Admin
          </button>
        </div>

        {/* Full Administrator Tab Bar */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-white/10 pb-3">
          {[
            { id: 'overview', label: 'Dashboard Admin', icon: LayoutDashboard },
            { id: 'add', label: 'Tambahkan Film', icon: PlusCircle },
            { id: 'upload', label: 'Upload Video', icon: Upload },
            { id: 'manage', label: 'Kelola Film', icon: Film },
            { id: 'posters', label: 'Kelola Poster', icon: ImageIcon },
            { id: 'subtitles', label: 'Kelola Subtitle', icon: Captions },
            { id: 'categories', label: 'Kelola Kategori', icon: FolderKanban },
            { id: 'users', label: 'Kelola Pengguna & Pembayaran', icon: Users },
            { id: 'security', label: 'Statistik & Keamanan', icon: BarChart3 },
            { id: 'settings', label: 'Pengaturan Website', icon: Sliders },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id as AdminSubTab)}
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

        {/* OVERVIEW */}
        {tab === 'overview' && stats && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: 'Total Pengguna', val: stats.totalUsers.toLocaleString('id-ID') },
                { label: 'Total Film Publik', val: stats.totalMovies.toLocaleString('id-ID') },
                { label: 'Total Tontonan Nyata', val: stats.totalViews.toLocaleString('id-ID') },
                { label: 'Pelanggan Premium', val: stats.totalPremium.toLocaleString('id-ID') },
                { label: 'Pendapatan Langganan', val: formatRupiah(stats.totalRevenue) },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-2xl border border-white/10 bg-[#171717] p-5">
                  <p className="text-xs text-zinc-400">{kpi.label}</p>
                  <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-white">{kpi.val}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#171717] p-6">
              <h2 className="font-display text-lg font-bold mb-4">Kinerja Katalog &amp; Smart Trending</h2>
              {topMovies.length === 0 ? (
                <p className="text-xs text-zinc-400 py-4">
                  Belum ada film di katalog publik. Gunakan tab <strong>Tambahkan Film</strong> atau{' '}
                  <strong>Upload Video</strong> untuk mempublikasikan film pertama.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-400">
                        <th className="pb-2">Judul</th>
                        <th className="pb-2">Kategori</th>
                        <th className="pb-2 text-right">Tontonan</th>
                        <th className="pb-2 text-right">Favorit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {topMovies.map((m) => (
                        <tr key={String(m.id)}>
                          <td className="py-2.5 font-semibold text-white">{String(m.title)}</td>
                          <td className="py-2.5 text-zinc-400">{String(m.category)}</td>
                          <td className="py-2.5 text-right font-mono-tabular">
                            {Number(m.view_count).toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 text-right font-mono-tabular">
                            {Number(m.favorite_count).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADD MOVIE (URL / MANUAL) */}
        {tab === 'add' && (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4">
                <h2 className="font-display text-lg font-bold">Tambahkan Film dari Tautan Sumber Resmi</h2>
                <p className="text-xs text-zinc-400">
                  Mendukung YouTube, Vimeo, Dailymotion, Internet Archive, Bilibili, HLS (.m3u8), atau MP4 sah.
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="Tempel tautan video di sini..."
                    className="flex-1 rounded-xl border border-white/15 bg-black/60 px-3.5 py-2.5 text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void handleInspectAdminLink()}
                    className="rounded-xl bg-[#FF163D] px-4 py-2.5 text-xs font-semibold text-white whitespace-nowrap"
                  >
                    Deteksi Otomatis
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-3 text-xs text-zinc-300">
                <h3 className="font-display text-sm font-bold text-white">Alur Publikasi Otomatis Dashboard</h3>
                <p>1. Tempel URL resmi atau unggah file video di tab Upload Video (maks. {uploadMaxHours} jam).</p>
                <p>2. Klik <strong>Periksa Kesesuaian Video</strong> untuk memvalidasi durasi, judul, dan pratinjau.</p>
                <p>3. Pilih status publikasi <strong>Siap Ditayangkan</strong> &amp; tekan simpan dengan password admin.</p>
              </div>
            </div>
            {renderMetadataForm()}
          </div>
        )}

        {/* UPLOAD VIDEO (UP TO 10 HOURS) */}
        {tab === 'upload' && (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4 h-fit">
              <h2 className="font-display text-lg font-bold">Unggah Video Resmi (Hingga {uploadMaxHours} Jam)</h2>
              <p className="text-xs text-zinc-400">
                Mendukung file besar melalui chunk resumable upload, pemindaian keamanan magic-byte, dan transcoding FFmpeg HLS adaptif (hanya resolusi yang didukung video asli, tanpa upscaling palsu).
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label>
                  <span className="text-zinc-400 block mb-1">Perkiraan Durasi (detik, maks 36.000)</span>
                  <input
                    type="number"
                    max={36000}
                    min={1}
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(Math.min(36000, Number(e.target.value)))}
                    className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-white font-mono-tabular"
                  />
                </label>
                <div className="flex items-end">
                  <label className="w-full cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl border border-[#FF163D]/60 bg-[#FF163D]/15 px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#FF163D]/30">
                    <Upload className="h-4 w-4" />
                    Pilih File Video
                    <input
                      type="file"
                      accept=".mp4,.webm,.mkv,.mov"
                      className="hidden"
                      onChange={(e) => void handleResumableVideoUpload(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>

              {uploadStatusText && (
                <div className="space-y-2 rounded-xl bg-black/50 p-3 text-xs">
                  <p className="text-zinc-200">{uploadStatusText}</p>
                  <div className="flex justify-between font-mono-tabular text-[11px] text-zinc-400">
                    <span>Upload: {uploadProgress}%</span>
                    <span>Transcode HLS: {transcodeProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-[#FF163D] transition-all"
                      style={{ width: `${Math.max(uploadProgress, transcodeProgress)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            {renderMetadataForm()}
          </div>
        )}

        {/* MANAGE MOVIES (WITH PUBLISH STATUS & SOURCE HEALTH CHECK) */}
        {tab === 'manage' && (
          <div className="space-y-3">
            {catalogForAdmin.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#171717] p-10 text-center text-xs text-zinc-400">
                Belum ada film di katalog.
              </div>
            ) : (
              catalogForAdmin.map((m) => {
                const st: PublishStatus = m.publishStatus || 'ready';
                const badge = STATUS_BADGE[st] || STATUS_BADGE.ready;
                return (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded border border-white/10">
                        <FilmPoster movie={m} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-sm text-white truncate">{m.title}</p>
                          <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-zinc-400 truncate mt-0.5">
                          {m.category} · {m.sourceType.toUpperCase()} · {formatDuration(m.durationSeconds)} · Masuk{' '}
                          {formatJakartaDateShort(m.publishedAt || m.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={st}
                        aria-label={`Ubah status ${m.title}`}
                        onChange={(e) =>
                          void handlePatchMovie(
                            m,
                            { publishStatus: e.target.value },
                            `Status "${m.title}" diperbarui ke ${STATUS_BADGE[e.target.value as PublishStatus].label}.`,
                          )
                        }
                        className="rounded-lg border border-white/15 bg-black/60 px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="ready">Siap Ditayangkan</option>
                        <option value="pending_check">Menunggu Pemeriksaan</option>
                        <option value="processing">Sedang Diproses</option>
                        <option value="failed">Gagal Diproses</option>
                        <option value="unavailable">Sumber Tidak Tersedia</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => void handleCheckMovieSource(m)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 font-semibold text-zinc-200 hover:border-[#FF163D]"
                      >
                        <RefreshCw className="h-3 w-3 text-[#FF163D]" />
                        Cek Sumber
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handlePatchMovie(
                            m,
                            { isPinnedHero: !m.isPinnedHero },
                            m.isPinnedHero ? `"${m.title}" dilepas dari Pin Hero.` : `"${m.title}" disematkan ke Hero Banner!`,
                          )
                        }
                        className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-semibold ${
                          m.isPinnedHero
                            ? 'bg-[#FF163D] text-white'
                            : 'border border-white/15 bg-black/50 text-zinc-300 hover:border-[#FF163D]'
                        }`}
                      >
                        <Pin className="h-3 w-3" />
                        {m.isPinnedHero ? 'PINNED HERO' : 'PIN TO FEATURE'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(m);
                          setDeletePassword('');
                        }}
                        className="rounded-lg border border-white/15 p-2 text-zinc-400 hover:border-red-500 hover:text-red-400"
                        aria-label={`Hapus ${m.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* MANAGE POSTERS */}
        {tab === 'posters' && (
          <div className="grid gap-4 md:grid-cols-2">
            {catalogForAdmin.length === 0 ? (
              <div className="md:col-span-2 rounded-2xl border border-white/10 bg-[#171717] p-10 text-center text-xs text-zinc-400">
                Belum ada film untuk dikelola posternya.
              </div>
            ) : (
              catalogForAdmin.map((m) => {
                const draft = posterDrafts[m.id] || { posterUrl: m.posterUrl, backdropUrl: m.backdropUrl };
                return (
                  <div key={m.id} className="flex gap-4 rounded-2xl border border-white/10 bg-[#171717] p-4 text-xs">
                    <div className="h-32 w-22 shrink-0 overflow-hidden rounded-lg border border-white/10">
                      <FilmPoster movie={{ ...m, posterUrl: draft.posterUrl }} />
                    </div>
                    <div className="flex-1 space-y-2 min-w-0">
                      <p className="font-display text-sm font-bold text-white truncate">{m.title}</p>
                      <input
                        type="url"
                        value={draft.posterUrl}
                        onChange={(e) =>
                          setPosterDrafts((prev) => ({
                            ...prev,
                            [m.id]: { ...draft, posterUrl: e.target.value },
                          }))
                        }
                        placeholder="URL Poster Resmi"
                        className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-white"
                      />
                      <input
                        type="url"
                        value={draft.backdropUrl}
                        onChange={(e) =>
                          setPosterDrafts((prev) => ({
                            ...prev,
                            [m.id]: { ...draft, backdropUrl: e.target.value },
                          }))
                        }
                        placeholder="URL Backdrop Hero Resmi"
                        className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void handlePatchMovie(
                            m,
                            { posterUrl: draft.posterUrl, backdropUrl: draft.backdropUrl },
                            `Poster & backdrop "${m.title}" diperbarui.`,
                          )
                        }
                        className="rounded-lg bg-[#FF163D] px-4 py-1.5 font-semibold text-white hover:bg-[#e01034]"
                      >
                        Simpan Poster
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* MANAGE SUBTITLES */}
        {tab === 'subtitles' && (
          <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4">
            <h2 className="font-display text-lg font-bold">Unggah Subtitle (.SRT / .VTT) ke Film</h2>
            <div className="grid gap-3 sm:grid-cols-4 text-xs">
              <select
                value={subMovieId}
                onChange={(e) => setSubMovieId(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white"
              >
                <option value="">Pilih Film...</option>
                {catalogForAdmin.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
              <input
                type="text"
                value={subLangCode}
                onChange={(e) => setSubLangCode(e.target.value)}
                placeholder="Kode (id / en)"
                className="rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white"
              />
              <input
                type="text"
                value={subLangLabel}
                onChange={(e) => setSubLangLabel(e.target.value)}
                placeholder="Label Bahasa"
                className="rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white"
              />
              <label className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF163D] px-4 py-2.5 font-semibold text-white">
                <Upload className="h-4 w-4" />
                Pilih File SRT/VTT
                <input
                  type="file"
                  accept=".srt,.vtt"
                  className="hidden"
                  onChange={(e) => void handleUploadSubtitleToMovie(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
        )}

        {/* MANAGE CATEGORIES */}
        {tab === 'categories' && (
          <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-5 max-w-3xl">
            <div>
              <h2 className="font-display text-lg font-bold">Kelola Kategori Website</h2>
              <p className="text-xs text-zinc-400">
                Kategori di bawah tampil pada strip beranda, halaman Jelajahi, dan formulir penambahan film.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Tambah kategori baru (mis. Sci-Fi Indonesia)..."
                className="flex-1 rounded-xl border border-white/15 bg-black/60 px-3.5 py-2.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => {
                  const clean = newCategoryName.trim();
                  if (clean.length < 2) return;
                  if (!categoriesDraft.includes(clean)) {
                    setCategoriesDraft((prev) => [...prev, clean]);
                  }
                  setNewCategoryName('');
                }}
                className="rounded-xl bg-[#FF163D] px-4 py-2.5 text-xs font-semibold text-white"
              >
                Tambah
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {categoriesDraft.map((cat) => (
                <div
                  key={cat}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white"
                >
                  <span>{cat}</span>
                  <button
                    type="button"
                    onClick={() => setCategoriesDraft((prev) => prev.filter((c) => c !== cat))}
                    className="text-zinc-400 hover:text-red-400"
                    aria-label={`Hapus kategori ${cat}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void handleSaveCategories()}
              className="rounded-xl bg-[#FF163D] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#e01034]"
            >
              Simpan Susunan Kategori
            </button>
          </div>
        )}

        {/* USERS, PLANS & PAYMENT VERIFICATION */}
        {tab === 'users' && (
          <div className="space-y-8">
            {/* DANA QR & Pending Payments Verification */}
            <div className="rounded-2xl border border-[#FF163D]/40 bg-[#171717] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-bold flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-[#FF163D]" />
                    Verifikasi Pembayaran Pengguna (DANA QR &amp; Gateway)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Pembayaran DANA QR hanya mengaktifkan status Premium setelah Anda memverifikasi kecocokan mutasi di rekening DANA.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadAdminData()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 hover:border-[#FF163D]"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Segarkan
                </button>
              </div>

              {adminPayments.length === 0 ? (
                <p className="text-xs text-zinc-400">Belum ada transaksi pembayaran masuk.</p>
              ) : (
                <div className="space-y-2">
                  {adminPayments.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/45 px-4 py-3 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {p.display_name || p.username} (@{p.username}) · {p.plan_name}
                        </p>
                        <p className="text-zinc-400 font-mono-tabular mt-0.5">
                          {p.external_ref} · {(p.payment_method || p.provider).toUpperCase()} ·{' '}
                          <strong className="text-white">{formatRupiah(p.amount_idr)}</strong> ·{' '}
                          {formatJakartaDateShort(p.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleVerifyPayment(p.id, 'approve')}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500"
                            >
                              Verifikasi &amp; Aktifkan
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleVerifyPayment(p.id, 'reject')}
                              className="rounded-lg border border-red-500/40 px-3 py-1.5 font-semibold text-red-300 hover:bg-red-500/15"
                            >
                              Tolak
                            </button>
                          </>
                        ) : (
                          <span
                            className={`rounded-lg px-3 py-1 font-semibold uppercase ${
                              p.status === 'paid'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {p.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4">
                <h2 className="font-display text-lg font-bold">Pengaturan Harga Paket (Maks. Rp20.000)</h2>
                {plans.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/40 p-3.5 text-xs">
                    <div>
                      <p className="font-semibold text-white">{p.name}</p>
                      <p className="text-zinc-400">{p.duration_days} hari</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1000}
                        max={20000}
                        defaultValue={p.price_idr}
                        id={`price_${p.id}`}
                        className="w-28 rounded-lg border border-white/15 bg-black px-3 py-1.5 text-white font-mono-tabular"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(`price_${p.id}`) as HTMLInputElement | null;
                          if (el) void handleUpdatePlanPrice(p.id, Number(el.value));
                        }}
                        className="rounded-lg bg-[#FF163D] px-3 py-1.5 font-semibold text-white"
                      >
                        Simpan
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-3">
                <h2 className="font-display text-lg font-bold">Daftar Pengguna Terdaftar</h2>
                {adminUsers.map((u) => (
                  <div key={String(u.id)} className="flex items-center justify-between rounded-xl bg-black/40 p-3 text-xs">
                    <div>
                      <p className="font-semibold text-white">
                        {String(u.display_name)} <span className="text-zinc-400">(@{String(u.username)})</span>
                      </p>
                      <p className="text-zinc-400">
                        {String(u.role).toUpperCase()} · {String(u.subscription_tier).toUpperCase()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const nextTier = u.subscription_tier === 'premium' ? 'free' : 'premium';
                        await fetch(`/api/admin/users/${encodeURIComponent(String(u.id))}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ subscriptionTier: nextTier }),
                        });
                        onNotify(`Tier akun ${String(u.username)} diubah ke ${nextTier}.`);
                        await loadAdminData();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-zinc-200 hover:border-[#FF163D]"
                    >
                      <Crown className="h-3.5 w-3.5 text-[#FF163D]" />
                      Toggle Premium
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECURITY, ERRORS & BACKUPS */}
        {tab === 'security' && (
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4 h-fit">
              <h2 className="font-display text-lg font-bold flex items-center gap-2">
                <Database className="h-4 w-4 text-[#FF163D]" /> Backup Basis Data
              </h2>
              <p className="text-xs text-zinc-400">
                Backup otomatis berjalan setiap 12 jam. Anda dapat membuat snapshot kapan saja.
              </p>
              <button
                type="button"
                onClick={() => void handleTriggerBackup()}
                className="w-full rounded-xl bg-[#FF163D] py-2.5 text-xs font-semibold text-white"
              >
                Buat Backup Sekarang
              </button>
              <div className="space-y-1.5 border-t border-white/10 pt-3">
                {backups.map((b) => (
                  <p key={b} className="font-mono-tabular text-[11px] text-zinc-300 truncate">{b}</p>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-3">
                <h2 className="font-display text-lg font-bold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#FF163D]" /> Log Audit Keamanan Administrator
                </h2>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {audits.map((a) => (
                    <div key={String(a.id)} className="rounded-lg bg-black/40 p-3 text-xs flex justify-between gap-4">
                      <div>
                        <p className="font-mono-tabular font-semibold text-[#FF163D]">{String(a.action)}</p>
                        <p className="text-zinc-300 mt-0.5">{String(a.details)}</p>
                      </div>
                      <span className="font-mono-tabular text-[11px] text-zinc-500 shrink-0">
                        {String(a.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-3">
                <h2 className="font-display text-lg font-bold">Catatan Error Server</h2>
                {errorLogs.length === 0 ? (
                  <p className="text-xs text-zinc-400">Tidak ada error sistem tercatat.</p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {errorLogs.map((e) => (
                      <div key={String(e.id)} className="rounded-lg bg-black/40 p-3 text-xs">
                        <p className="font-mono-tabular font-semibold text-amber-400">{String(e.route)}</p>
                        <p className="text-zinc-300 mt-0.5">{String(e.message)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* WEBSITE, DANA QR & ADMIN SECURITY SETTINGS */}
        {tab === 'settings' && (
          <div className="grid gap-8 lg:grid-cols-2">
            <form onSubmit={handleSaveWebsiteSettings} className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4 text-xs">
              <h2 className="font-display text-lg font-bold text-white">Pengaturan Website FLIXFIL</h2>
              <label className="block space-y-1">
                <span className="text-zinc-400">Slogan / Tagline Resmi</span>
                <input
                  type="text"
                  value={siteTagline}
                  onChange={(e) => setSiteTagline(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3.5 py-2.5 text-white"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-zinc-400">Batas Upload (Jam, 1–10)</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={uploadMaxHours}
                    onChange={(e) => setUploadMaxHours(Math.min(10, Math.max(1, Number(e.target.value))))}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-white font-mono-tabular"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Zona Waktu Server</span>
                  <select
                    value={siteTimezone}
                    onChange={(e) => setSiteTimezone(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-white"
                  >
                    <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                    <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                    <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-zinc-400">Domain Streaming Eksternal Diizinkan (pisahkan koma)</span>
                <input
                  type="text"
                  value={allowedDomains}
                  onChange={(e) => setAllowedDomains(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3.5 py-2 text-white font-mono-tabular"
                />
              </label>

              <div className="space-y-2.5 pt-1 text-zinc-200">
                <label className="flex items-center gap-2.5">
                  <input type="checkbox" checked={siteHeroAuto} onChange={(e) => setSiteHeroAuto(e.target.checked)} className="accent-[#FF163D]" />
                  Aktifkan Auto Feature Hero Banner (Smart Trending)
                </label>
                <label className="flex items-center gap-2.5">
                  <input type="checkbox" checked={trendingEnabled} onChange={(e) => setTrendingEnabled(e.target.checked)} className="accent-[#FF163D]" />
                  Aktifkan baris Smart Trending di Beranda
                </label>
                <label className="flex items-center gap-2.5 text-amber-300 font-semibold">
                  <input type="checkbox" checked={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.checked)} className="accent-[#FF163D]" />
                  Aktifkan Mode Maintenance Website (Tampilkan pemberitahuan perawatan)
                </label>
              </div>

              <input
                type="password"
                required
                value={siteSettingsPw}
                onChange={(e) => setSiteSettingsPw(e.target.value)}
                placeholder="Konfirmasi Password Khusus Administrator"
                className="w-full rounded-xl border border-[#FF163D]/40 bg-black/60 px-3.5 py-2.5 text-white"
              />

              <button
                type="submit"
                className="w-full rounded-xl bg-[#FF163D] py-3 text-xs font-bold text-white hover:bg-[#e01034]"
              >
                Simpan Pengaturan Website
              </button>
            </form>

            <div className="space-y-6">
              {/* Official DANA QR Image Upload */}
              <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4 text-xs">
                <h2 className="font-display text-lg font-bold flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-[#FF163D]" />
                  QR Code DANA Resmi Pemilik (Tanpa Modifikasi)
                </h2>
                <p className="text-zinc-400 leading-relaxed">
                  Unggah gambar QR Code DANA asli pemilik (PNG/JPG/WebP). Gambar disimpan utuh tanpa nomor telepon di halaman publik dan ditampilkan di checkout DANA QR.
                </p>

                {websiteConfig?.danaQrConfigured && (
                  <div className="flex justify-center rounded-xl bg-black/50 p-4 border border-white/10">
                    <img
                      src={`/api/payments/dana-qr-image?v=${danaQrVersion}`}
                      alt="Pratinjau QR Code DANA Resmi"
                      className="max-h-48 rounded-lg bg-white p-2 object-contain"
                    />
                  </div>
                )}

                <label className="cursor-pointer inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#FF163D]/60 bg-[#FF163D]/15 px-4 py-3 font-semibold text-white hover:bg-[#FF163D]/30">
                  <Upload className="h-4 w-4" />
                  {websiteConfig?.danaQrConfigured ? 'Ganti Gambar QR Code DANA Resmi' : 'Unggah Gambar QR Code DANA Resmi'}
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => handleUploadDanaQr(e.target.files?.[0])}
                  />
                </label>
              </div>

              <form
                onSubmit={handleChangeMasterPassword}
                className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-[#FF163D]" />
                  Ganti Password Khusus Administrator
                </h2>
                <p className="text-xs text-zinc-400">
                  Minimal 12 karakter. Dibutuhkan saat membuka dashboard, mengubah konfigurasi website, dan memublikasikan/menghapus film.
                </p>
                <input
                  type="password"
                  required
                  value={currentMasterPw}
                  onChange={(e) => setCurrentMasterPw(e.target.value)}
                  placeholder="Password Administrator Saat Ini"
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-xs text-white"
                />
                <input
                  type="password"
                  required
                  minLength={12}
                  value={newMasterPw}
                  onChange={(e) => setNewMasterPw(e.target.value)}
                  placeholder="Password Administrator Baru (min. 12 karakter)"
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-xs text-white"
                />
                <input
                  type="password"
                  required
                  minLength={12}
                  value={confirmMasterPw}
                  onChange={(e) => setConfirmMasterPw(e.target.value)}
                  placeholder="Ulangi Password Administrator Baru"
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-xs text-white"
                />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#FF163D] py-3 text-xs font-semibold text-white hover:bg-[#e01034]"
                >
                  Perbarui Password Administrator
                </button>
              </form>

              <div className="rounded-2xl border border-white/10 bg-[#171717] p-6 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-zinc-400">Sesi Panel Admin</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch('/api/admin/lock', { method: 'POST' });
                      await onRefreshAll();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-[#FF163D]"
                  >
                    <Lock className="h-3.5 w-3.5 text-[#FF163D]" />
                    Kunci Sesi
                  </button>
                  <button
                    type="button"
                    onClick={() => void onLogout()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF163D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e01034]"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Logout Admin
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Secure Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleConfirmDeleteMovie}
            className="w-full max-w-md rounded-2xl border border-[#FF163D]/40 bg-[#171717] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-white">Konfirmasi Hapus Film</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Anda akan menghapus <strong className="text-white">{deleteTarget.title}</strong> secara permanen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="password"
              required
              autoFocus
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Masukkan Password Khusus Administrator"
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-white/15 px-4 py-2 text-xs text-zinc-300"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#FF163D] px-5 py-2 text-xs font-semibold text-white hover:bg-[#e01034]"
              >
                Hapus Permanen
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
