import type { LanguageCode } from '../types';

export const COPY: Record<LanguageCode, Record<string, string>> = {
  id: {
    tagline: 'Your Story. Your Screen.',
    navHome: 'Beranda',
    navExplore: 'Jelajahi',
    navIndonesia: 'Indonesia',
    navTrending: 'Trending',
    navMyRoom: 'My Room',
    navAdd: 'Tambah Tontonan',
    navFavorites: 'Favorit',
    navHistory: 'Riwayat',
    navCategories: 'Kategori',
    navPremium: 'Premium',
    navSettings: 'Pengaturan',
    navAdmin: 'Panel Admin',
    heroKicker: 'Discover Your Next Movie.',
    watchNow: 'WATCH NOW',
    exploreFilms: 'EXPLORE FILMS',
    myCollection: 'MY COLLECTION',
    continueWatching: 'CONTINUE WATCHING',
    joinPremium: 'JOIN PREMIUM',
    rowTrending: 'Sedang Trending — Everyone\'s Watching.',
    rowIndonesia: 'Film Indonesia Terpopuler — Local Stories. Big Screens.',
    rowContinue: 'Lanjutkan Menonton — Pick Up Where You Left Off.',
    rowLatest: 'Baru Ditambahkan',
    rowHorrorId: 'Horor Indonesia',
    rowAction: 'Aksi & Petualangan',
    rowInternational: 'Koleksi Internasional',
    rowAdminPicks: 'Film Pilihan Kurator',
    rowPremium: 'Koleksi Premium',
    rowFree: 'Film Gratis',
    premiumHeadline: 'Upgrade Your Experience.',
    favoritesHeadline: 'Your Favorite Stories.',
    searchPlaceholder: 'Cari judul, genre, sutradara, atau deskripsi cerita...',
    login: 'Masuk',
    register: 'Daftar',
    logout: 'Keluar',
    freeBadge: 'GRATIS',
    premiumBadge: 'PREMIUM',
  },
  en: {
    tagline: 'Your Story. Your Screen.',
    navHome: 'Home',
    navExplore: 'Explore',
    navIndonesia: 'Indonesia',
    navTrending: 'Trending',
    navMyRoom: 'My Room',
    navAdd: 'Add Watchlist',
    navFavorites: 'Favorites',
    navHistory: 'History',
    navCategories: 'Categories',
    navPremium: 'Premium',
    navSettings: 'Settings',
    navAdmin: 'Admin Console',
    heroKicker: 'Discover Your Next Movie.',
    watchNow: 'WATCH NOW',
    exploreFilms: 'EXPLORE FILMS',
    myCollection: 'MY COLLECTION',
    continueWatching: 'CONTINUE WATCHING',
    joinPremium: 'JOIN PREMIUM',
    rowTrending: 'Trending Now — Everyone\'s Watching.',
    rowIndonesia: 'Indonesian Spotlight — Local Stories. Big Screens.',
    rowContinue: 'Continue Watching — Pick Up Where You Left Off.',
    rowLatest: 'Recently Added',
    rowHorrorId: 'Indonesian Horror',
    rowAction: 'Action & Adventure',
    rowInternational: 'International Cinema',
    rowAdminPicks: 'Curator Selections',
    rowPremium: 'Premium Collection',
    rowFree: 'Watch Free',
    premiumHeadline: 'Upgrade Your Experience.',
    favoritesHeadline: 'Your Favorite Stories.',
    searchPlaceholder: 'Search titles, genres, directors, or story plots...',
    login: 'Sign In',
    register: 'Register',
    logout: 'Sign Out',
    freeBadge: 'FREE',
    premiumBadge: 'PREMIUM',
  },
};

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatRupiah(amount: number): string {
  return `Rp${amount.toLocaleString('id-ID')}`;
}
