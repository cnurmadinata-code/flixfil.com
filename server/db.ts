import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const STREAM_DIR = path.join(DATA_DIR, 'streams');

for (const dir of [DATA_DIR, BACKUP_DIR, UPLOAD_DIR, STREAM_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const DB_PATH = path.join(DATA_DIR, 'flixfil.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    email_verified INTEGER NOT NULL DEFAULT 0,
    totp_secret TEXT NOT NULL DEFAULT '',
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    is_profile_public INTEGER NOT NULL DEFAULT 0,
    subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK(subscription_tier IN ('free', 'premium')),
    subscription_started_at TEXT,
    subscription_expires_at TEXT,
    google_sub TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_admin_elevated INTEGER NOT NULL DEFAULT 0,
    admin_elevated_until TEXT,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS movies (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    alt_titles TEXT NOT NULL DEFAULT '',
    slug TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'film' CHECK(type IN ('film','series','anime','drama','documentary','youtube','concert','short')),
    category TEXT NOT NULL DEFAULT 'Film Indonesia',
    genres TEXT NOT NULL DEFAULT '[]',
    country TEXT NOT NULL DEFAULT 'Indonesia',
    release_year INTEGER NOT NULL DEFAULT 2024,
    original_release_date TEXT NOT NULL DEFAULT '',
    duration_seconds INTEGER NOT NULL DEFAULT 5400 CHECK(duration_seconds >= 0 AND duration_seconds <= 36000),
    age_rating TEXT NOT NULL DEFAULT '13+',
    synopsis TEXT NOT NULL DEFAULT '',
    director TEXT NOT NULL DEFAULT '',
    cast_members TEXT NOT NULL DEFAULT '[]',
    poster_url TEXT NOT NULL DEFAULT '',
    backdrop_url TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'hls',
    source_url TEXT NOT NULL DEFAULT '',
    embed_url TEXT NOT NULL DEFAULT '',
    playback_supported INTEGER NOT NULL DEFAULT 1,
    available_qualities TEXT NOT NULL DEFAULT '[]',
    audio_tracks TEXT NOT NULL DEFAULT '[{"id":"orig","label":"Original Stereo","language":"id","channels":"Stereo 2.0"}]',
    intro_end_seconds INTEGER NOT NULL DEFAULT 0,
    access_tier TEXT NOT NULL DEFAULT 'free' CHECK(access_tier IN ('free', 'premium')),
    free_max_quality TEXT NOT NULL DEFAULT '720p',
    is_featured INTEGER NOT NULL DEFAULT 0,
    is_pinned_hero INTEGER NOT NULL DEFAULT 0,
    is_admin_pick INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    view_count INTEGER NOT NULL DEFAULT 0,
    favorite_count INTEGER NOT NULL DEFAULT 0,
    rating_avg REAL NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    published_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS view_events (
    id TEXT PRIMARY KEY,
    movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    user_id TEXT,
    ip_hash TEXT NOT NULL,
    session_key TEXT NOT NULL,
    watched_seconds INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_view_events_movie_created ON view_events(movie_id, created_at);

  CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    season_number INTEGER NOT NULL DEFAULT 1,
    episode_number INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    synopsis TEXT NOT NULL DEFAULT '',
    duration_seconds INTEGER NOT NULL DEFAULT 2700 CHECK(duration_seconds >= 0 AND duration_seconds <= 36000),
    source_url TEXT NOT NULL DEFAULT '',
    embed_url TEXT NOT NULL DEFAULT '',
    available_qualities TEXT NOT NULL DEFAULT '[]',
    intro_end_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS episode_progress (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    progress_seconds INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(user_id, movie_id, episode_id)
  );

  CREATE TABLE IF NOT EXISTS subtitles (
    id TEXT PRIMARY KEY,
    movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    episode_id TEXT,
    language_code TEXT NOT NULL DEFAULT 'id',
    language_label TEXT NOT NULL DEFAULT 'Bahasa Indonesia',
    format TEXT NOT NULL DEFAULT 'vtt' CHECK(format IN ('vtt', 'srt')),
    content TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_library (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    watch_status TEXT NOT NULL DEFAULT 'unwatched' CHECK(watch_status IN ('unwatched', 'watching', 'completed')),
    is_favorite INTEGER NOT NULL DEFAULT 0,
    in_watchlist INTEGER NOT NULL DEFAULT 0,
    personal_note TEXT NOT NULL DEFAULT '',
    custom_category TEXT NOT NULL DEFAULT '',
    progress_seconds INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    last_episode_id TEXT NOT NULL DEFAULT '',
    last_watched_at TEXT,
    client_updated_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, movie_id)
  );

  CREATE TABLE IF NOT EXISTS personal_vault_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'film',
    category TEXT NOT NULL DEFAULT 'Film',
    genres TEXT NOT NULL DEFAULT '[]',
    release_year INTEGER NOT NULL DEFAULT 2024,
    synopsis TEXT NOT NULL DEFAULT '',
    poster_url TEXT NOT NULL DEFAULT '',
    platform_name TEXT NOT NULL DEFAULT 'Manual',
    source_url TEXT NOT NULL DEFAULT '',
    embed_url TEXT NOT NULL DEFAULT '',
    playback_supported INTEGER NOT NULL DEFAULT 0,
    watch_status TEXT NOT NULL DEFAULT 'unwatched' CHECK(watch_status IN ('unwatched', 'watching', 'completed')),
    is_favorite INTEGER NOT NULL DEFAULT 0,
    personal_note TEXT NOT NULL DEFAULT '',
    custom_category TEXT NOT NULL DEFAULT '',
    progress_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_lists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover_poster_url TEXT NOT NULL DEFAULT '',
    is_public INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_list_items (
    list_id TEXT NOT NULL REFERENCES custom_lists(id) ON DELETE CASCADE,
    movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(list_id, movie_id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(movie_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL DEFAULT 'id' CHECK(language IN ('id', 'en')),
    ui_sounds INTEGER NOT NULL DEFAULT 1,
    default_volume REAL NOT NULL DEFAULT 0.85,
    default_subtitle_lang TEXT NOT NULL DEFAULT 'id',
    subtitle_font_size INTEGER NOT NULL DEFAULT 18,
    subtitle_color TEXT NOT NULL DEFAULT '#FFFFFF',
    subtitle_position TEXT NOT NULL DEFAULT 'bottom',
    default_quality TEXT NOT NULL DEFAULT 'auto',
    notify_new_films INTEGER NOT NULL DEFAULT 1,
    notify_subscription INTEGER NOT NULL DEFAULT 1,
    notify_security INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    duration_days INTEGER NOT NULL CHECK(duration_days >= 1),
    price_idr INTEGER NOT NULL CHECK(price_idr >= 1000 AND price_idr <= 20000),
    description TEXT NOT NULL DEFAULT '',
    features TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
    amount_idr INTEGER NOT NULL CHECK(amount_idr <= 20000),
    provider TEXT NOT NULL DEFAULT 'midtrans',
    external_ref TEXT UNIQUE NOT NULL,
    gateway_signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed', 'expired')),
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS server_error_logs (
    id TEXT PRIMARY KEY,
    route TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS upload_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    total_size INTEGER NOT NULL,
    uploaded_bytes INTEGER NOT NULL DEFAULT 0,
    total_chunks INTEGER NOT NULL,
    received_chunks TEXT NOT NULL DEFAULT '[]',
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds <= 36000),
    status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','scanning','transcoding','ready','failed')),
    transcode_progress INTEGER NOT NULL DEFAULT 0,
    output_hls_url TEXT NOT NULL DEFAULT '',
    output_poster_url TEXT NOT NULL DEFAULT '',
    available_qualities TEXT NOT NULL DEFAULT '[]',
    error_message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Safe incremental schema migrations for pre-existing DBs
function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('movies', 'original_release_date', "TEXT NOT NULL DEFAULT ''");
ensureColumn('movies', 'is_pinned_hero', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('movies', 'is_published', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('movies', 'published_at', "TEXT NOT NULL DEFAULT ''");
ensureColumn('movies', 'publish_status', "TEXT NOT NULL DEFAULT 'ready'");
ensureColumn('movies', 'last_checked_at', "TEXT NOT NULL DEFAULT ''");
ensureColumn('movies', 'premium_stream_url', "TEXT NOT NULL DEFAULT ''");

ensureColumn('user_library', 'last_episode_id', "TEXT NOT NULL DEFAULT ''");
ensureColumn('user_library', 'client_updated_at', 'TEXT');

ensureColumn('user_settings', 'theme_mode', "TEXT NOT NULL DEFAULT 'dark'");
ensureColumn('user_settings', 'accent_intensity', 'INTEGER NOT NULL DEFAULT 100');
ensureColumn('user_settings', 'text_scale', "TEXT NOT NULL DEFAULT 'normal'");
ensureColumn('user_settings', 'animations_enabled', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'transitions_enabled', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'dashboard_density', "TEXT NOT NULL DEFAULT 'comfortable'");
ensureColumn('user_settings', 'auto_quality', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'auto_subtitle', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'default_speed', 'REAL NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'auto_play', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'auto_resume', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'sync_progress', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'notify_trending', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'notify_episodes', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'notify_account', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('user_settings', 'notify_email', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('user_settings', 'hide_watch_history', 'INTEGER NOT NULL DEFAULT 0');

ensureColumn('payments', 'payment_method', "TEXT NOT NULL DEFAULT 'qris'");
ensureColumn('payments', 'verified_by_admin', "TEXT NOT NULL DEFAULT ''");

export function writeAuditLog(
  actorUserId: string | null,
  action: string,
  targetType = '',
  targetId = '',
  details = '',
  ip = '',
): void {
  try {
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, details, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, actorUserId, action, targetType, targetId, details, ip, new Date().toISOString());
  } catch {
    // Non-blocking
  }
}

export function writeErrorLog(route: string, message: string): void {
  try {
    const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(
      `INSERT INTO server_error_logs (id, route, message, created_at) VALUES (?, ?, ?, ?)`,
    ).run(id, route.slice(0, 120), message.slice(0, 500), new Date().toISOString());
  } catch {
    // Non-blocking
  }
}

export function createDatabaseBackup(): { filename: string; path: string; sizeBytes: number } {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `flixfil-backup-${stamp}.db`;
  const destPath = path.join(BACKUP_DIR, filename);
  const escaped = destPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}';`);
  const stat = fs.statSync(destPath);

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('flixfil-backup-') && f.endsWith('.db'))
    .sort()
    .reverse();
  for (const old of files.slice(10)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    } catch {
      // ignore
    }
  }
  return { filename, path: destPath, sizeBytes: stat.size };
}

export const PATHS = {
  DATA_DIR,
  BACKUP_DIR,
  UPLOAD_DIR,
  STREAM_DIR,
};
