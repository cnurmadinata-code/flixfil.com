import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  Bell,
  BookmarkCheck,
  Captions,
  Compass,
  Crown,
  Film,
  Flame,
  FolderKanban,
  Heart,
  Home,
  Image as ImageIcon,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Search,
  Settings,
  Sliders,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminSubTab,
  LanguageCode,
  Movie,
  NotificationItem,
  PaymentRecord,
  RouteView,
  UserProfile,
} from '../types';
import { playUiSound } from '../utils/audioUi';
import { COPY } from '../utils/i18n';
import { FlixfilLogo } from './FlixfilLogo';

interface NavbarAndSidebarProps {
  currentView: RouteView;
  activeAdminTab?: AdminSubTab;
  lang: LanguageCode;
  user: UserProfile | null;
  movies?: Movie[];
  payments?: PaymentRecord[];
  notifications: NotificationItem[];
  onNavigate: (view: RouteView, extra?: { category?: string; adminTab?: AdminSubTab }) => void;
  onMarkNotificationsRead: () => void;
}

export function NavbarAndSidebar({
  currentView,
  activeAdminTab = 'overview',
  lang,
  user,
  notifications,
  onNavigate,
  onMarkNotificationsRead,
}: NavbarAndSidebarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const t = COPY[lang];

  const navRef = useRef<HTMLElement | null>(null);
  const navItemRefs = useRef<Partial<Record<RouteView, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number; visible: boolean; animate: boolean }>({
    left: 0,
    width: 0,
    visible: false,
    animate: false,
  });
  const hasMountedNavRef = useRef(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  const go = (view: RouteView, extra?: { category?: string; adminTab?: AdminSubTab }) => {
    playUiSound('nav');
    setSidebarOpen(false);
    setNotifOpen(false);
    onNavigate(view, extra);
  };

  const navLinks: Array<{ view: RouteView; label: string }> = [
    { view: 'home', label: t.navHome },
    { view: 'explore', label: t.navExplore },
    { view: 'indonesia', label: t.navIndonesia },
    { view: 'trending', label: t.navTrending },
    { view: 'my-room', label: t.navMyRoom },
  ];

  const measureIndicator = useCallback(() => {
    const activeBtn = navItemRefs.current[currentView];
    if (!activeBtn) {
      setIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const left = activeBtn.offsetLeft;
    const width = activeBtn.offsetWidth;
    const animate = hasMountedNavRef.current;
    hasMountedNavRef.current = true;
    setIndicator({ left, width, visible: width > 0, animate });
  }, [currentView]);

  useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator, lang]);

  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measureIndicator()) : null;
    ro?.observe(navEl);
    window.addEventListener('resize', measureIndicator, { passive: true });
    void document.fonts?.ready?.then(() => measureIndicator());
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measureIndicator);
    };
  }, [measureIndicator]);

  const mainMenuItems: Array<{ view: RouteView; label: string; icon: typeof Home; isPremium?: boolean }> = [
    { view: 'home', label: lang === 'id' ? 'Beranda' : 'Home', icon: Home },
    { view: 'explore', label: lang === 'id' ? 'Jelajahi Film' : 'Explore Films', icon: Compass },
    { view: 'indonesia', label: 'Indonesia', icon: Film },
    { view: 'trending', label: 'Trending', icon: Flame },
    { view: 'my-room', label: 'My Room', icon: BookmarkCheck },
    { view: 'favorites', label: lang === 'id' ? 'Favorit' : 'Favorites', icon: Heart },
    { view: 'premium', label: 'Premium', icon: Crown, isPremium: true },
    { view: 'tambah', label: lang === 'id' ? 'Tambah Tontonan' : 'Add Watchlist', icon: PlusCircle },
    { view: 'settings', label: lang === 'id' ? 'Pengaturan' : 'Settings', icon: Settings },
  ];

  const adminMenuItems: Array<{ tab: AdminSubTab; label: string; icon: typeof LayoutDashboard }> = [
    { tab: 'overview', label: 'Dashboard Admin', icon: LayoutDashboard },
    { tab: 'add', label: 'Tambahkan Film', icon: PlusCircle },
    { tab: 'upload', label: 'Upload Video', icon: Upload },
    { tab: 'manage', label: 'Kelola Film', icon: Film },
    { tab: 'posters', label: 'Kelola Poster', icon: ImageIcon },
    { tab: 'subtitles', label: 'Kelola Subtitle', icon: Captions },
    { tab: 'categories', label: 'Kelola Kategori', icon: FolderKanban },
    { tab: 'users', label: 'Kelola Pengguna', icon: Users },
    { tab: 'security', label: 'Statistik & Keamanan', icon: BarChart3 },
    { tab: 'settings', label: 'Pengaturan Website', icon: Sliders },
  ];

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-colors duration-200 ${
          scrolled || currentView !== 'home'
            ? 'bg-[#080808]/92 backdrop-blur-md border-b border-white/10'
            : 'bg-gradient-to-b from-black/85 via-black/45 to-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-8">
          {/* Zone 1: Menu toggle + Single Brand Mark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                playUiSound('click');
                setSidebarOpen(true);
              }}
              aria-label="Buka menu navigasi"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-[#FF163D]/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF163D]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go('home')}
              className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF163D] rounded"
            >
              <FlixfilLogo size="sm" />
            </button>
          </div>

          {/* Zone 2: 5 clean single-line text links with sliding neon indicator */}
          <nav ref={navRef} className="hidden lg:flex relative items-center gap-7 text-sm font-medium">
            {navLinks.map((item) => {
              const active = currentView === item.view;
              return (
                <button
                  key={item.view}
                  ref={(el) => {
                    navItemRefs.current[item.view] = el;
                  }}
                  type="button"
                  onClick={() => go(item.view)}
                  className={`relative py-1 whitespace-nowrap shrink-0 transition-colors duration-200 ${
                    active ? 'text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute -bottom-0.5 left-0 h-[2px] bg-[#FF163D] ${
                indicator.animate ? 'flixfil-nav-indicator' : ''
              }`}
              style={{
                width: `${indicator.width}px`,
                transform: `translate3d(${indicator.left}px, 0, 0)`,
                opacity: indicator.visible ? 1 : 0,
                boxShadow: '0 0 8px rgba(255, 22, 61, calc(0.95 * var(--accent-intensity, 1)))',
              }}
            />
          </nav>

          {/* Zone 3: Search, Notifications, Primary CTA / Profile */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => go('explore')}
              aria-label="Pencarian cepat"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              <Search className="h-4 w-4" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  playUiSound('click');
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next && unreadCount > 0) onMarkNotificationsRead();
                }}
                aria-label="Notifikasi"
                className="relative flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF163D] px-1 text-[10px] font-bold text-white shadow-[0_0_8px_#FF163D]">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute right-0 mt-2 w-80 rounded-xl border border-white/10 bg-[#171717] p-4 shadow-2xl"
                  >
                    <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="text-sm font-semibold text-white">Notifikasi</span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-zinc-400 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="py-4 text-center text-xs text-zinc-400">
                        Belum ada notifikasi baru.
                      </p>
                    ) : (
                      <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                        {notifications.map((n) => (
                          <div key={n.id} className="rounded-lg bg-black/40 p-2.5 text-xs">
                            <p className="font-semibold text-white">{n.title}</p>
                            <p className="mt-1 text-zinc-400 leading-relaxed">{n.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {user?.subscription_tier !== 'premium' && (
              <button
                type="button"
                onClick={() => go('premium')}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[#FF163D] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition hover:bg-[#e01034] neon-red-glow"
              >
                <Crown className="h-3.5 w-3.5" />
                {t.joinPremium}
              </button>
            )}

            <button
              type="button"
              onClick={() => go(user ? 'my-room' : 'auth')}
              className="flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-[#171717] px-3 text-xs font-medium text-white whitespace-nowrap shrink-0 transition hover:border-[#FF163D]/60"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.display_name}
                  referrerPolicy="no-referrer"
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <User className="h-4 w-4 text-[#FF163D]" />
              )}
              <span className="max-w-[96px] truncate">
                {user ? user.display_name : t.login}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Dynamic Responsive Collapsible Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%', opacity: 0.92 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0.92 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className={`relative z-10 flex h-full flex-col border-r border-white/10 bg-[#080808]/98 backdrop-blur-xl transition-[width,padding] duration-200 ${
                sidebarCompact ? 'w-20 p-3' : 'w-72 max-w-[85vw] p-5'
              }`}
            >
            <div className="mb-5 flex items-center justify-between gap-2">
              {!sidebarCompact && <FlixfilLogo size="sm" />}
              <div className="flex items-center gap-1 ml-auto">
                <button
                  type="button"
                  onClick={() => setSidebarCompact((c) => !c)}
                  aria-label={sidebarCompact ? 'Perluas sidebar' : 'Perkecil sidebar'}
                  title={sidebarCompact ? 'Perluas Sidebar' : 'Mode Ringkas'}
                  className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  {sidebarCompact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Tutup menu"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <nav className="flex-1 space-y-5 overflow-y-auto no-scrollbar pr-0.5">
              {/* MENU UTAMA */}
              <div>
                {!sidebarCompact && (
                  <p className="px-3 mb-2 text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">
                    MENU UTAMA
                  </p>
                )}
                <div className="space-y-1">
                  {mainMenuItems.map((item) => {
                    const Icon = item.icon;
                    const active = currentView === item.view;
                    return (
                      <button
                        key={item.view}
                        type="button"
                        title={item.label}
                        onClick={() => go(item.view)}
                        className={`group relative flex w-full items-center ${
                          sidebarCompact ? 'justify-center px-2 py-3' : 'gap-3 px-3.5 py-2.5'
                        } rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                          active
                            ? 'bg-[#FF163D]/18 text-white border border-[#FF163D]/45 shadow-[0_0_16px_-4px_rgba(255,22,61,0.45)]'
                            : item.isPremium
                              ? 'border border-transparent text-zinc-300 hover:border-[#FF163D]/40 hover:bg-gradient-to-r hover:from-[#FF163D]/20 hover:to-amber-500/10 hover:text-white hover:translate-x-0.5'
                              : 'border border-transparent text-zinc-400 hover:border-white/10 hover:bg-gradient-to-r hover:from-[#FF163D]/12 hover:to-transparent hover:text-white hover:translate-x-0.5'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                            active
                              ? 'text-[#FF163D]'
                              : item.isPremium
                                ? 'text-amber-400 group-hover:text-[#FF163D]'
                                : 'text-zinc-400 group-hover:text-[#FF163D]'
                          }`}
                        />
                        {!sidebarCompact && <span className="truncate">{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* MENU ADMINISTRATOR (STRICTLY ADMIN-ONLY) */}
              {user?.role === 'admin' && (
                <div className="border-t border-white/10 pt-4">
                  {!sidebarCompact && (
                    <p className="px-3 mb-2 text-[10px] font-bold tracking-[0.2em] text-[#FF163D] uppercase">
                      MENU ADMINISTRATOR
                    </p>
                  )}
                  <div className="space-y-1">
                    {adminMenuItems.map((item) => {
                      const Icon = item.icon;
                      const active = currentView === 'admin' && activeAdminTab === item.tab;
                      return (
                        <button
                          key={item.tab}
                          type="button"
                          title={item.label}
                          onClick={() => go('admin', { adminTab: item.tab })}
                          className={`group flex w-full items-center ${
                            sidebarCompact ? 'justify-center px-2 py-2.5' : 'gap-3 px-3.5 py-2'
                          } rounded-xl text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                            active
                              ? 'bg-[#FF163D] text-white shadow-[0_0_14px_-3px_rgba(255,22,61,0.65)]'
                              : 'border border-transparent text-zinc-300 hover:border-[#FF163D]/35 hover:bg-[#FF163D]/12 hover:text-white hover:translate-x-0.5'
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                              active ? 'text-white' : 'text-[#FF163D]'
                            }`}
                          />
                          {!sidebarCompact && <span className="truncate">{item.label}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </nav>

            <div className="mt-4 border-t border-white/10 pt-4">
              {user ? (
                <div className={`flex items-center ${sidebarCompact ? 'justify-center' : 'justify-between gap-2'} text-xs`}>
                  {!sidebarCompact && (
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{user.display_name}</p>
                      <p className="text-zinc-400">
                        {user.role === 'admin'
                          ? 'Administrator FLIXFIL'
                          : user.subscription_tier === 'premium'
                            ? 'Anggota Premium'
                            : 'Akun Gratis'}
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => go('settings')}
                    aria-label="Pengaturan"
                    title="Pengaturan"
                    className="rounded-lg border border-white/10 px-2.5 py-1.5 text-zinc-300 transition hover:border-[#FF163D]/60 hover:text-white"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => go('auth')}
                  className="w-full rounded-xl bg-[#FF163D] py-2.5 text-xs font-semibold text-white hover:bg-[#e01034]"
                >
                  {sidebarCompact ? <User className="h-4 w-4 mx-auto" /> : `${t.login} / ${t.register}`}
                </button>
              )}
            </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
