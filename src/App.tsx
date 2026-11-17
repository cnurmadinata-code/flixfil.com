import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Wrench } from 'lucide-react';
import type {
  AdminSubTab,
  CustomList,
  Episode,
  LanguageCode,
  LinkedGoogleAccount,
  Movie,
  NotificationItem,
  PaymentRecord,
  RouteView,
  SubscriptionPlan,
  SubtitleTrack,
  UserProfile,
  UserSettings,
  WebsiteConfig,
} from './types';
import { playUiSound, setUiSoundsEnabled } from './utils/audioUi';
import { syncServerClock } from './utils/jakartaTime';
import { LoadingScreen } from './components/LoadingScreen';
import { NavbarAndSidebar } from './components/NavbarAndSidebar';
import { FlixfilLogo } from './components/FlixfilLogo';
import { VideoPlayerView } from './components/VideoPlayerView';
import { HomePage } from './pages/HomePage';
import { ExplorePage, TrendingPage } from './pages/ExploreAndTrendingPages';
import { MovieDetailPage } from './pages/MovieDetailPage';
import { TambahTontonanPage } from './pages/TambahTontonanPage';
import { MyRoomPage } from './pages/MyRoomPage';
import { PremiumPage, SettingsPage } from './pages/PremiumAndSettingsPages';
import { AuthPages } from './pages/AuthPages';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

interface ToastMessage {
  id: number;
  text: string;
  isError: boolean;
}

const LINKED_ACCOUNTS_KEY = 'flixfil_linked_google_accounts';

function loadLinkedGoogleAccounts(): LinkedGoogleAccount[] {
  try {
    const raw = localStorage.getItem(LINKED_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const NAV_ORDER: Partial<Record<RouteView, number>> = {
  home: 0,
  explore: 1,
  indonesia: 2,
  trending: 3,
  'my-room': 4,
  favorites: 4,
  history: 4,
  premium: 5,
  tambah: 6,
  settings: 7,
};

const pageVariants = {
  initial: (dir: number) => ({
    opacity: 0,
    x: dir === 0 ? 0 : dir * 18,
    y: dir === 0 ? 8 : 0,
  }),
  animate: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir === 0 ? 0 : dir * -14,
    y: dir === 0 ? -6 : 0,
    transition: {
      duration: 0.13,
      ease: [0.4, 0, 1, 1] as const,
    },
  }),
};

export default function App() {
  const [introDone, setIntroDone] = useState(false);
  const [view, setView] = useState<RouteView>('home');
  const [previousView, setPreviousView] = useState<RouteView>('home');
  const [exploreCategory, setExploreCategory] = useState<string>('all');
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('overview');
  const [lang, setLang] = useState<LanguageCode>('id');

  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [websiteConfig, setWebsiteConfig] = useState<WebsiteConfig | null>(null);
  const [googleClientId, setGoogleClientId] = useState('');
  const [heroAutoFeature, setHeroAutoFeature] = useState(true);
  const [linkedGoogleAccounts, setLinkedGoogleAccounts] = useState<LinkedGoogleAccount[]>(loadLinkedGoogleAccounts);

  const [movies, setMovies] = useState<Movie[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [customLists, setCustomLists] = useState<CustomList[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [selectedMovieId, setSelectedMovieId] = useState<string>('');
  const [playerState, setPlayerState] = useState<{
    movie: Movie;
    episodes: Episode[];
    subtitles: SubtitleTrack[];
    related: Movie[];
    episodeId?: string;
  } | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [navDirection, setNavDirection] = useState<number>(0);
  const scrollPositionsRef = useRef<Partial<Record<RouteView, number>>>({});
  const pendingScrollTargetRef = useRef<number | null>(null);

  const notify = useCallback((text: string, isError = false) => {
    playUiSound('notify');
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, text, isError }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  // Dynamically apply user appearance & accessibility preferences onto <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings?.theme_mode === 'light') {
      root.classList.add('flixfil-light');
      root.classList.remove('dark');
    } else {
      root.classList.remove('flixfil-light');
      root.classList.add('dark');
    }

    const intensity = (settings?.accent_intensity ?? 100) / 100;
    root.style.setProperty('--accent-intensity', String(intensity));

    const fontScale =
      settings?.text_scale === 'small' ? '0.92' : settings?.text_scale === 'large' ? '1.08' : '1';
    root.style.setProperty('--font-scale', fontScale);

    if (settings?.animations_enabled === 0) root.classList.add('flixfil-no-anim');
    else root.classList.remove('flixfil-no-anim');

    if (settings?.transitions_enabled === 0) root.classList.add('flixfil-no-transitions');
    else root.classList.remove('flixfil-no-transitions');
  }, [settings]);

  const recordLinkedGoogleAccount = useCallback((acc: LinkedGoogleAccount) => {
    setLinkedGoogleAccounts((prev) => {
      const next = [acc, ...prev.filter((p) => p.email.toLowerCase() !== acc.email.toLowerCase())].slice(0, 6);
      try {
        localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota
      }
      return next;
    });
  }, []);

  const removeLinkedGoogleAccount = useCallback((id: string) => {
    setLinkedGoogleAccounts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      try {
        localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const refreshMovies = useCallback(async () => {
    const res = await fetch('/api/movies');
    if (res.ok) {
      const data = (await res.json()) as { movies: Movie[]; heroAutoFeature?: boolean };
      setMovies(data.movies);
      if (typeof data.heroAutoFeature === 'boolean') {
        setHeroAutoFeature(data.heroAutoFeature);
      }
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      void syncServerClock();
      const [cfgRes, meRes, movRes, planRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/auth/me'),
        fetch('/api/movies'),
        fetch('/api/plans'),
      ]);

      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as WebsiteConfig;
        setWebsiteConfig(cfg);
        setGoogleClientId(cfg.googleClientId || '');
        if (typeof cfg.heroAutoFeature === 'boolean') setHeroAutoFeature(cfg.heroAutoFeature);
      }

      if (movRes.ok) {
        const mData = (await movRes.json()) as { movies: Movie[]; heroAutoFeature?: boolean };
        setMovies(mData.movies);
        if (typeof mData.heroAutoFeature === 'boolean') setHeroAutoFeature(mData.heroAutoFeature);
      }

      if (planRes.ok) {
        const pData = (await planRes.json()) as { plans: SubscriptionPlan[] };
        setPlans(pData.plans);
      }

      if (meRes.ok) {
        const me = (await meRes.json()) as { user: UserProfile | null; settings: UserSettings | null };
        setUser(me.user);
        setSettings(me.settings);
        if (me.settings) {
          setLang(me.settings.language === 'en' ? 'en' : 'id');
          setUiSoundsEnabled(me.settings.ui_sounds !== 0);
        }
        if (me.user?.google_linked) {
          recordLinkedGoogleAccount({
            id: me.user.id,
            email: me.user.email,
            displayName: me.user.display_name,
            avatarUrl: me.user.avatar_url,
            username: me.user.username,
            lastUsedAt: new Date().toISOString(),
          });
        }
        if (me.user) {
          const [listRes, payRes, notifRes] = await Promise.all([
            fetch('/api/my/lists'),
            fetch('/api/my/payments'),
            fetch('/api/my/notifications'),
          ]);
          if (listRes.ok) {
            const l = (await listRes.json()) as { lists: CustomList[] };
            setCustomLists(l.lists);
          }
          if (payRes.ok) {
            const py = (await payRes.json()) as { payments: PaymentRecord[] };
            setPayments(py.payments);
          }
          if (notifRes.ok) {
            const nt = (await notifRes.json()) as { notifications: NotificationItem[] };
            setNotifications(nt.notifications);
          }
        } else {
          setCustomLists([]);
          setPayments([]);
          setNotifications([]);
        }
      }
    } catch {
      notify('Gagal memuat data dari server FLIXFIL.', true);
    }
  }, [notify, recordLinkedGoogleAccount]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const applyPendingScroll = useCallback(() => {
    if (pendingScrollTargetRef.current !== null) {
      const targetY = pendingScrollTargetRef.current;
      pendingScrollTargetRef.current = null;
      window.scrollTo({ top: targetY, behavior: 'auto' });
    }
  }, []);

  const navigate = (
    next: RouteView,
    extra?: { category?: string; adminTab?: AdminSubTab; restoreScroll?: boolean },
  ) => {
    if (next === view && !extra?.category && !extra?.adminTab) {
      window.scrollTo({ top: 0, behavior: settings?.transitions_enabled === 0 ? 'auto' : 'smooth' });
      return;
    }
    scrollPositionsRef.current[view] = window.scrollY;
    const prevIdx = NAV_ORDER[view];
    const nextIdx = NAV_ORDER[next];
    if (prevIdx !== undefined && nextIdx !== undefined && prevIdx !== nextIdx) {
      setNavDirection(nextIdx > prevIdx ? 1 : -1);
    } else {
      setNavDirection(0);
    }
    pendingScrollTargetRef.current = extra?.restoreScroll ? (scrollPositionsRef.current[next] ?? 0) : 0;

    setPreviousView(view);
    if (extra?.category) setExploreCategory(extra.category);
    if (extra?.adminTab) setAdminSubTab(extra.adminTab);
    setView(next);
  };

  const handleOpenDetail = (movie: Movie) => {
    setSelectedMovieId(movie.id);
    navigate('detail');
  };

  const handleWatchMovie = async (movie: Movie, episodeId?: string) => {
    playUiSound('player');
    const res = await fetch(`/api/movies/${encodeURIComponent(movie.id)}`);
    if (res.ok) {
      const data = (await res.json()) as {
        movie: Movie;
        episodes: Episode[];
        subtitles: SubtitleTrack[];
        related: Movie[];
      };
      scrollPositionsRef.current[view] = window.scrollY;
      pendingScrollTargetRef.current = 0;
      setNavDirection(0);
      setPlayerState({
        movie: data.movie,
        episodes: data.episodes,
        subtitles: data.subtitles,
        related: data.related,
        episodeId: episodeId || data.movie.userLibrary?.lastEpisodeId || undefined,
      });
      setPreviousView(view);
      setView('player');
    } else {
      notify('Gagal memuat stream video.', true);
    }
  };

  const handleRestartMovie = async (movie: Movie) => {
    if (user) {
      await fetch(`/api/my/library/${encodeURIComponent(movie.id)}/restart`, { method: 'POST' });
      await refreshMovies();
    }
    const resetMovie: Movie = {
      ...movie,
      userLibrary: movie.userLibrary
        ? { ...movie.userLibrary, progressSeconds: 0, watchStatus: 'watching' }
        : null,
    };
    await handleWatchMovie(resetMovie);
  };

  const handleRemoveContinueWatching = async (movie: Movie) => {
    if (!user) return;
    const res = await fetch(`/api/my/continue-watching/${encodeURIComponent(movie.id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      notify(`"${movie.title}" dihapus dari daftar Lanjutkan Menonton.`);
      await refreshMovies();
    }
  };

  const handleUpdateLibrary = async (movieId: string, payload: Record<string, unknown>) => {
    if (!user) {
      notify('Silakan masuk akun untuk menyimpan koleksi.', true);
      return;
    }
    const res = await fetch(`/api/my/library/${encodeURIComponent(movieId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await refreshMovies();
    }
  };

  const handleToggleWatchlist = (movie: Movie) => {
    if (!user) {
      notify('Masuk ke akun FLIXFIL untuk menyimpan daftar tontonan.', true);
      navigate('auth');
      return;
    }
    const next = !movie.userLibrary?.inWatchlist;
    void handleUpdateLibrary(movie.id, { inWatchlist: next }).then(() => {
      notify(next ? `"${movie.title}" ditambahkan ke Daftar Saya.` : `"${movie.title}" dihapus dari Daftar Saya.`);
    });
  };

  const handleSaveProgress = useCallback(
    (
      movieId: string,
      progressSeconds: number,
      durationSeconds: number,
      completed = false,
      episodeId?: string,
      keepalive = false,
    ) => {
      if (!user) return;
      if (settings?.hide_watch_history === 1 || settings?.sync_progress === 0) return;
      void fetch(`/api/my/library/${encodeURIComponent(movieId)}`, {
        method: 'POST',
        keepalive,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          progressSeconds,
          durationSeconds,
          episodeId: episodeId || '',
          clientUpdatedAt: new Date().toISOString(),
          watchStatus: completed ? 'completed' : progressSeconds > 0 ? 'watching' : 'unwatched',
          markWatched: true,
        }),
      }).then(() => {
        if (!keepalive) void refreshMovies();
      });
    },
    [user, settings?.hide_watch_history, settings?.sync_progress, refreshMovies],
  );

  const handleAddToCustomList = async (listId: string, movieId: string) => {
    const res = await fetch(`/api/my/lists/${encodeURIComponent(listId)}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movieId }),
    });
    if (res.ok) {
      notify('Film ditambahkan ke koleksi My Room Anda.');
      const lRes = await fetch('/api/my/lists');
      if (lRes.ok) {
        const lData = (await lRes.json()) as { lists: CustomList[] };
        setCustomLists(lData.lists);
      }
    }
  };

  const handleMarkNotificationsRead = () => {
    if (!user) return;
    void fetch('/api/my/notifications/read', { method: 'POST' }).then(() => {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    });
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setSettings(null);
    notify('Anda telah keluar dari akun FLIXFIL.');
    navigate('home');
    await refreshAll();
  };

  const isMaintenanceBlocked =
    Boolean(websiteConfig?.maintenanceMode) && user?.role !== 'admin' && view !== 'auth';

  const reduceMotionMode =
    settings?.animations_enabled === 0 || settings?.transitions_enabled === 0 ? 'always' : 'user';

  return (
    <MotionConfig reducedMotion={reduceMotionMode}>
      <div className="min-h-screen bg-[#080808] text-white flex flex-col">
        {!introDone && <LoadingScreen onComplete={() => setIntroDone(true)} />}

      {view !== 'player' && (
        <NavbarAndSidebar
          currentView={view}
          activeAdminTab={adminSubTab}
          lang={lang}
          user={user}
          movies={movies}
          payments={payments}
          notifications={notifications}
          onNavigate={navigate}
          onMarkNotificationsRead={handleMarkNotificationsRead}
        />
      )}

      {/* Maintenance Notice Banner for Admin when active */}
      {websiteConfig?.maintenanceMode && user?.role === 'admin' && view !== 'player' && (
        <div className="fixed bottom-5 left-5 z-[85] flex items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-950/90 px-4 py-2 text-xs text-amber-200 shadow-xl backdrop-blur-md">
          <Wrench className="h-3.5 w-3.5 text-amber-400" />
          <span>Mode Maintenance Aktif (Hanya Admin yang dapat mengakses penuh)</span>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-5 right-5 z-[90] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium shadow-2xl backdrop-blur-md ${
              t.isError
                ? 'border-[#FF163D]/60 bg-[#23060d]/95 text-white'
                : 'border-white/15 bg-[#171717]/95 text-white'
            }`}
          >
            {t.isError ? (
              <AlertCircle className="h-4 w-4 text-[#FF163D] shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      <main className="flex-1 overflow-x-clip">
        {isMaintenanceBlocked ? (
          <div className="min-h-[82vh] flex flex-col items-center justify-center px-6 pt-24 text-center">
            <FlixfilLogo size="lg" />
            <div className="mt-6 max-w-lg rounded-2xl border border-amber-500/40 bg-[#171717] p-8 space-y-4">
              <Wrench className="mx-auto h-10 w-10 text-[#FF163D]" />
              <h1 className="font-display text-2xl font-extrabold text-white">
                FLIXFIL Sedang Dalam Perawatan Sistem
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                Kami sedang melakukan peningkatan layanan streaming &amp; basis data. Layanan akan segera kembali normal.
              </p>
              <button
                type="button"
                onClick={() => navigate('auth')}
                className="rounded-xl border border-white/15 bg-black/50 px-5 py-2.5 text-xs font-semibold text-zinc-200 hover:border-[#FF163D]"
              >
                Masuk Administrator
              </button>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false} custom={navDirection} onExitComplete={applyPendingScroll}>
            <motion.div
              key={view}
              custom={navDirection}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onAnimationStart={(def) => {
                if (def === 'animate') applyPendingScroll();
              }}
              style={{ willChange: 'transform, opacity' }}
            >
              {view === 'home' && (
              <HomePage
                movies={movies}
                categories={websiteConfig?.categories}
                heroAutoFeature={heroAutoFeature}
                trendingEnabled={websiteConfig?.trendingEnabled ?? true}
                dashboardDensity={settings?.dashboard_density || 'comfortable'}
                user={user}
                lang={lang}
                onSelectMovie={handleOpenDetail}
                onWatchMovie={(m) => void handleWatchMovie(m)}
                onRestartMovie={(m) => void handleRestartMovie(m)}
                onRemoveContinueWatching={(m) => void handleRemoveContinueWatching(m)}
                onToggleWatchlist={handleToggleWatchlist}
                onNavigateExplore={(cat) => {
                  setExploreCategory(cat || 'all');
                  navigate('explore');
                }}
                onNavigateAuthOrRoom={() => navigate(user ? 'my-room' : 'auth')}
              />
            )}

            {(view === 'explore' || view === 'indonesia') && (
              <ExplorePage
                movies={movies}
                categories={websiteConfig?.categories}
                lang={lang}
                initialCategory={exploreCategory}
                indonesiaFocus={view === 'indonesia'}
                onSelectMovie={handleOpenDetail}
                onWatchMovie={(m) => void handleWatchMovie(m)}
              />
            )}

            {view === 'trending' && (
              <TrendingPage
                movies={movies}
                trendingEnabled={websiteConfig?.trendingEnabled ?? true}
                lang={lang}
                onSelectMovie={handleOpenDetail}
                onWatchMovie={(m) => void handleWatchMovie(m)}
              />
            )}

            {view === 'detail' && selectedMovieId && (
              <MovieDetailPage
                movieId={selectedMovieId}
                user={user}
                lang={lang}
                customLists={customLists}
                onBack={() =>
                  navigate(previousView === 'detail' ? 'home' : previousView, { restoreScroll: true })
                }
                onWatch={(m, epId) => void handleWatchMovie(m, epId)}
                onSelectMovie={handleOpenDetail}
                onUpdateLibrary={handleUpdateLibrary}
                onAddToCustomList={handleAddToCustomList}
                onNotify={notify}
              />
            )}

            {view === 'player' && playerState && (
              <VideoPlayerView
                movie={playerState.movie}
                episodes={playerState.episodes}
                subtitles={playerState.subtitles}
                relatedMovies={playerState.related}
                user={user}
                settings={settings}
                lang={lang}
                initialEpisodeId={playerState.episodeId}
                onBack={() => {
                  setSelectedMovieId(playerState.movie.id);
                  void refreshMovies();
                  navigate('detail', { restoreScroll: true });
                }}
                onJoinPremium={() => navigate('premium')}
                onSelectMovie={(m) => void handleWatchMovie(m)}
                onSaveProgress={handleSaveProgress}
                onNotify={notify}
              />
            )}

            {view === 'tambah' && (
              <TambahTontonanPage
                user={user}
                onRequireAuth={() => navigate('auth')}
                onNotify={notify}
              />
            )}

            {(view === 'my-room' || view === 'favorites' || view === 'history') && (
              <MyRoomPage
                user={user}
                movies={movies}
                customLists={customLists}
                payments={payments}
                lang={lang}
                initialTab={
                  view === 'favorites' ? 'favorites' : view === 'history' ? 'history' : 'collections'
                }
                onRequireAuth={() => navigate('auth')}
                onSelectMovie={handleOpenDetail}
                onWatchMovie={(m) => void handleWatchMovie(m)}
                onRefreshLists={async () => {
                  const res = await fetch('/api/my/lists');
                  if (res.ok) {
                    const d = (await res.json()) as { lists: CustomList[] };
                    setCustomLists(d.lists);
                  }
                }}
                onRefreshUser={refreshAll}
                onNavigatePremium={() => navigate('premium')}
                onNotify={notify}
              />
            )}

            {view === 'premium' && (
              <PremiumPage
                user={user}
                plans={plans}
                payments={payments}
                danaQrConfigured={Boolean(websiteConfig?.danaQrConfigured)}
                onRequireAuth={() => navigate('auth')}
                onRefreshAll={refreshAll}
                onNotify={notify}
              />
            )}

            {view === 'settings' && (
              <SettingsPage
                user={user}
                settings={settings}
                lang={lang}
                websiteConfig={websiteConfig}
                linkedGoogleAccounts={linkedGoogleAccounts}
                onChangeLang={(next) => {
                  setLang(next);
                  if (user) {
                    void fetch('/api/my/settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ language: next }),
                    });
                  }
                }}
                onRefreshAll={refreshAll}
                onLogout={handleLogout}
                onRequireAuth={() => navigate('auth')}
                onGoogleAccountAdded={recordLinkedGoogleAccount}
                onRemoveLinkedGoogleAccount={removeLinkedGoogleAccount}
                onNavigateAdmin={(tab) => navigate('admin', { adminTab: tab })}
                onNavigateFavorites={() => navigate('favorites')}
                onNotify={notify}
              />
            )}

            {view === 'auth' && (
              <AuthPages
                googleClientId={googleClientId}
                onSuccess={async () => {
                  await refreshAll();
                  navigate('home');
                }}
                onGoogleAccountLinked={recordLinkedGoogleAccount}
                onCancel={() => navigate('home')}
                onNotify={notify}
              />
            )}

            {view === 'admin' && (
              <AdminDashboardPage
                user={user}
                movies={movies}
                plans={plans}
                payments={payments}
                websiteConfig={websiteConfig}
                heroAutoFeature={heroAutoFeature}
                initialTab={adminSubTab}
                onTabChange={setAdminSubTab}
                onRefreshAll={refreshAll}
                onRequireAuth={() => navigate('auth')}
                onLogout={handleLogout}
                onNotify={notify}
              />
            )}

            {view === 'not-found' && (
              <div className="min-h-[70vh] flex flex-col items-center justify-center pt-24 px-6 text-center">
                <FlixfilLogo size="lg" />
                <h1 className="mt-6 font-display text-3xl font-extrabold">Halaman Tidak Ditemukan</h1>
                <p className="mt-2 text-sm text-zinc-400">Tautan atau film yang Anda cari tidak tersedia.</p>
                <button
                  type="button"
                  onClick={() => navigate('home')}
                  className="mt-6 rounded-xl bg-[#FF163D] px-6 py-3 text-sm font-semibold text-white"
                >
                  Kembali ke Beranda
                </button>
              </div>
            )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {view !== 'player' && (
        <footer className="border-t border-white/10 bg-[#080808] px-4 py-10 sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-[1440px] flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <FlixfilLogo size="sm" />
              <p className="mt-2 text-xs text-zinc-500">
                {websiteConfig?.tagline || 'Your Story. Your Screen.'} Platform streaming film Indonesia &amp; internasional bebas iklan.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-400">
              <button type="button" onClick={() => navigate('explore')} className="hover:text-white">
                Jelajahi
              </button>
              <button type="button" onClick={() => navigate('indonesia')} className="hover:text-white">
                Film Indonesia
              </button>
              <button type="button" onClick={() => navigate('tambah')} className="hover:text-white">
                Tambah Tontonan
              </button>
              <button type="button" onClick={() => navigate('premium')} className="hover:text-white">
                Premium (Maks. Rp20.000)
              </button>
              <button type="button" onClick={() => navigate('settings')} className="hover:text-white">
                Pengaturan
              </button>
            </div>
          </div>
        </footer>
      )}
      </div>
    </MotionConfig>
  );
}
