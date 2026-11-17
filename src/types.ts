export type LanguageCode = 'id' | 'en';

export type RouteView =
  | 'home'
  | 'explore'
  | 'indonesia'
  | 'trending'
  | 'detail'
  | 'player'
  | 'tambah'
  | 'my-room'
  | 'favorites'
  | 'history'
  | 'premium'
  | 'settings'
  | 'auth'
  | 'admin'
  | 'not-found';

export type AdminSubTab =
  | 'overview'
  | 'add'
  | 'upload'
  | 'manage'
  | 'posters'
  | 'subtitles'
  | 'categories'
  | 'users'
  | 'security'
  | 'settings';

export type PublishStatus = 'pending_check' | 'processing' | 'ready' | 'failed' | 'unavailable';

export interface UserLibraryEntry {
  watchStatus: 'unwatched' | 'watching' | 'completed';
  isFavorite: boolean;
  inWatchlist: boolean;
  personalNote: string;
  customCategory: string;
  progressSeconds: number;
  durationSeconds: number;
  lastEpisodeId?: string;
  lastWatchedAt: string | null;
}

export interface AudioTrack {
  id: string;
  label: string;
  language: string;
  channels: string;
}

export interface Movie {
  id: string;
  title: string;
  altTitles: string;
  slug: string;
  type: 'film' | 'series' | 'anime' | 'drama' | 'documentary' | 'youtube' | 'concert' | 'short';
  category: string;
  genres: string[];
  country: string;
  releaseYear: number;
  originalReleaseDate?: string;
  durationSeconds: number;
  ageRating: string;
  synopsis: string;
  director: string;
  cast: string[];
  posterUrl: string;
  backdropUrl: string;
  sourceType: 'hls' | 'mp4' | 'youtube' | 'vimeo' | 'dailymotion' | 'bilibili' | 'archive' | 'external_only' | 'uploaded';
  sourceUrl: string;
  embedUrl: string;
  premiumStreamUrl?: string;
  playbackSupported: boolean;
  availableQualities: string[];
  audioTracks: AudioTrack[];
  introEndSeconds: number;
  accessTier: 'free' | 'premium';
  freeMaxQuality: '480p' | '720p' | '1080p';
  publishStatus?: PublishStatus;
  lastCheckedAt?: string;
  isFeatured: boolean;
  isPinnedHero?: boolean;
  isAdminPick: boolean;
  viewCount: number;
  favoriteCount: number;
  views24h?: number;
  views7d?: number;
  completionsCount?: number;
  growthRate?: number;
  trendingScore?: number;
  ratingAvg: number;
  ratingCount: number;
  publishedAt?: string;
  createdAt: string;
  userLibrary?: UserLibraryEntry | null;
}

export interface Episode {
  id: string;
  movieId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  synopsis: string;
  durationSeconds: number;
  sourceUrl: string;
  embedUrl: string;
  availableQualities: string[];
  introEndSeconds: number;
}

export interface SubtitleTrack {
  id: string;
  movie_id: string;
  episode_id: string | null;
  language_code: string;
  language_label: string;
  format: 'vtt' | 'srt';
  is_default: number;
}

export interface ReviewItem {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  role: 'user' | 'admin';
  email_verified: number;
  totp_enabled: number;
  is_profile_public: number;
  subscription_tier: 'free' | 'premium';
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  is_admin_elevated: boolean;
  google_linked?: boolean;
}

export interface UserSettings {
  user_id: string;
  language: LanguageCode;
  ui_sounds: number;
  default_volume: number;
  default_subtitle_lang: string;
  subtitle_font_size: number;
  subtitle_color: string;
  subtitle_position: 'bottom' | 'top';
  default_quality: string;
  notify_new_films: number;
  notify_subscription: number;
  notify_security: number;
  theme_mode?: 'dark' | 'light';
  accent_intensity?: number;
  text_scale?: 'small' | 'normal' | 'large';
  animations_enabled?: number;
  transitions_enabled?: number;
  dashboard_density?: 'comfortable' | 'compact';
  auto_quality?: number;
  auto_subtitle?: number;
  default_speed?: number;
  auto_play?: number;
  auto_resume?: number;
  sync_progress?: number;
  notify_trending?: number;
  notify_episodes?: number;
  notify_account?: number;
  notify_email?: number;
  hide_watch_history?: number;
}

export interface SessionInfo {
  id: string;
  ip: string;
  user_agent: string;
  created_at: string;
  expires_at: string;
  isCurrent: boolean;
}

export interface LinkedGoogleAccount {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  username: string;
  lastUsedAt: string;
}

export interface WebsiteConfig {
  brand: string;
  tagline: string;
  googleClientId: string;
  tmdbEnabled: boolean;
  heroAutoFeature: boolean;
  maintenanceMode: boolean;
  trendingEnabled: boolean;
  uploadMaxHours: number;
  timezone: string;
  allowedStreamDomains: string;
  categories: string[];
  danaQrConfigured: boolean;
  allFilmsFree: boolean;
  maxSubscriptionPriceIdr: number;
}

export interface PersonalVaultItem {
  id: string;
  title: string;
  type: string;
  category: string;
  genres: string[];
  release_year: number;
  synopsis: string;
  poster_url: string;
  platform_name: string;
  source_url: string;
  embed_url: string;
  playbackSupported: boolean;
  watch_status: 'unwatched' | 'watching' | 'completed';
  isFavorite: boolean;
  personal_note: string;
  custom_category: string;
  progress_seconds: number;
  created_at: string;
}

export interface CustomList {
  id: string;
  name: string;
  description: string;
  coverPosterUrl: string;
  isPublic: boolean;
  createdAt: string;
  items: Array<{
    id: string;
    title: string;
    poster_url: string;
    release_year: number;
    category: string;
  }>;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  duration_days: number;
  price_idr: number;
  description: string;
  features: string[];
}

export interface PaymentRecord {
  id: string;
  plan_id: string;
  plan_name: string;
  duration_days: number;
  amount_idr: number;
  provider: string;
  payment_method?: string;
  verified_by_admin?: string;
  username?: string;
  display_name?: string;
  email?: string;
  external_ref: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}
