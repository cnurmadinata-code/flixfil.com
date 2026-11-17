import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { runSmartMovieSearch, translateSubtitleWithAi } from './server/ai.ts';
import { PATHS, createDatabaseBackup, db, writeAuditLog, writeErrorLog } from './server/db.ts';
import { inspectExternalVideoUrl, searchTmdbOfficial } from './server/linkInspector.ts';
import { probeVideoMetadata, transcodeVideoToMultiHls } from './server/mediaGen.ts';
import {
  createRateLimiter,
  generateOpaqueToken,
  generateTotpSetup,
  hashPassword,
  hashToken,
  sanitizeText,
  scanUploadedBuffer,
  securityHeadersMiddleware,
  signValue,
  verifyPassword,
  verifySignedValue,
  verifyTotpToken,
} from './server/security.ts';
import { seedInitialData } from './server/seed.ts';

interface AuthUser {
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
}

interface AuthedRequest extends Request {
  authUser?: AuthUser;
  sessionId?: string;
}

const COOKIE_NAME = 'flixfil_sid';
const PORT = 3000;

function getClientIp(req: Request): string {
  return String(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '').slice(0, 64);
}

function getEffectiveTier(user: { subscription_tier: string; subscription_expires_at: string | null; role: string }): 'free' | 'premium' {
  if (user.role === 'admin') return 'premium';
  if (user.subscription_tier === 'premium') {
    if (!user.subscription_expires_at) return 'premium';
    if (new Date(user.subscription_expires_at).getTime() > Date.now()) {
      return 'premium';
    }
  }
  return 'free';
}

function attachSessionMiddleware(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const signedCookie = req.cookies?.[COOKIE_NAME];
  if (!signedCookie || typeof signedCookie !== 'string') {
    next();
    return;
  }
  const rawToken = verifySignedValue(signedCookie);
  if (!rawToken) {
    next();
    return;
  }
  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.is_admin_elevated, s.admin_elevated_until, s.expires_at,
              u.id, u.username, u.email, u.display_name, u.bio, u.avatar_url, u.role,
              u.email_verified, u.totp_enabled, u.is_profile_public,
              u.subscription_tier, u.subscription_started_at, u.subscription_expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as (Record<string, unknown> | undefined);

  if (!row) {
    next();
    return;
  }

  if (new Date(String(row.expires_at)).getTime() <= Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(String(row.session_id));
    next();
    return;
  }

  const elevatedUntil = row.admin_elevated_until ? new Date(String(row.admin_elevated_until)).getTime() : 0;
  const isAdminElevated =
    row.role === 'admin' && Number(row.is_admin_elevated) === 1 && elevatedUntil > Date.now();

  const tier = getEffectiveTier({
    subscription_tier: String(row.subscription_tier),
    subscription_expires_at: row.subscription_expires_at ? String(row.subscription_expires_at) : null,
    role: String(row.role),
  });

  req.sessionId = String(row.session_id);
  req.authUser = {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    display_name: String(row.display_name),
    bio: String(row.bio || ''),
    avatar_url: String(row.avatar_url || ''),
    role: row.role === 'admin' ? 'admin' : 'user',
    email_verified: Number(row.email_verified),
    totp_enabled: Number(row.totp_enabled),
    is_profile_public: Number(row.is_profile_public),
    subscription_tier: tier,
    subscription_started_at: row.subscription_started_at ? String(row.subscription_started_at) : null,
    subscription_expires_at: row.subscription_expires_at ? String(row.subscription_expires_at) : null,
    is_admin_elevated: isAdminElevated,
  };
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Silakan masuk ke akun FLIXFIL Anda terlebih dahulu.' });
    return;
  }
  next();
}

function requireAdminElevated(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Autentikasi administrator diperlukan.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    writeAuditLog(req.authUser.id, 'UNAUTHORIZED_ADMIN_ACCESS', 'admin', '', 'Non-admin attempted admin route', getClientIp(req));
    res.status(403).json({ error: 'Akses ditolak. Halaman ini khusus Administrator FLIXFIL.' });
    return;
  }
  if (!req.authUser.is_admin_elevated) {
    res.status(403).json({
      error: 'Verifikasi password khusus administrator diperlukan untuk melakukan tindakan ini.',
      requireAdminElevation: true,
    });
    return;
  }
  next();
}

function createSessionForUser(req: Request, res: Response, userId: string): string {
  const rawToken = generateOpaqueToken(32);
  const tokenHash = hashToken(rawToken);
  const sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, ip, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, tokenHash, userId, getClientIp(req), String(req.headers['user-agent'] || '').slice(0, 200), expiresAt);

  const isHttps = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE_NAME, signValue(rawToken), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return sessionId;
}

function srtToVtt(srt: string): string {
  const normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const converted = normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return converted.trim().startsWith('WEBVTT') ? converted : `WEBVTT\n\n${converted}`;
}

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function computeTrendingStats(movieId: string) {
  const now = Date.now();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const cutoff7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff14d = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  const views24h = (
    db.prepare(`SELECT COUNT(*) AS c FROM view_events WHERE movie_id = ? AND created_at >= ?`).get(movieId, cutoff24h) as {
      c: number;
    }
  ).c;
  const views7d = (
    db.prepare(`SELECT COUNT(*) AS c FROM view_events WHERE movie_id = ? AND created_at >= ?`).get(movieId, cutoff7d) as {
      c: number;
    }
  ).c;
  const viewsPrev7d = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM view_events WHERE movie_id = ? AND created_at >= ? AND created_at < ?`)
      .get(movieId, cutoff14d, cutoff7d) as { c: number }
  ).c;
  const completions = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM user_library WHERE movie_id = ? AND watch_status = 'completed'`)
      .get(movieId) as { c: number }
  ).c;
  return { views24h, views7d, viewsPrev7d, completions };
}

const DEFAULT_CATEGORIES = [
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

function getAppConfig(key: string, fallback = ''): string {
  const row = db.prepare(`SELECT value FROM app_config WHERE key = ?`).get(key) as { value: string } | undefined;
  return row ? String(row.value) : fallback;
}

function setAppConfig(key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}

function getConfiguredCategories(): string[] {
  const raw = getAppConfig('categories_json', '');
  if (!raw) return DEFAULT_CATEGORIES;
  const parsed = safeJsonParse<string[]>(raw, DEFAULT_CATEGORIES);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CATEGORIES;
}

function findDanaQrImage(): { filePath: string; mimeType: string } | null {
  const candidates: Array<{ ext: string; mime: string }> = [
    { ext: '.png', mime: 'image/png' },
    { ext: '.jpg', mime: 'image/jpeg' },
    { ext: '.jpeg', mime: 'image/jpeg' },
    { ext: '.webp', mime: 'image/webp' },
  ];
  for (const c of candidates) {
    const p = path.join(PATHS.DATA_DIR, `dana_qr_image${c.ext}`);
    if (fs.existsSync(p)) return { filePath: p, mimeType: c.mime };
  }
  return null;
}

async function verifyMovieSourceAvailability(row: Record<string, unknown>): Promise<'ready' | 'unavailable'> {
  const sourceType = String(row.source_type || '');
  const sourceUrl = String(row.source_url || '');
  const embedUrl = String(row.embed_url || '');
  if (sourceType === 'external_only' && sourceUrl.startsWith('http')) {
    return 'ready';
  }
  if (sourceUrl.startsWith('/streams/')) {
    const rel = sourceUrl.replace(/^\/streams\//, '');
    const full = path.join(PATHS.STREAM_DIR, rel);
    return fs.existsSync(full) ? 'ready' : 'unavailable';
  }
  const target = sourceUrl.startsWith('http') ? sourceUrl : embedUrl.startsWith('http') ? embedUrl : '';
  if (!target) return 'unavailable';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(target, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(timer);
    if (resp.status >= 400 && resp.status !== 405 && resp.status !== 403) {
      return 'unavailable';
    }
    return 'ready';
  } catch {
    return 'ready';
  }
}

function formatMovieRow(row: Record<string, unknown>, libRow?: Record<string, unknown>) {
  const id = String(row.id);
  const tStats = computeTrendingStats(id);
  const viewCount = Number(row.view_count || 0);
  const favoriteCount = Number(row.favorite_count || 0);
  const growthRate = Number(((tStats.views24h * 7 - tStats.viewsPrev7d) / Math.max(1, tStats.viewsPrev7d)).toFixed(2));
  const trendingScore =
    tStats.views24h * 6 + tStats.views7d * 3 + viewCount + favoriteCount * 4 + tStats.completions * 5;

  return {
    id,
    title: String(row.title),
    altTitles: String(row.alt_titles || ''),
    slug: String(row.slug),
    type: String(row.type),
    category: String(row.category),
    genres: safeJsonParse<string[]>(row.genres, []),
    country: String(row.country),
    releaseYear: Number(row.release_year),
    originalReleaseDate: String(row.original_release_date || ''),
    durationSeconds: Number(row.duration_seconds),
    ageRating: String(row.age_rating),
    synopsis: String(row.synopsis),
    director: String(row.director),
    cast: safeJsonParse<string[]>(row.cast_members, []),
    posterUrl: String(row.poster_url || ''),
    backdropUrl: String(row.backdrop_url || ''),
    sourceType: String(row.source_type),
    sourceUrl: String(row.source_url || ''),
    embedUrl: String(row.embed_url || ''),
    premiumStreamUrl: String(row.premium_stream_url || ''),
    playbackSupported: Boolean(row.playback_supported),
    availableQualities: safeJsonParse<string[]>(row.available_qualities, []),
    audioTracks: safeJsonParse<Array<Record<string, string>>>(row.audio_tracks, []),
    introEndSeconds: Number(row.intro_end_seconds || 0),
    accessTier: String(row.access_tier) as 'free' | 'premium',
    freeMaxQuality: String(row.free_max_quality || '1080p'),
    publishStatus: String(row.publish_status || 'ready') as
      | 'pending_check'
      | 'processing'
      | 'ready'
      | 'failed'
      | 'unavailable',
    lastCheckedAt: String(row.last_checked_at || ''),
    isFeatured: Boolean(row.is_featured),
    isPinnedHero: Boolean(row.is_pinned_hero),
    isAdminPick: Boolean(row.is_admin_pick),
    viewCount,
    favoriteCount,
    views24h: tStats.views24h,
    views7d: tStats.views7d,
    completionsCount: tStats.completions,
    growthRate,
    trendingScore,
    ratingAvg: Number(row.rating_avg || 0),
    ratingCount: Number(row.rating_count || 0),
    publishedAt: String(row.published_at || row.created_at),
    createdAt: String(row.created_at),
    userLibrary: libRow
      ? {
          watchStatus: String(libRow.watch_status),
          isFavorite: Boolean(libRow.is_favorite),
          inWatchlist: Boolean(libRow.in_watchlist),
          personalNote: String(libRow.personal_note || ''),
          customCategory: String(libRow.custom_category || ''),
          progressSeconds: Number(libRow.progress_seconds || 0),
          durationSeconds: Number(libRow.duration_seconds || 0),
          lastEpisodeId: String(libRow.last_episode_id || ''),
          lastWatchedAt: libRow.last_watched_at ? String(libRow.last_watched_at) : null,
        }
      : null,
  };
}

function checkLoginLockout(key: string): { locked: boolean; retryMinutes?: number } {
  const row = db.prepare(`SELECT attempts, locked_until FROM login_attempts WHERE key = ?`).get(key) as
    | { attempts: number; locked_until: string | null }
    | undefined;
  if (!row || !row.locked_until) return { locked: false };
  const until = new Date(row.locked_until).getTime();
  if (until > Date.now()) {
    return { locked: true, retryMinutes: Math.max(1, Math.ceil((until - Date.now()) / 60000)) };
  }
  return { locked: false };
}

function recordFailedLogin(key: string): void {
  const row = db.prepare(`SELECT attempts FROM login_attempts WHERE key = ?`).get(key) as
    | { attempts: number }
    | undefined;
  const nextAttempts = (row?.attempts || 0) + 1;
  const lockedUntil = nextAttempts >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
  db.prepare(
    `INSERT INTO login_attempts (key, attempts, locked_until, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET attempts = excluded.attempts, locked_until = excluded.locked_until, updated_at = datetime('now')`,
  ).run(key, nextAttempts, lockedUntil);
}

function clearLoginAttempts(key: string): void {
  db.prepare(`DELETE FROM login_attempts WHERE key = ?`).run(key);
}

async function startServer(): Promise<void> {
  // Seed database synchronously so catalog is immediately available
  seedInitialData();

  // Automated periodic DB backup every 12 hours
  setInterval(() => {
    try {
      createDatabaseBackup();
    } catch {
      // ignore background backup failure
    }
  }, 12 * 60 * 60 * 1000);

  // Periodic automatic source verification every 6 hours
  setInterval(() => {
    void (async () => {
      try {
        const allMovies = db.prepare(`SELECT * FROM movies`).all() as Array<Record<string, unknown>>;
        for (const m of allMovies) {
          const st = await verifyMovieSourceAvailability(m);
          db.prepare(`UPDATE movies SET publish_status = ?, last_checked_at = ? WHERE id = ?`).run(
            st,
            new Date().toISOString(),
            String(m.id),
          );
        }
      } catch {
        // ignore periodic source check error
      }
    })();
  }, 6 * 60 * 60 * 1000);

  const app = express();
  app.set('trust proxy', 1);
  app.use(securityHeadersMiddleware);
  app.use(cookieParser());
  app.use(express.json({ limit: '16mb' }));
  app.use(attachSessionMiddleware);

  // Serve generated/uploaded HLS streams and extracted frame posters cleanly
  app.use(
    '/streams',
    express.static(PATHS.STREAM_DIR, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.m3u8')) {
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'public, max-age=60');
        } else if (filePath.endsWith('.ts')) {
          res.setHeader('Content-Type', 'video/mp2t');
          res.setHeader('Cache-Control', 'public, max-age=86400');
        } else if (filePath.endsWith('.jpg')) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    }),
  );

  const authRateLimiter = createRateLimiter(30, 15 * 60 * 1000, 'auth');
  const apiRateLimiter = createRateLimiter(240, 60 * 1000, 'api');
  app.use('/api', apiRateLimiter);

  // ==================== PUBLIC CONFIG, SERVER TIME & HEALTH ====================
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', brand: 'FLIXFIL', utcNowIso: new Date().toISOString() });
  });

  app.get('/api/time', (_req, res) => {
    const now = new Date();
    res.json({
      utcNowIso: now.toISOString(),
      epochMs: now.getTime(),
      timezone: getAppConfig('timezone', 'Asia/Jakarta'),
    });
  });

  app.get('/api/config', (_req, res) => {
    const danaQr = findDanaQrImage();
    res.json({
      brand: 'FLIXFIL',
      tagline: getAppConfig('site_tagline', 'Your Story. Your Screen.'),
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      tmdbEnabled: Boolean(process.env.TMDB_API_KEY),
      heroAutoFeature: getAppConfig('hero_auto_feature', '1') !== '0',
      maintenanceMode: getAppConfig('maintenance_mode', '0') === '1',
      trendingEnabled: getAppConfig('trending_enabled', '1') !== '0',
      uploadMaxHours: Number(getAppConfig('upload_max_hours', '10')) || 10,
      timezone: getAppConfig('timezone', 'Asia/Jakarta'),
      allowedStreamDomains: getAppConfig('allowed_stream_domains', 'youtube.com,vimeo.com,dailymotion.com,archive.org,bilibili.com'),
      categories: getConfiguredCategories(),
      danaQrConfigured: Boolean(danaQr),
      allFilmsFree: true,
      paymentGateways: {
        midtransConfigured: Boolean(process.env.MIDTRANS_SERVER_KEY),
        xenditConfigured: Boolean(process.env.XENDIT_SECRET_KEY),
      },
      maxSubscriptionPriceIdr: 20000,
    });
  });

  app.get('/api/payments/dana-qr-image', (_req, res) => {
    const img = findDanaQrImage();
    if (!img) {
      res.status(404).json({ error: 'QR Code DANA resmi belum diunggah oleh Administrator.' });
      return;
    }
    res.setHeader('Content-Type', img.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(img.filePath);
  });

  // ==================== AUTHENTICATION ====================
  app.get('/api/auth/me', (req: AuthedRequest, res) => {
    if (!req.authUser) {
      res.json({ user: null, settings: null });
      return;
    }
    const uRow = db
      .prepare(`SELECT google_sub FROM users WHERE id = ?`)
      .get(req.authUser.id) as { google_sub: string | null } | undefined;
    const settings = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(req.authUser.id);
    res.json({
      user: {
        ...req.authUser,
        google_linked: Boolean(uRow?.google_sub),
      },
      settings,
    });
  });

  app.post('/api/auth/register', authRateLimiter, (req: AuthedRequest, res) => {
    const username = sanitizeText(req.body?.username, 40).toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const displayName = sanitizeText(req.body?.displayName || username, 80);

    if (username.length < 3 || !email.includes('@') || password.length < 8) {
      res.status(400).json({
        error: 'Username minimal 3 karakter, email valid, dan password minimal 8 karakter.',
      });
      return;
    }

    const exists = db
      .prepare(`SELECT id FROM users WHERE username = ? OR email = ?`)
      .get(username, email);
    if (exists) {
      res.status(409).json({ error: 'Username atau email sudah terdaftar.' });
      return;
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, display_name, role, email_verified, subscription_tier)
       VALUES (?, ?, ?, ?, ?, 'user', 0, 'free')`,
    ).run(userId, username, email, hashPassword(password), displayName);

    db.prepare(`INSERT INTO user_settings (user_id, language) VALUES (?, 'id')`).run(userId);

    const verCode = String(Math.floor(100000 + Math.random() * 900000));
    db.prepare(
      `INSERT INTO email_verifications (id, user_id, code, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).run(`ver_${Date.now()}`, userId, verCode, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, message)
       VALUES (?, ?, 'security', ?, ?)`,
    ).run(
      `not_${Date.now()}`,
      userId,
      'Verifikasi Email Diperlukan',
      `Kode verifikasi akun FLIXFIL Anda: ${verCode}. Masukkan kode ini di Pengaturan atau halaman verifikasi.`,
    );

    createSessionForUser(req, res, userId);
    writeAuditLog(userId, 'USER_REGISTER', 'user', userId, `Registered ${username}`, getClientIp(req));
    res.status(201).json({
      ok: true,
      verificationCodePreview: verCode,
      message: 'Akun berhasil dibuat. Cek notifikasi untuk kode verifikasi email.',
    });
  });

  app.post('/api/auth/verify-email', requireAuth, (req: AuthedRequest, res) => {
    const code = sanitizeText(req.body?.code, 16);
    const row = db
      .prepare(
        `SELECT id, expires_at FROM email_verifications
         WHERE user_id = ? AND code = ? AND used = 0
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(req.authUser!.id, code) as { id: string; expires_at: string } | undefined;

    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Kode verifikasi tidak valid atau sudah kedaluwarsa.' });
      return;
    }

    db.prepare(`UPDATE email_verifications SET used = 1 WHERE id = ?`).run(row.id);
    db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).run(req.authUser!.id);
    res.json({ ok: true, message: 'Email berhasil diverifikasi.' });
  });

  app.post('/api/auth/login', authRateLimiter, (req: AuthedRequest, res) => {
    const identifier = sanitizeText(req.body?.identifier || req.body?.username || req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const totpCode = sanitizeText(req.body?.totpCode, 10);
    const lockKey = `login:${getClientIp(req)}:${identifier}`;

    const lockStatus = checkLoginLockout(lockKey);
    if (lockStatus.locked) {
      res.status(429).json({
        error: `Terlalu banyak percobaan login gagal. Coba lagi dalam ${lockStatus.retryMinutes} menit.`,
      });
      return;
    }

    const user = db
      .prepare(`SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ?`)
      .get(identifier, identifier) as Record<string, unknown> | undefined;

    if (!user || !verifyPassword(password, String(user.password_hash))) {
      recordFailedLogin(lockKey);
      writeAuditLog(null, 'LOGIN_FAILED', 'auth', identifier, 'Invalid credentials', getClientIp(req));
      res.status(401).json({ error: 'Username/email atau kata sandi salah.' });
      return;
    }

    if (Number(user.totp_enabled) === 1) {
      if (!totpCode) {
        res.status(202).json({ require2fa: true, message: 'Masukkan kode autentikasi 2FA (6 digit).' });
        return;
      }
      if (!verifyTotpToken(String(user.totp_secret), totpCode)) {
        recordFailedLogin(lockKey);
        res.status(401).json({ error: 'Kode 2FA tidak valid.', require2fa: true });
        return;
      }
    }

    clearLoginAttempts(lockKey);
    createSessionForUser(req, res, String(user.id));
    writeAuditLog(String(user.id), 'USER_LOGIN', 'user', String(user.id), 'Logged in successfully', getClientIp(req));
    res.json({ ok: true });
  });

  app.post('/api/auth/google', authRateLimiter, async (req: AuthedRequest, res) => {
    const idToken = sanitizeText(req.body?.credential, 4096);
    if (!idToken) {
      res.status(400).json({ error: 'Token Google Sign-In tidak ditemukan.' });
      return;
    }

    try {
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!verifyRes.ok) {
        res.status(401).json({ error: 'Token Google tidak valid atau kedaluwarsa.' });
        return;
      }
      const payload = (await verifyRes.json()) as Record<string, string>;
      if (process.env.GOOGLE_CLIENT_ID && payload.aud !== process.env.GOOGLE_CLIENT_ID) {
        res.status(401).json({ error: 'Client ID Google tidak cocok.' });
        return;
      }
      const email = String(payload.email || '').toLowerCase();
      const sub = String(payload.sub || '');
      const name = sanitizeText(payload.name || email.split('@')[0], 80);
      const picture = sanitizeText(payload.picture || '', 400);

      let user = db
        .prepare(`SELECT * FROM users WHERE google_sub = ? OR lower(email) = ?`)
        .get(sub, email) as Record<string, unknown> | undefined;

      if (!user) {
        const userId = `usr_g_${Date.now()}`;
        const baseUsername = email.split('@')[0].replace(/[^a-z0-9_]/g, '') || 'user';
        const username = `${baseUsername}_${Math.random().toString(36).slice(2, 6)}`;
        db.prepare(
          `INSERT INTO users (id, username, email, password_hash, display_name, avatar_url, role, email_verified, google_sub, subscription_tier)
           VALUES (?, ?, ?, ?, ?, ?, 'user', 1, ?, 'free')`,
        ).run(userId, username, email, hashPassword(generateOpaqueToken(16)), name, picture, sub);
        db.prepare(`INSERT INTO user_settings (user_id, language) VALUES (?, 'id')`).run(userId);
        user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as Record<string, unknown>;
      } else if (!user.google_sub && sub) {
        db.prepare(
          `UPDATE users SET google_sub = ?, email_verified = 1, avatar_url = COALESCE(NULLIF(avatar_url, ''), ?) WHERE id = ?`,
        ).run(sub, picture, String(user.id));
        user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(String(user.id)) as Record<string, unknown>;
      }

      createSessionForUser(req, res, String(user.id));
      writeAuditLog(String(user.id), 'GOOGLE_LOGIN', 'user', String(user.id), email, getClientIp(req));
      res.json({
        ok: true,
        account: {
          id: String(user.id),
          username: String(user.username),
          email: String(user.email),
          displayName: String(user.display_name || name),
          avatarUrl: String(user.avatar_url || picture),
        },
      });
    } catch {
      res.status(502).json({ error: 'Gagal memverifikasi sesi Google Sign-In.' });
    }
  });

  app.post('/api/auth/forgot-password', authRateLimiter, (req, res) => {
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const user = db.prepare(`SELECT id FROM users WHERE lower(email) = ?`).get(email) as
      | { id: string }
      | undefined;

    if (!user) {
      res.json({
        ok: true,
        message: 'Jika email terdaftar, instruksi reset password telah dibuat.',
      });
      return;
    }

    const resetCode = String(Math.floor(100000 + Math.random() * 900000));
    const resetToken = generateOpaqueToken(16);
    db.prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, code, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      `rst_${Date.now()}`,
      user.id,
      hashToken(resetToken),
      resetCode,
      new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    );

    res.json({
      ok: true,
      resetCodeDemo: resetCode,
      message: 'Kode reset kata sandi telah dibuat (berlaku 30 menit).',
    });
  });

  app.post('/api/auth/reset-password', authRateLimiter, (req, res) => {
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const code = sanitizeText(req.body?.code, 16);
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Password baru minimal 8 karakter.' });
      return;
    }

    const user = db.prepare(`SELECT id FROM users WHERE lower(email) = ?`).get(email) as
      | { id: string }
      | undefined;
    if (!user) {
      res.status(400).json({ error: 'Email atau kode reset tidak valid.' });
      return;
    }

    const resetRow = db
      .prepare(
        `SELECT id, expires_at FROM password_resets
         WHERE user_id = ? AND code = ? AND used = 0
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(user.id, code) as { id: string; expires_at: string } | undefined;

    if (!resetRow || new Date(resetRow.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Kode reset tidak valid atau kedaluwarsa.' });
      return;
    }

    db.prepare(`UPDATE password_resets SET used = 1 WHERE id = ?`).run(resetRow.id);
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(newPassword), user.id);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);
    writeAuditLog(user.id, 'PASSWORD_RESET', 'user', user.id, 'Password reset completed', getClientIp(req));
    res.json({ ok: true, message: 'Kata sandi berhasil diperbarui. Silakan login kembali.' });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res) => {
    if (req.sessionId) {
      db.prepare(`DELETE FROM sessions WHERE id = ?`).run(req.sessionId);
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  // 2FA TOTP Management
  app.post('/api/auth/2fa/setup', requireAuth, (req: AuthedRequest, res) => {
    const setup = generateTotpSetup(req.authUser!.username);
    db.prepare(`UPDATE users SET totp_secret = ? WHERE id = ?`).run(setup.secret, req.authUser!.id);
    res.json({ secret: setup.secret, otpauthUri: setup.uri });
  });

  app.post('/api/auth/2fa/verify', requireAuth, (req: AuthedRequest, res) => {
    const code = sanitizeText(req.body?.code, 10);
    const userRow = db
      .prepare(`SELECT totp_secret FROM users WHERE id = ?`)
      .get(req.authUser!.id) as { totp_secret: string } | undefined;

    if (!userRow?.totp_secret || !verifyTotpToken(userRow.totp_secret, code)) {
      res.status(400).json({ error: 'Kode 2FA tidak cocok. Pastikan jam perangkat Anda sinkron.' });
      return;
    }

    db.prepare(`UPDATE users SET totp_enabled = 1 WHERE id = ?`).run(req.authUser!.id);
    writeAuditLog(req.authUser!.id, 'ENABLE_2FA', 'user', req.authUser!.id, 'TOTP 2FA enabled', getClientIp(req));
    res.json({ ok: true });
  });

  app.post('/api/auth/2fa/disable', requireAuth, (req: AuthedRequest, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const userRow = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(req.authUser!.id) as
      | { password_hash: string }
      | undefined;
    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      res.status(401).json({ error: 'Password akun diperlukan untuk menonaktifkan 2FA.' });
      return;
    }
    db.prepare(`UPDATE users SET totp_enabled = 0, totp_secret = '' WHERE id = ?`).run(req.authUser!.id);
    writeAuditLog(req.authUser!.id, 'DISABLE_2FA', 'user', req.authUser!.id, 'TOTP 2FA disabled', getClientIp(req));
    res.json({ ok: true });
  });

  // Admin Secondary Master Password Elevation
  app.post('/api/admin/elevate', authRateLimiter, requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser!.role !== 'admin') {
      writeAuditLog(req.authUser!.id, 'ADMIN_ELEVATION_DENIED', 'user', req.authUser!.id, 'Not admin role', getClientIp(req));
      res.status(403).json({ error: 'Akun Anda tidak memiliki hak Administrator.' });
      return;
    }

    const lockKey = `admin_elevate:${req.authUser!.id}:${getClientIp(req)}`;
    const lock = checkLoginLockout(lockKey);
    if (lock.locked) {
      res.status(429).json({
        error: `Akses admin terkunci sementara selama ${lock.retryMinutes} menit karena percobaan gagal berulang.`,
      });
      return;
    }

    const adminPassword = typeof req.body?.adminPassword === 'string' ? req.body.adminPassword : '';
    const totpCode = sanitizeText(req.body?.totpCode, 10);

    const masterRow = db
      .prepare(`SELECT value FROM app_config WHERE key = 'admin_master_hash'`)
      .get() as { value: string } | undefined;

    if (!masterRow || !verifyPassword(adminPassword, masterRow.value)) {
      recordFailedLogin(lockKey);
      writeAuditLog(req.authUser!.id, 'ADMIN_ELEVATION_FAILED', 'admin', '', 'Wrong master password', getClientIp(req));
      res.status(401).json({ error: 'Password khusus administrator salah.' });
      return;
    }

    const userRow = db
      .prepare(`SELECT totp_enabled, totp_secret FROM users WHERE id = ?`)
      .get(req.authUser!.id) as { totp_enabled: number; totp_secret: string } | undefined;
    if (userRow?.totp_enabled === 1 && !verifyTotpToken(userRow.totp_secret, totpCode)) {
      recordFailedLogin(lockKey);
      res.status(401).json({ error: 'Kode 2FA administrator tidak valid.', require2fa: true });
      return;
    }

    clearLoginAttempts(lockKey);
    const elevatedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE sessions SET is_admin_elevated = 1, admin_elevated_until = ? WHERE id = ?`).run(
      elevatedUntil,
      req.sessionId!,
    );
    writeAuditLog(req.authUser!.id, 'ADMIN_ELEVATED', 'session', req.sessionId!, 'Elevated for 2 hours', getClientIp(req));
    res.json({ ok: true, elevatedUntil });
  });

  app.post('/api/admin/lock', requireAuth, (req: AuthedRequest, res) => {
    if (req.sessionId) {
      db.prepare(`UPDATE sessions SET is_admin_elevated = 0, admin_elevated_until = NULL WHERE id = ?`).run(
        req.sessionId,
      );
    }
    res.json({ ok: true });
  });

  // ==================== MOVIES, SEARCH & SUBTITLES ====================
  app.get('/api/movies', (req: AuthedRequest, res) => {
    const category = sanitizeText(req.query.category, 80);
    const type = sanitizeText(req.query.type, 40);
    const tier = sanitizeText(req.query.tier, 20);
    const sort = sanitizeText(req.query.sort, 30);

    // Public catalog strictly shows ready & published films (broken/failed sources excluded)
    const conditions: string[] = [`publish_status = 'ready'`, `is_published = 1`];
    const params: Array<string | number> = [];

    if (category && category !== 'all') {
      conditions.push(`(category = ? OR genres LIKE ?)`);
      params.push(category, `%${category}%`);
    }
    if (type && type !== 'all') {
      conditions.push(`type = ?`);
      params.push(type);
    }
    if (tier === 'free' || tier === 'premium') {
      conditions.push(`access_tier = ?`);
      params.push(tier);
    }

    let orderBy = `created_at DESC`;
    if (sort === 'trending' || sort === 'views') orderBy = `(view_count + favorite_count * 2) DESC`;
    else if (sort === 'rating') orderBy = `rating_avg DESC, rating_count DESC`;
    else if (sort === 'year') orderBy = `release_year DESC`;
    else if (sort === 'title') orderBy = `title ASC`;

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const rows = db.prepare(`SELECT * FROM movies ${whereClause} ORDER BY ${orderBy}`).all(...params) as Array<
      Record<string, unknown>
    >;

    let libMap = new Map<string, Record<string, unknown>>();
    if (req.authUser) {
      const libRows = db
        .prepare(`SELECT * FROM user_library WHERE user_id = ?`)
        .all(req.authUser.id) as Array<Record<string, unknown>>;
      libMap = new Map(libRows.map((l) => [String(l.movie_id), l]));
    }

    const formatted = rows.map((r) => formatMovieRow(r, libMap.get(String(r.id))));
    if (sort === 'trending') {
      formatted.sort((a, b) => b.trendingScore - a.trendingScore);
    }

    const autoHeroRow = db
      .prepare(`SELECT value FROM app_config WHERE key = 'hero_auto_feature'`)
      .get() as { value: string } | undefined;
    const autoHeroEnabled = autoHeroRow?.value !== '0';

    res.json({
      movies: formatted,
      heroAutoFeature: autoHeroEnabled,
    });
  });

  app.post('/api/search/smart', async (req: AuthedRequest, res) => {
    const query = sanitizeText(req.body?.query, 300);
    const rows = db
      .prepare(`SELECT * FROM movies WHERE publish_status = 'ready' AND is_published = 1`)
      .all() as Array<Record<string, unknown>>;
    const catalog = rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      altTitles: String(r.alt_titles || ''),
      category: String(r.category),
      genres: safeJsonParse<string[]>(r.genres, []),
      country: String(r.country),
      releaseYear: Number(r.release_year),
      director: String(r.director),
      cast: safeJsonParse<string[]>(r.cast_members, []),
      synopsis: String(r.synopsis),
    }));

    const aiResult = await runSmartMovieSearch(query, catalog);
    const rowMap = new Map(rows.map((r) => [String(r.id), r]));
    let libMap = new Map<string, Record<string, unknown>>();
    if (req.authUser) {
      const libRows = db
        .prepare(`SELECT * FROM user_library WHERE user_id = ?`)
        .all(req.authUser.id) as Array<Record<string, unknown>>;
      libMap = new Map(libRows.map((l) => [String(l.movie_id), l]));
    }

    const matchedMovies = aiResult.matchedIds
      .map((id) => rowMap.get(id))
      .filter((r): r is Record<string, unknown> => Boolean(r))
      .map((r) => formatMovieRow(r, libMap.get(String(r.id))));

    res.json({
      movies: matchedMovies,
      interpretedIntent: aiResult.interpretedIntent,
      correctedQuery: aiResult.correctedQuery,
      usedAi: aiResult.usedAi,
    });
  });

  app.get('/api/movies/:id', (req: AuthedRequest, res) => {
    const id = sanitizeText(req.params.id, 100);
    const row = db.prepare(`SELECT * FROM movies WHERE id = ? OR slug = ?`).get(id, id) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Film tidak ditemukan.' });
      return;
    }
    if ((String(row.publish_status || 'ready') !== 'ready' || Number(row.is_published) === 0) && req.authUser?.role !== 'admin') {
      res.status(404).json({ error: 'Film belum tersedia atau sedang dalam pemeriksaan.' });
      return;
    }

    const movieId = String(row.id);
    const episodes = db
      .prepare(`SELECT * FROM episodes WHERE movie_id = ? ORDER BY season_number ASC, episode_number ASC`)
      .all(movieId) as Array<Record<string, unknown>>;

    const subtitles = db
      .prepare(`SELECT id, movie_id, episode_id, language_code, language_label, format, is_default FROM subtitles WHERE movie_id = ?`)
      .all(movieId) as Array<Record<string, unknown>>;

    const reviews = db
      .prepare(
        `SELECT r.id, r.rating, r.comment, r.created_at, u.username, u.display_name, u.avatar_url
         FROM reviews r JOIN users u ON u.id = r.user_id
         WHERE r.movie_id = ? ORDER BY r.created_at DESC LIMIT 30`,
      )
      .all(movieId);

    const libRow = req.authUser
      ? (db
          .prepare(`SELECT * FROM user_library WHERE user_id = ? AND movie_id = ?`)
          .get(req.authUser.id, movieId) as Record<string, unknown> | undefined)
      : undefined;

    // Related films by category / genre / country (only ready films)
    const allOthers = db
      .prepare(`SELECT * FROM movies WHERE id != ? AND publish_status = 'ready' AND is_published = 1 ORDER BY view_count DESC`)
      .all(movieId) as Array<Record<string, unknown>>;
    const targetGenres = new Set(safeJsonParse<string[]>(row.genres, []));
    const related = allOthers
      .map((m) => {
        const mGenres = safeJsonParse<string[]>(m.genres, []);
        let score = m.category === row.category ? 3 : 0;
        if (m.country === row.country) score += 2;
        for (const g of mGenres) if (targetGenres.has(g)) score += 2;
        return { m, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => formatMovieRow(x.m));

    res.json({
      movie: formatMovieRow(row, libRow),
      episodes: episodes.map((e) => ({
        id: String(e.id),
        movieId: String(e.movie_id),
        seasonNumber: Number(e.season_number),
        episodeNumber: Number(e.episode_number),
        title: String(e.title),
        synopsis: String(e.synopsis || ''),
        durationSeconds: Number(e.duration_seconds),
        sourceUrl: String(e.source_url || ''),
        embedUrl: String(e.embed_url || ''),
        availableQualities: safeJsonParse<string[]>(e.available_qualities, []),
        introEndSeconds: Number(e.intro_end_seconds || 0),
      })),
      subtitles,
      reviews,
      related,
    });
  });

  app.post('/api/movies/:id/view', (req: AuthedRequest, res) => {
    const id = sanitizeText(req.params.id, 100);
    const ua = String(req.headers['user-agent'] || '').toLowerCase();
    if (/bot|crawler|spider|scrapy|headless/i.test(ua)) {
      res.status(403).json({ error: 'Aktivitas otomatis tidak dihitung.' });
      return;
    }

    const movie = db.prepare(`SELECT id, publish_status FROM movies WHERE id = ?`).get(id) as
      | { id: string; publish_status: string }
      | undefined;
    if (!movie) {
      res.status(404).json({ error: 'Film tidak ditemukan.' });
      return;
    }
    if (movie.publish_status !== 'ready' && req.authUser?.role !== 'admin') {
      res.status(403).json({ error: 'Film sedang dalam proses pemeriksaan atau belum siap ditayangkan.' });
      return;
    }

    // Bot & fake-view cooldown protection: max 1 counted view per IP/session per 30 minutes per film
    const ipHash = hashToken(getClientIp(req));
    const sessionKey = req.sessionId || ipHash;
    const cooldownCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const recentView = db
      .prepare(
        `SELECT id FROM view_events
         WHERE movie_id = ? AND (session_key = ? OR ip_hash = ?) AND created_at >= ?
         LIMIT 1`,
      )
      .get(movie.id, sessionKey, ipHash, cooldownCutoff);

    if (!recentView) {
      db.prepare(
        `INSERT INTO view_events (id, movie_id, user_id, ip_hash, session_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        `vw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        movie.id,
        req.authUser?.id || null,
        ipHash,
        sessionKey,
        new Date().toISOString(),
      );
      db.prepare(`UPDATE movies SET view_count = view_count + 1 WHERE id = ?`).run(movie.id);
    }

    res.json({ ok: true, counted: !recentView });
  });

  app.get('/api/subtitles/:id/vtt', (req, res) => {
    const sub = db.prepare(`SELECT format, content FROM subtitles WHERE id = ?`).get(req.params.id) as
      | { format: string; content: string }
      | undefined;
    if (!sub) {
      res.status(404).send('Subtitle not found');
      return;
    }
    const vtt = sub.format === 'srt' ? srtToVtt(sub.content) : sub.content;
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(vtt);
  });

  app.post('/api/subtitles/translate', requireAuth, async (req: AuthedRequest, res) => {
    const subtitleId = sanitizeText(req.body?.subtitleId, 100);
    const targetLanguage = sanitizeText(req.body?.targetLanguage || 'Bahasa Indonesia', 60);
    const sub = db.prepare(`SELECT movie_id, format, content FROM subtitles WHERE id = ?`).get(subtitleId) as
      | { movie_id: string; format: string; content: string }
      | undefined;
    if (!sub) {
      res.status(404).json({ error: 'Subtitle sumber tidak ditemukan.' });
      return;
    }

    try {
      const vttInput = sub.format === 'srt' ? srtToVtt(sub.content) : sub.content;
      const translatedVtt = await translateSubtitleWithAi(vttInput, targetLanguage);
      res.json({ ok: true, translatedVtt, languageLabel: `${targetLanguage} (AI)` });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gagal menerjemahkan subtitle dengan AI.',
      });
    }
  });

  app.post('/api/inspect-link', async (req, res) => {
    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    try {
      const info = await inspectExternalVideoUrl(url);
      res.json({ ok: true, metadata: info });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Tautan tidak valid atau tidak dapat diperiksa.',
      });
    }
  });

  app.get('/api/tmdb/search', async (req, res) => {
    const q = sanitizeText(req.query.q, 120);
    if (!q) {
      res.json({ results: [] });
      return;
    }
    const results = await searchTmdbOfficial(q);
    res.json({ results });
  });

  // ==================== USER LIBRARY, MY ROOM & PERSONAL VAULT ====================
  app.get('/api/my/library', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT ul.*, m.title, m.poster_url, m.backdrop_url, m.category, m.release_year, m.duration_seconds AS movie_duration, m.access_tier, m.genres
         FROM user_library ul
         JOIN movies m ON m.id = ul.movie_id
         WHERE ul.user_id = ?
         ORDER BY COALESCE(ul.last_watched_at, ul.updated_at) DESC`,
      )
      .all(req.authUser!.id);
    res.json({ items: rows });
  });

  app.post('/api/my/library/:movieId', requireAuth, (req: AuthedRequest, res) => {
    const movieId = sanitizeText(req.params.movieId, 100);
    const movie = db.prepare(`SELECT id, duration_seconds FROM movies WHERE id = ?`).get(movieId) as
      | { id: string; duration_seconds: number }
      | undefined;
    if (!movie) {
      res.status(404).json({ error: 'Film tidak ditemukan.' });
      return;
    }

    const existing = db
      .prepare(`SELECT * FROM user_library WHERE user_id = ? AND movie_id = ?`)
      .get(req.authUser!.id, movieId) as Record<string, unknown> | undefined;

    const nextWatchStatus = sanitizeText(req.body?.watchStatus || existing?.watch_status || 'unwatched', 20);
    const validStatus = ['unwatched', 'watching', 'completed'].includes(nextWatchStatus)
      ? nextWatchStatus
      : 'unwatched';
    const nextFav =
      typeof req.body?.isFavorite === 'boolean' ? (req.body.isFavorite ? 1 : 0) : Number(existing?.is_favorite || 0);
    const nextWatchlist =
      typeof req.body?.inWatchlist === 'boolean' ? (req.body.inWatchlist ? 1 : 0) : Number(existing?.in_watchlist || 0);
    const nextNote =
      typeof req.body?.personalNote === 'string'
        ? sanitizeText(req.body.personalNote, 1000)
        : String(existing?.personal_note || '');
    const nextCat =
      typeof req.body?.customCategory === 'string'
        ? sanitizeText(req.body.customCategory, 60)
        : String(existing?.custom_category || '');
    const nextProgress =
      typeof req.body?.progressSeconds === 'number'
        ? Math.max(0, Math.round(req.body.progressSeconds))
        : Number(existing?.progress_seconds || 0);
    const nextDuration =
      typeof req.body?.durationSeconds === 'number' && req.body.durationSeconds > 0
        ? Math.round(req.body.durationSeconds)
        : Number(existing?.duration_seconds || movie.duration_seconds || 0);
    const episodeId = sanitizeText(req.body?.episodeId || existing?.last_episode_id || '', 100);
    const clientUpdatedAt = sanitizeText(req.body?.clientUpdatedAt || new Date().toISOString(), 40);

    // Cross-device sync conflict guard: ignore stale delayed beacons older than existing updated timestamp
    if (
      typeof req.body?.progressSeconds === 'number' &&
      existing?.client_updated_at &&
      new Date(clientUpdatedAt).getTime() < new Date(String(existing.client_updated_at)).getTime() - 2000
    ) {
      res.json({ ok: true, ignoredStale: true });
      return;
    }

    const touchedPlayback = typeof req.body?.progressSeconds === 'number' || req.body?.markWatched;
    const lastWatchedAt: string | null = touchedPlayback
      ? new Date().toISOString()
      : existing?.last_watched_at
        ? String(existing.last_watched_at)
        : null;

    db.prepare(
      `INSERT INTO user_library (id, user_id, movie_id, watch_status, is_favorite, in_watchlist, personal_note, custom_category, progress_seconds, duration_seconds, last_episode_id, last_watched_at, client_updated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, movie_id) DO UPDATE SET
         watch_status = excluded.watch_status,
         is_favorite = excluded.is_favorite,
         in_watchlist = excluded.in_watchlist,
         personal_note = excluded.personal_note,
         custom_category = excluded.custom_category,
         progress_seconds = excluded.progress_seconds,
         duration_seconds = excluded.duration_seconds,
         last_episode_id = excluded.last_episode_id,
         last_watched_at = COALESCE(excluded.last_watched_at, user_library.last_watched_at),
         client_updated_at = excluded.client_updated_at,
         updated_at = excluded.updated_at`,
    ).run(
      `lib_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      req.authUser!.id,
      movieId,
      validStatus,
      nextFav,
      nextWatchlist,
      nextNote,
      nextCat,
      nextProgress,
      nextDuration,
      episodeId,
      lastWatchedAt,
      clientUpdatedAt,
      new Date().toISOString(),
    );

    if (episodeId && typeof req.body?.progressSeconds === 'number') {
      db.prepare(
        `INSERT INTO episode_progress (user_id, movie_id, episode_id, progress_seconds, duration_seconds, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, movie_id, episode_id) DO UPDATE SET
           progress_seconds = excluded.progress_seconds,
           duration_seconds = excluded.duration_seconds,
           updated_at = excluded.updated_at`,
      ).run(req.authUser!.id, movieId, episodeId, nextProgress, nextDuration, new Date().toISOString());
    }

    // Sync movie favorite_count accurately from DB
    const favCount = (
      db.prepare(`SELECT COUNT(*) AS cnt FROM user_library WHERE movie_id = ? AND is_favorite = 1`).get(movieId) as {
        cnt: number;
      }
    ).cnt;
    db.prepare(`UPDATE movies SET favorite_count = ? WHERE id = ?`).run(favCount, movieId);

    res.json({ ok: true });
  });

  app.post('/api/my/library/:movieId/restart', requireAuth, (req: AuthedRequest, res) => {
    const movieId = sanitizeText(req.params.movieId, 100);
    db.prepare(
      `UPDATE user_library SET progress_seconds = 0, watch_status = 'watching', client_updated_at = ?, updated_at = ?
       WHERE user_id = ? AND movie_id = ?`,
    ).run(new Date().toISOString(), new Date().toISOString(), req.authUser!.id, movieId);
    res.json({ ok: true });
  });

  app.delete('/api/my/continue-watching/:movieId', requireAuth, (req: AuthedRequest, res) => {
    const movieId = sanitizeText(req.params.movieId, 100);
    db.prepare(
      `UPDATE user_library SET progress_seconds = 0, watch_status = CASE WHEN watch_status = 'watching' THEN 'unwatched' ELSE watch_status END, updated_at = ?
       WHERE user_id = ? AND movie_id = ?`,
    ).run(new Date().toISOString(), req.authUser!.id, movieId);
    res.json({ ok: true });
  });

  app.delete('/api/my/history', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(
      `UPDATE user_library SET progress_seconds = 0, last_watched_at = NULL WHERE user_id = ?`,
    ).run(req.authUser!.id);
    res.json({ ok: true });
  });

  // Personal "TAMBAH TONTONAN" Vault (strictly scoped per user!)
  app.get('/api/my/vault', requireAuth, (req: AuthedRequest, res) => {
    const items = db
      .prepare(`SELECT * FROM personal_vault_items WHERE user_id = ? ORDER BY created_at DESC`)
      .all(req.authUser!.id) as Array<Record<string, unknown>>;
    res.json({
      items: items.map((item) => ({
        ...item,
        genres: safeJsonParse<string[]>(item.genres, []),
        playbackSupported: Boolean(item.playback_supported),
        isFavorite: Boolean(item.is_favorite),
      })),
    });
  });

  app.post('/api/my/vault', requireAuth, (req: AuthedRequest, res) => {
    const title = sanitizeText(req.body?.title, 180);
    if (!title) {
      res.status(400).json({ error: 'Judul tontonan wajib diisi.' });
      return;
    }
    const id = `pv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const genres = Array.isArray(req.body?.genres)
      ? req.body.genres.map((g: unknown) => sanitizeText(g, 30)).filter(Boolean)
      : [sanitizeText(req.body?.category || 'Film', 30)];

    db.prepare(
      `INSERT INTO personal_vault_items (
        id, user_id, title, type, category, genres, release_year, synopsis,
        poster_url, platform_name, source_url, embed_url, playback_supported,
        watch_status, is_favorite, personal_note, custom_category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      req.authUser!.id,
      title,
      sanitizeText(req.body?.type || 'film', 30),
      sanitizeText(req.body?.category || 'Film', 50),
      JSON.stringify(genres),
      Number(req.body?.releaseYear) || new Date().getFullYear(),
      sanitizeText(req.body?.synopsis, 1200),
      sanitizeText(req.body?.posterUrl, 600),
      sanitizeText(req.body?.platformName || 'Manual', 60),
      sanitizeText(req.body?.sourceUrl, 800),
      sanitizeText(req.body?.embedUrl, 800),
      req.body?.playbackSupported ? 1 : 0,
      'unwatched',
      req.body?.isFavorite ? 1 : 0,
      sanitizeText(req.body?.personalNote, 1000),
      sanitizeText(req.body?.customCategory, 60),
    );
    res.status(201).json({ ok: true, id });
  });

  app.patch('/api/my/vault/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = sanitizeText(req.params.id, 100);
    const existing = db
      .prepare(`SELECT * FROM personal_vault_items WHERE id = ? AND user_id = ?`)
      .get(id, req.authUser!.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item koleksi pribadi tidak ditemukan.' });
      return;
    }

    const nextTitle = req.body?.title !== undefined ? sanitizeText(req.body.title, 180) : String(existing.title);
    const nextCategory = req.body?.category !== undefined ? sanitizeText(req.body.category, 50) : String(existing.category);
    const nextStatus =
      req.body?.watchStatus && ['unwatched', 'watching', 'completed'].includes(req.body.watchStatus)
        ? req.body.watchStatus
        : String(existing.watch_status);
    const nextFav = typeof req.body?.isFavorite === 'boolean' ? (req.body.isFavorite ? 1 : 0) : Number(existing.is_favorite);
    const nextNote =
      req.body?.personalNote !== undefined ? sanitizeText(req.body.personalNote, 1000) : String(existing.personal_note);
    const nextCustomCat =
      req.body?.customCategory !== undefined ? sanitizeText(req.body.customCategory, 60) : String(existing.custom_category);
    const nextProgress =
      typeof req.body?.progressSeconds === 'number'
        ? Math.max(0, Math.round(req.body.progressSeconds))
        : Number(existing.progress_seconds || 0);

    db.prepare(
      `UPDATE personal_vault_items
       SET title = ?, category = ?, watch_status = ?, is_favorite = ?, personal_note = ?, custom_category = ?, progress_seconds = ?
       WHERE id = ? AND user_id = ?`,
    ).run(nextTitle, nextCategory, nextStatus, nextFav, nextNote, nextCustomCat, nextProgress, id, req.authUser!.id);
    res.json({ ok: true });
  });

  app.delete('/api/my/vault/:id', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM personal_vault_items WHERE id = ? AND user_id = ?`).run(
      sanitizeText(req.params.id, 100),
      req.authUser!.id,
    );
    res.json({ ok: true });
  });

  // Custom Named Lists in My Room
  app.get('/api/my/lists', requireAuth, (req: AuthedRequest, res) => {
    const lists = db
      .prepare(`SELECT * FROM custom_lists WHERE user_id = ? ORDER BY created_at DESC`)
      .all(req.authUser!.id) as Array<Record<string, unknown>>;

    const enriched = lists.map((list) => {
      const items = db
        .prepare(
          `SELECT m.id, m.title, m.poster_url, m.release_year, m.category
           FROM custom_list_items cli JOIN movies m ON m.id = cli.movie_id
           WHERE cli.list_id = ? ORDER BY cli.added_at DESC`,
        )
        .all(String(list.id));
      return {
        id: String(list.id),
        name: String(list.name),
        description: String(list.description || ''),
        coverPosterUrl: String(list.cover_poster_url || ''),
        isPublic: Boolean(list.is_public),
        createdAt: String(list.created_at),
        items,
      };
    });
    res.json({ lists: enriched });
  });

  app.post('/api/my/lists', requireAuth, (req: AuthedRequest, res) => {
    const name = sanitizeText(req.body?.name, 80);
    if (!name) {
      res.status(400).json({ error: 'Nama koleksi wajib diisi.' });
      return;
    }
    const id = `lst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(
      `INSERT INTO custom_lists (id, user_id, name, description, cover_poster_url, is_public)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      req.authUser!.id,
      name,
      sanitizeText(req.body?.description, 400),
      sanitizeText(req.body?.coverPosterUrl, 500),
      req.body?.isPublic ? 1 : 0,
    );
    res.status(201).json({ ok: true, id });
  });

  app.post('/api/my/lists/:listId/items', requireAuth, (req: AuthedRequest, res) => {
    const listId = sanitizeText(req.params.listId, 100);
    const movieId = sanitizeText(req.body?.movieId, 100);
    const list = db
      .prepare(`SELECT id FROM custom_lists WHERE id = ? AND user_id = ?`)
      .get(listId, req.authUser!.id);
    if (!list) {
      res.status(404).json({ error: 'Koleksi tidak ditemukan.' });
      return;
    }
    db.prepare(`INSERT OR IGNORE INTO custom_list_items (list_id, movie_id) VALUES (?, ?)`).run(listId, movieId);
    res.json({ ok: true });
  });

  app.delete('/api/my/lists/:listId', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM custom_lists WHERE id = ? AND user_id = ?`).run(
      sanitizeText(req.params.listId, 100),
      req.authUser!.id,
    );
    res.json({ ok: true });
  });

  // Reviews
  app.post('/api/movies/:id/reviews', requireAuth, (req: AuthedRequest, res) => {
    const movieId = sanitizeText(req.params.id, 100);
    const rating = Math.min(5, Math.max(1, Math.round(Number(req.body?.rating) || 5)));
    const comment = sanitizeText(req.body?.comment, 800);

    db.prepare(
      `INSERT INTO reviews (id, movie_id, user_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(movie_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment`,
    ).run(`rev_${Date.now()}`, movieId, req.authUser!.id, rating, comment);

    const stats = db
      .prepare(`SELECT AVG(rating) AS avg_r, COUNT(*) AS cnt FROM reviews WHERE movie_id = ?`)
      .get(movieId) as { avg_r: number; cnt: number };
    db.prepare(`UPDATE movies SET rating_avg = ?, rating_count = ? WHERE id = ?`).run(
      Number((stats.avg_r || 0).toFixed(1)),
      stats.cnt,
      movieId,
    );
    res.json({ ok: true });
  });

  // Profile, Account Center, Sessions & Extended Settings
  app.patch('/api/my/profile', requireAuth, (req: AuthedRequest, res) => {
    const displayName = sanitizeText(req.body?.displayName, 80) || req.authUser!.display_name;
    const bio = sanitizeText(req.body?.bio, 400);
    const avatarUrl = sanitizeText(req.body?.avatarUrl, 500);
    const isPublic = req.body?.isProfilePublic ? 1 : 0;

    db.prepare(
      `UPDATE users SET display_name = ?, bio = ?, avatar_url = ?, is_profile_public = ? WHERE id = ?`,
    ).run(displayName, bio, avatarUrl, isPublic, req.authUser!.id);
    res.json({ ok: true });
  });

  app.patch('/api/my/account', requireAuth, (req: AuthedRequest, res) => {
    const displayName = sanitizeText(req.body?.displayName, 80) || req.authUser!.display_name;
    const nextUsername = req.body?.username
      ? sanitizeText(req.body.username, 40).toLowerCase().replace(/[^a-z0-9_.-]/g, '')
      : req.authUser!.username;
    const nextEmail = req.body?.email
      ? sanitizeText(req.body.email, 120).toLowerCase()
      : req.authUser!.email;
    const avatarUrl =
      req.body?.avatarUrl !== undefined ? sanitizeText(req.body.avatarUrl, 500) : req.authUser!.avatar_url;
    const bio = req.body?.bio !== undefined ? sanitizeText(req.body.bio, 400) : req.authUser!.bio;
    const isPublic =
      typeof req.body?.isProfilePublic === 'boolean'
        ? req.body.isProfilePublic
          ? 1
          : 0
        : req.authUser!.is_profile_public;

    if (nextUsername.length < 3 || !nextEmail.includes('@')) {
      res.status(400).json({ error: 'Username minimal 3 karakter dan format email harus valid.' });
      return;
    }

    const conflict = db
      .prepare(`SELECT id FROM users WHERE (lower(username) = ? OR lower(email) = ?) AND id != ?`)
      .get(nextUsername, nextEmail, req.authUser!.id);
    if (conflict) {
      res.status(409).json({ error: 'Username atau email sudah digunakan akun lain.' });
      return;
    }

    const emailChanged = nextEmail !== req.authUser!.email.toLowerCase();
    db.prepare(
      `UPDATE users
       SET display_name = ?, username = ?, email = ?, avatar_url = ?, bio = ?, is_profile_public = ?,
           email_verified = CASE WHEN ? = 1 THEN 0 ELSE email_verified END
       WHERE id = ?`,
    ).run(displayName, nextUsername, nextEmail, avatarUrl, bio, isPublic, emailChanged ? 1 : 0, req.authUser!.id);

    if (emailChanged) {
      const verCode = String(Math.floor(100000 + Math.random() * 900000));
      db.prepare(`INSERT INTO email_verifications (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)`).run(
        `ver_${Date.now()}`,
        req.authUser!.id,
        verCode,
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      );
      db.prepare(`INSERT INTO notifications (id, user_id, type, title, message) VALUES (?, ?, 'security', ?, ?)`).run(
        `not_em_${Date.now()}`,
        req.authUser!.id,
        'Verifikasi Email Baru Diperlukan',
        `Kode verifikasi email baru (${nextEmail}): ${verCode}.`,
      );
    }

    writeAuditLog(req.authUser!.id, 'UPDATE_ACCOUNT', 'user', req.authUser!.id, `Updated profile/account`, getClientIp(req));
    res.json({ ok: true, emailChanged });
  });

  app.post('/api/my/change-password', requireAuth, (req: AuthedRequest, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Password baru minimal 8 karakter.' });
      return;
    }
    const row = db
      .prepare(`SELECT password_hash FROM users WHERE id = ?`)
      .get(req.authUser!.id) as { password_hash: string } | undefined;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Password saat ini tidak cocok.' });
      return;
    }
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(newPassword), req.authUser!.id);
    writeAuditLog(req.authUser!.id, 'CHANGE_PASSWORD', 'user', req.authUser!.id, 'User changed password', getClientIp(req));
    res.json({ ok: true, message: 'Password akun berhasil diperbarui.' });
  });

  app.delete('/api/my/google-link', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`UPDATE users SET google_sub = NULL WHERE id = ?`).run(req.authUser!.id);
    writeAuditLog(req.authUser!.id, 'UNLINK_GOOGLE', 'user', req.authUser!.id, 'Removed Google account link', getClientIp(req));
    res.json({ ok: true, message: 'Koneksi akun Google dari FLIXFIL berhasil dihapus.' });
  });

  app.delete('/api/my/account', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser!.role === 'admin') {
      res.status(403).json({ error: 'Akun Administrator utama tidak dapat dihapus melalui penghapusan mandiri.' });
      return;
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirmUsername = sanitizeText(req.body?.confirmUsername, 40).toLowerCase();
    const row = db
      .prepare(`SELECT password_hash, google_sub, username FROM users WHERE id = ?`)
      .get(req.authUser!.id) as { password_hash: string; google_sub: string | null; username: string } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Akun tidak ditemukan.' });
      return;
    }
    const passwordValid = password ? verifyPassword(password, row.password_hash) : false;
    const googleConfirm = Boolean(row.google_sub) && confirmUsername === row.username.toLowerCase();
    if (!passwordValid && !googleConfirm) {
      res.status(401).json({ error: 'Konfirmasi password atau username diperlukan untuk menghapus akun secara permanen.' });
      return;
    }

    db.prepare(`DELETE FROM users WHERE id = ?`).run(req.authUser!.id);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    writeAuditLog(null, 'DELETE_ACCOUNT', 'user', req.authUser!.id, `Deleted ${row.username}`, getClientIp(req));
    res.json({ ok: true, message: 'Akun FLIXFIL Anda telah dihapus secara permanen.' });
  });

  app.get('/api/my/sessions', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT id, ip, user_agent, created_at, expires_at
         FROM sessions WHERE user_id = ? ORDER BY created_at DESC`,
      )
      .all(req.authUser!.id) as Array<Record<string, unknown>>;

    res.json({
      sessions: rows.map((s) => ({
        id: String(s.id),
        ip: String(s.ip || ''),
        user_agent: String(s.user_agent || 'Browser Perangkat'),
        created_at: String(s.created_at),
        expires_at: String(s.expires_at),
        isCurrent: String(s.id) === req.sessionId,
      })),
    });
  });

  app.delete('/api/my/sessions/:id', requireAuth, (req: AuthedRequest, res) => {
    const sid = sanitizeText(req.params.id, 100);
    db.prepare(`DELETE FROM sessions WHERE id = ? AND user_id = ?`).run(sid, req.authUser!.id);
    if (sid === req.sessionId) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
    }
    res.json({ ok: true });
  });

  app.post('/api/my/sessions/logout-all', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(req.authUser!.id);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    writeAuditLog(req.authUser!.id, 'LOGOUT_ALL_DEVICES', 'user', req.authUser!.id, 'Terminated all active sessions', getClientIp(req));
    res.json({ ok: true, message: 'Semua sesi perangkat telah dikeluarkan.' });
  });

  app.get('/api/my/settings', requireAuth, (req: AuthedRequest, res) => {
    const settings = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(req.authUser!.id);
    res.json({ settings });
  });

  app.patch('/api/my/settings', requireAuth, (req: AuthedRequest, res) => {
    const current = (db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(req.authUser!.id) ||
      {}) as Record<string, unknown>;

    const boolCol = (key: string, def = 1): number => {
      const v = req.body?.[key];
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v === 0 || v === 1) return v;
      return current[key] !== undefined ? Number(current[key]) : def;
    };

    const lang = req.body?.language !== undefined ? (req.body.language === 'en' ? 'en' : 'id') : String(current.language || 'id');
    const uiSounds = boolCol('ui_sounds', 1);
    const defaultVol = Math.min(1, Math.max(0, Number(req.body?.default_volume ?? current.default_volume ?? 0.85)));
    const defaultSub = sanitizeText(req.body?.default_subtitle_lang ?? current.default_subtitle_lang ?? 'id', 16);
    const subSize = Math.min(32, Math.max(12, Number(req.body?.subtitle_font_size ?? current.subtitle_font_size ?? 18)));
    const subColor = sanitizeText(req.body?.subtitle_color ?? current.subtitle_color ?? '#FFFFFF', 20);
    const subPos = (req.body?.subtitle_position ?? current.subtitle_position) === 'top' ? 'top' : 'bottom';
    const defaultQual = sanitizeText(req.body?.default_quality ?? current.default_quality ?? 'auto', 24);
    const nNew = boolCol('notify_new_films', 1);
    const nSub = boolCol('notify_subscription', 1);
    const nSec = boolCol('notify_security', 1);
    const nTrend = boolCol('notify_trending', 1);
    const nEp = boolCol('notify_episodes', 1);
    const nAcc = boolCol('notify_account', 1);
    const nEmail = boolCol('notify_email', 0);

    const themeMode = (req.body?.theme_mode ?? current.theme_mode) === 'light' ? 'light' : 'dark';
    const accentIntensity = Math.min(150, Math.max(50, Math.round(Number(req.body?.accent_intensity ?? current.accent_intensity ?? 100))));
    const rawScale = String(req.body?.text_scale ?? current.text_scale ?? 'normal');
    const textScale = ['small', 'normal', 'large'].includes(rawScale) ? rawScale : 'normal';
    const animationsEnabled = boolCol('animations_enabled', 1);
    const transitionsEnabled = boolCol('transitions_enabled', 1);
    const dashboardDensity = (req.body?.dashboard_density ?? current.dashboard_density) === 'compact' ? 'compact' : 'comfortable';
    const autoQuality = boolCol('auto_quality', 1);
    const autoSubtitle = boolCol('auto_subtitle', 1);
    const defaultSpeed = Math.min(2, Math.max(0.5, Number(req.body?.default_speed ?? current.default_speed ?? 1)));
    const autoPlay = boolCol('auto_play', 1);
    const autoResume = boolCol('auto_resume', 1);
    const syncProgress = boolCol('sync_progress', 1);
    const hideWatchHistory = boolCol('hide_watch_history', 0);

    db.prepare(
      `INSERT INTO user_settings (
         user_id, language, ui_sounds, default_volume, default_subtitle_lang,
         subtitle_font_size, subtitle_color, subtitle_position, default_quality,
         notify_new_films, notify_subscription, notify_security,
         theme_mode, accent_intensity, text_scale, animations_enabled, transitions_enabled, dashboard_density,
         auto_quality, auto_subtitle, default_speed, auto_play, auto_resume, sync_progress,
         notify_trending, notify_episodes, notify_account, notify_email, hide_watch_history
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         language = excluded.language, ui_sounds = excluded.ui_sounds, default_volume = excluded.default_volume,
         default_subtitle_lang = excluded.default_subtitle_lang, subtitle_font_size = excluded.subtitle_font_size,
         subtitle_color = excluded.subtitle_color, subtitle_position = excluded.subtitle_position,
         default_quality = excluded.default_quality, notify_new_films = excluded.notify_new_films,
         notify_subscription = excluded.notify_subscription, notify_security = excluded.notify_security,
         theme_mode = excluded.theme_mode, accent_intensity = excluded.accent_intensity, text_scale = excluded.text_scale,
         animations_enabled = excluded.animations_enabled, transitions_enabled = excluded.transitions_enabled,
         dashboard_density = excluded.dashboard_density, auto_quality = excluded.auto_quality,
         auto_subtitle = excluded.auto_subtitle, default_speed = excluded.default_speed,
         auto_play = excluded.auto_play, auto_resume = excluded.auto_resume, sync_progress = excluded.sync_progress,
         notify_trending = excluded.notify_trending, notify_episodes = excluded.notify_episodes,
         notify_account = excluded.notify_account, notify_email = excluded.notify_email,
         hide_watch_history = excluded.hide_watch_history`,
    ).run(
      req.authUser!.id, lang, uiSounds, defaultVol, defaultSub, subSize, subColor, subPos, defaultQual,
      nNew, nSub, nSec, themeMode, accentIntensity, textScale, animationsEnabled, transitionsEnabled,
      dashboardDensity, autoQuality, autoSubtitle, defaultSpeed, autoPlay, autoResume, syncProgress,
      nTrend, nEp, nAcc, nEmail, hideWatchHistory,
    );
    const updated = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(req.authUser!.id);
    res.json({ ok: true, settings: updated });
  });

  app.post('/api/my/settings/reset', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(req.authUser!.id);
    db.prepare(`INSERT INTO user_settings (user_id, language) VALUES (?, 'id')`).run(req.authUser!.id);
    const fresh = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(req.authUser!.id);
    res.json({ ok: true, settings: fresh });
  });

  app.get('/api/my/notifications', requireAuth, (req: AuthedRequest, res) => {
    const items = db
      .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`)
      .all(req.authUser!.id);
    res.json({ notifications: items });
  });

  app.post('/api/my/notifications/read', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.authUser!.id);
    res.json({ ok: true });
  });

  // ==================== SUBSCRIPTIONS & PAYMENTS (MAX Rp20.000) ====================
  app.get('/api/plans', (_req, res) => {
    const plans = db
      .prepare(`SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price_idr ASC`)
      .all() as Array<Record<string, unknown>>;
    res.json({
      plans: plans.map((p) => ({
        ...p,
        features: safeJsonParse<string[]>(p.features, []),
      })),
    });
  });

  app.get('/api/my/payments', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT p.*, sp.name AS plan_name, sp.duration_days
         FROM payments p JOIN subscription_plans sp ON sp.id = p.plan_id
         WHERE p.user_id = ? ORDER BY p.created_at DESC`,
      )
      .all(req.authUser!.id);
    res.json({ payments: rows });
  });

  app.post('/api/payments/checkout', requireAuth, (req: AuthedRequest, res) => {
    const planId = sanitizeText(req.body?.planId, 50);
    const paymentMethod = ['gopay', 'dana_qr', 'qris', 'bri', 'bni', 'bca', 'mandiri'].includes(
      req.body?.paymentMethod,
    )
      ? String(req.body.paymentMethod)
      : 'dana_qr';
    const provider = ['midtrans', 'xendit', 'dana_qr', 'sandbox_gateway'].includes(req.body?.provider)
      ? String(req.body.provider)
      : paymentMethod === 'dana_qr'
        ? 'dana_qr'
        : 'midtrans';

    const plan = db
      .prepare(`SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1`)
      .get(planId) as { id: string; name: string; price_idr: number; duration_days: number } | undefined;

    if (!plan) {
      res.status(404).json({ error: 'Paket langganan tidak ditemukan.' });
      return;
    }
    if (plan.price_idr > 20000) {
      res.status(400).json({ error: 'Harga paket melanggar batas maksimum Rp20.000.' });
      return;
    }

    // Prevent duplicate identical pending transactions created within last 30 minutes
    const recentCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const existingPending = db
      .prepare(
        `SELECT * FROM payments
         WHERE user_id = ? AND plan_id = ? AND payment_method = ? AND status = 'pending' AND datetime(created_at) >= datetime(?)
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(req.authUser!.id, plan.id, paymentMethod, recentCutoff) as Record<string, unknown> | undefined;

    if (existingPending) {
      const danaQr = findDanaQrImage();
      res.json({
        paymentId: String(existingPending.id),
        externalRef: String(existingPending.external_ref),
        amountIdr: Number(existingPending.amount_idr),
        planName: plan.name,
        provider: String(existingPending.provider),
        paymentMethod: String(existingPending.payment_method),
        gatewayToken: paymentMethod === 'dana_qr' ? '' : String(existingPending.gateway_signature),
        danaQrConfigured: Boolean(danaQr),
        danaQrUrl: danaQr ? '/api/payments/dana-qr-image' : '',
        requiresAdminVerification: paymentMethod === 'dana_qr',
        reusedPending: true,
        liveGatewayConfigured:
          (provider === 'midtrans' && Boolean(process.env.MIDTRANS_SERVER_KEY)) ||
          (provider === 'xendit' && Boolean(process.env.XENDIT_SECRET_KEY)),
      });
      return;
    }

    const payId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const externalRef = `FLX-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const gatewaySignature = hashToken(`${payId}:${externalRef}:${plan.price_idr}:${req.authUser!.id}`);

    db.prepare(
      `INSERT INTO payments (id, user_id, plan_id, amount_idr, provider, payment_method, external_ref, gateway_signature, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    ).run(payId, req.authUser!.id, plan.id, plan.price_idr, provider, paymentMethod, externalRef, gatewaySignature);

    const danaQr = findDanaQrImage();
    res.status(201).json({
      paymentId: payId,
      externalRef,
      amountIdr: plan.price_idr,
      planName: plan.name,
      provider,
      paymentMethod,
      gatewayToken: paymentMethod === 'dana_qr' ? '' : gatewaySignature,
      danaQrConfigured: Boolean(danaQr),
      danaQrUrl: danaQr ? '/api/payments/dana-qr-image' : '',
      requiresAdminVerification: paymentMethod === 'dana_qr',
      liveGatewayConfigured:
        (provider === 'midtrans' && Boolean(process.env.MIDTRANS_SERVER_KEY)) ||
        (provider === 'xendit' && Boolean(process.env.XENDIT_SECRET_KEY)),
    });
  });

  app.post('/api/payments/webhook/:provider', (req: Request, res: Response) => {
    const externalRef = sanitizeText(req.body?.externalRef || req.body?.order_id, 100);
    const gatewayToken = sanitizeText(req.body?.gatewayToken || req.body?.signature_key, 200);
    const status = sanitizeText(req.body?.status || 'paid', 30);

    const payment = db
      .prepare(`SELECT * FROM payments WHERE external_ref = ?`)
      .get(externalRef) as Record<string, unknown> | undefined;
    if (!payment) {
      res.status(404).json({ error: 'Transaksi pembayaran tidak ditemukan.' });
      return;
    }

    const expectedSig = hashToken(
      `${String(payment.id)}:${String(payment.external_ref)}:${Number(payment.amount_idr)}:${String(payment.user_id)}`,
    );
    if (!gatewayToken || gatewayToken !== expectedSig) {
      writeAuditLog(
        String(payment.user_id),
        'PAYMENT_SIGNATURE_REJECTED',
        'payment',
        String(payment.id),
        'Invalid webhook signature',
        getClientIp(req),
      );
      res.status(403).json({ error: 'Tanda tangan verifikasi payment gateway tidak valid.' });
      return;
    }

    if (status === 'paid' && payment.status !== 'paid') {
      const plan = db
        .prepare(`SELECT duration_days, name FROM subscription_plans WHERE id = ?`)
        .get(String(payment.plan_id)) as { duration_days: number; name: string };

      const now = new Date();
      const expiresAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`UPDATE payments SET status = 'paid', paid_at = datetime('now') WHERE id = ?`).run(
        String(payment.id),
      );
      db.prepare(
        `UPDATE users SET subscription_tier = 'premium', subscription_started_at = ?, subscription_expires_at = ? WHERE id = ?`,
      ).run(now.toISOString(), expiresAt, String(payment.user_id));

      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, message)
         VALUES (?, ?, 'payment', ?, ?)`,
      ).run(
        `not_pay_${Date.now()}`,
        String(payment.user_id),
        'Pembayaran Berhasil — Premium Aktif',
        `Paket ${plan.name} telah terverifikasi dan aktif hingga ${new Date(expiresAt).toLocaleDateString('id-ID')}.`,
      );
      writeAuditLog(
        String(payment.user_id),
        'PAYMENT_VERIFIED',
        'payment',
        String(payment.id),
        `Activated ${plan.name}`,
        getClientIp(req),
      );
    }

    res.json({ ok: true, status: 'paid' });
  });

  // ==================== ADMIN PANEL (STRICTLY BACKEND-ENFORCED) ====================
  app.get('/api/admin/stats', requireAdminElevated, (_req, res) => {
    const totalUsers = (db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }).c;
    const totalMovies = (db.prepare(`SELECT COUNT(*) AS c FROM movies`).get() as { c: number }).c;
    const totalViews = (db.prepare(`SELECT COALESCE(SUM(view_count), 0) AS s FROM movies`).get() as { s: number }).s;
    const totalPremium = (
      db.prepare(`SELECT COUNT(*) AS c FROM users WHERE subscription_tier = 'premium'`).get() as { c: number }
    ).c;
    const totalRevenue = (
      db.prepare(`SELECT COALESCE(SUM(amount_idr), 0) AS s FROM payments WHERE status = 'paid'`).get() as { s: number }
    ).s;
    const topMovies = db
      .prepare(`SELECT id, title, category, view_count, favorite_count, access_tier FROM movies ORDER BY view_count DESC LIMIT 8`)
      .all();
    const recentAudits = db.prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 30`).all();
    const recentErrors = db.prepare(`SELECT * FROM server_error_logs ORDER BY created_at DESC LIMIT 20`).all();
    const backups = fs.existsSync(PATHS.BACKUP_DIR)
      ? fs
          .readdirSync(PATHS.BACKUP_DIR)
          .filter((f) => f.endsWith('.db'))
          .sort()
          .reverse()
          .slice(0, 5)
      : [];

    res.json({
      stats: { totalUsers, totalMovies, totalViews, totalPremium, totalRevenue },
      topMovies,
      recentAudits,
      recentErrors,
      backups,
    });
  });

  app.post('/api/admin/verify-content-match', requireAdminElevated, async (req: AuthedRequest, res) => {
    const title = sanitizeText(req.body?.title, 180);
    const releaseYear = Number(req.body?.releaseYear) || 0;
    const durationSeconds = Number(req.body?.durationSeconds) || 0;
    const sourceUrl = sanitizeText(req.body?.sourceUrl, 800);
    const sourceType = sanitizeText(req.body?.sourceType, 30);

    const warnings: string[] = [];
    let detectedTitle = title;
    let detectedDuration = durationSeconds;
    let detectedResolution = '';
    let detectedAudio = '';

    try {
      if (sourceUrl.startsWith('/streams/')) {
        const relPath = sourceUrl.replace(/^\/streams\//, '');
        const localFile = path.join(PATHS.STREAM_DIR, relPath);
        if (fs.existsSync(localFile)) {
          const probe = await probeVideoMetadata(localFile);
          if (probe) {
            if (probe.durationSeconds > 0) detectedDuration = probe.durationSeconds;
            if (probe.height > 0) detectedResolution = `${probe.width}x${probe.height}`;
            if (probe.audioChannels > 0) {
              detectedAudio = `${probe.audioCodec.toUpperCase()} ${probe.audioChannels}ch`;
            }
          }
        }
      } else if (sourceUrl.startsWith('http')) {
        const inspected = await inspectExternalVideoUrl(sourceUrl);
        detectedTitle = inspected.title || title;
        if (title && detectedTitle && !detectedTitle.toLowerCase().includes(title.toLowerCase().slice(0, 6)) &&
            !title.toLowerCase().includes(detectedTitle.toLowerCase().slice(0, 6))) {
          warnings.push(
            `Judul video sumber ("${detectedTitle}") berbeda dengan judul metadata ("${title}"). Pastikan video dan poster berasal dari film yang sama.`,
          );
        }
      }

      if (durationSeconds > 0 && detectedDuration > 0) {
        const diffRatio = Math.abs(durationSeconds - detectedDuration) / Math.max(1, detectedDuration);
        if (diffRatio > 0.35 && Math.abs(durationSeconds - detectedDuration) > 120) {
          warnings.push(
            `Durasi metadata (${durationSeconds} dtk) berbeda signifikan dengan durasi video terdeteksi (${detectedDuration} dtk).`,
          );
        }
      }

      if (!sourceUrl && sourceType !== 'external_only') {
        warnings.push('Sumber video belum terisi.');
      }

      if (releaseYear && (releaseYear < 1895 || releaseYear > new Date().getFullYear() + 2)) {
        warnings.push(`Tahun rilis ${releaseYear} di luar rentang sinema wajar.`);
      }

      res.json({
        matched: warnings.length === 0,
        warnings,
        detected: {
          title: detectedTitle,
          durationSeconds: detectedDuration,
          resolution: detectedResolution || 'Sesuai sumber',
          audio: detectedAudio || 'Stereo',
        },
      });
    } catch (err) {
      writeErrorLog('/api/admin/verify-content-match', String(err));
      res.status(400).json({ error: 'Gagal memverifikasi kesesuaian video.' });
    }
  });

  app.post('/api/admin/hero-settings', requireAdminElevated, (req: AuthedRequest, res) => {
    const autoFeature = req.body?.heroAutoFeature ? '1' : '0';
    db.prepare(
      `INSERT INTO app_config (key, value, updated_at) VALUES ('hero_auto_feature', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(autoFeature, new Date().toISOString());
    writeAuditLog(req.authUser!.id, 'ADMIN_HERO_SETTINGS', 'config', 'hero_auto_feature', autoFeature, getClientIp(req));
    res.json({ ok: true, heroAutoFeature: autoFeature === '1' });
  });

  app.post('/api/admin/change-master-password', requireAdminElevated, (req: AuthedRequest, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (newPassword.length < 12) {
      res.status(400).json({ error: 'Password administrator baru minimal 12 karakter.' });
      return;
    }
    const masterRow = db
      .prepare(`SELECT value FROM app_config WHERE key = 'admin_master_hash'`)
      .get() as { value: string } | undefined;
    if (!masterRow || !verifyPassword(currentPassword, masterRow.value)) {
      res.status(401).json({ error: 'Password administrator saat ini salah.' });
      return;
    }
    db.prepare(`UPDATE app_config SET value = ?, updated_at = ? WHERE key = 'admin_master_hash'`).run(
      hashPassword(newPassword),
      new Date().toISOString(),
    );
    writeAuditLog(req.authUser!.id, 'ADMIN_MASTER_PASSWORD_CHANGED', 'security', 'admin_master_hash', 'Password rotated', getClientIp(req));
    res.json({ ok: true, message: 'Password khusus administrator berhasil diperbarui.' });
  });

  app.get('/api/admin/movies', requireAdminElevated, (_req, res) => {
    const rows = db.prepare(`SELECT * FROM movies ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>;
    res.json({ movies: rows.map((r) => formatMovieRow(r)) });
  });

  app.post('/api/admin/movies/:id/check-source', requireAdminElevated, async (req: AuthedRequest, res) => {
    const id = sanitizeText(req.params.id, 100);
    const row = db.prepare(`SELECT * FROM movies WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: 'Film tidak ditemukan.' });
      return;
    }
    const status = await verifyMovieSourceAvailability(row);
    const checkedAt = new Date().toISOString();
    db.prepare(`UPDATE movies SET publish_status = ?, last_checked_at = ? WHERE id = ?`).run(status, checkedAt, id);
    writeAuditLog(req.authUser!.id, 'ADMIN_CHECK_SOURCE', 'movie', id, `Status=${status}`, getClientIp(req));
    res.json({ ok: true, publishStatus: status, lastCheckedAt: checkedAt });
  });

  app.put('/api/admin/categories', requireAdminElevated, (req: AuthedRequest, res) => {
    const raw = Array.isArray(req.body?.categories) ? req.body.categories : [];
    const cleaned = Array.from(
      new Set(raw.map((c: unknown) => sanitizeText(c, 50)).filter((c: string) => c.length >= 2)),
    );
    if (cleaned.length === 0) {
      res.status(400).json({ error: 'Minimal harus ada satu kategori aktif.' });
      return;
    }
    setAppConfig('categories_json', JSON.stringify(cleaned));
    writeAuditLog(req.authUser!.id, 'ADMIN_UPDATE_CATEGORIES', 'config', 'categories', `${cleaned.length} categories`, getClientIp(req));
    res.json({ ok: true, categories: cleaned });
  });

  app.patch('/api/admin/website-settings', requireAdminElevated, (req: AuthedRequest, res) => {
    const confirmAdminPassword = typeof req.body?.confirmAdminPassword === 'string' ? req.body.confirmAdminPassword : '';
    const masterRow = db
      .prepare(`SELECT value FROM app_config WHERE key = 'admin_master_hash'`)
      .get() as { value: string } | undefined;
    if (!masterRow || !verifyPassword(confirmAdminPassword, masterRow.value)) {
      res.status(401).json({ error: 'Konfirmasi password khusus administrator diperlukan untuk mengubah pengaturan website.' });
      return;
    }

    if (req.body?.tagline !== undefined) {
      setAppConfig('site_tagline', sanitizeText(req.body.tagline, 120) || 'Your Story. Your Screen.');
    }
    if (typeof req.body?.heroAutoFeature === 'boolean') {
      setAppConfig('hero_auto_feature', req.body.heroAutoFeature ? '1' : '0');
    }
    if (typeof req.body?.maintenanceMode === 'boolean') {
      setAppConfig('maintenance_mode', req.body.maintenanceMode ? '1' : '0');
    }
    if (typeof req.body?.trendingEnabled === 'boolean') {
      setAppConfig('trending_enabled', req.body.trendingEnabled ? '1' : '0');
    }
    if (req.body?.uploadMaxHours !== undefined) {
      const hrs = Math.min(10, Math.max(1, Math.round(Number(req.body.uploadMaxHours) || 10)));
      setAppConfig('upload_max_hours', String(hrs));
    }
    if (req.body?.timezone !== undefined) {
      setAppConfig('timezone', sanitizeText(req.body.timezone, 50) || 'Asia/Jakarta');
    }
    if (req.body?.allowedStreamDomains !== undefined) {
      setAppConfig('allowed_stream_domains', sanitizeText(req.body.allowedStreamDomains, 500));
    }

    writeAuditLog(
      req.authUser!.id,
      'ADMIN_WEBSITE_SETTINGS',
      'config',
      'website',
      JSON.stringify({
        maintenanceMode: getAppConfig('maintenance_mode', '0') === '1',
        heroAutoFeature: getAppConfig('hero_auto_feature', '1') !== '0',
        trendingEnabled: getAppConfig('trending_enabled', '1') !== '0',
        timezone: getAppConfig('timezone', 'Asia/Jakarta'),
      }),
      getClientIp(req),
    );
    res.json({ ok: true });
  });

  app.post('/api/admin/dana-qr', requireAdminElevated, (req: AuthedRequest, res) => {
    const dataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : '';
    const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      res.status(400).json({ error: 'Format gambar QR Code harus PNG, JPG, atau WebP valid.' });
      return;
    }
    const mime = match[1].toLowerCase();
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length < 200 || buf.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Ukuran file gambar QR tidak valid (maks. 5MB).' });
      return;
    }
    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    const scan = scanUploadedBuffer(`dana_qr${ext}`, buf, 'image');
    if (!scan.safe) {
      res.status(400).json({ error: scan.reason || 'File gambar ditolak oleh pemindai keamanan.' });
      return;
    }

    for (const oldExt of ['.png', '.jpg', '.jpeg', '.webp']) {
      const p = path.join(PATHS.DATA_DIR, `dana_qr_image${oldExt}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    fs.writeFileSync(path.join(PATHS.DATA_DIR, `dana_qr_image${ext}`), buf);
    writeAuditLog(req.authUser!.id, 'ADMIN_UPLOAD_DANA_QR', 'payment', 'dana_qr', `Uploaded ${mime} (${buf.length} bytes)`, getClientIp(req));
    res.json({ ok: true, danaQrUrl: '/api/payments/dana-qr-image' });
  });

  app.get('/api/admin/payments', requireAdminElevated, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT p.id, p.user_id, p.plan_id, p.amount_idr, p.provider, p.payment_method, p.external_ref, p.status, p.verified_by_admin, p.paid_at, p.created_at,
                u.username, u.display_name, u.email, sp.name AS plan_name, sp.duration_days
         FROM payments p
         JOIN users u ON u.id = p.user_id
         JOIN subscription_plans sp ON sp.id = p.plan_id
         ORDER BY p.created_at DESC LIMIT 60`,
      )
      .all();
    res.json({ payments: rows });
  });

  app.post('/api/admin/payments/:id/verify', requireAdminElevated, (req: AuthedRequest, res) => {
    const payId = sanitizeText(req.params.id, 100);
    const action = req.body?.action === 'reject' ? 'reject' : 'approve';
    const payment = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(payId) as Record<string, unknown> | undefined;
    if (!payment) {
      res.status(404).json({ error: 'Transaksi pembayaran tidak ditemukan.' });
      return;
    }
    if (payment.status !== 'pending') {
      res.status(400).json({ error: `Transaksi ini sudah berstatus ${String(payment.status)}.` });
      return;
    }

    const plan = db
      .prepare(`SELECT duration_days, name FROM subscription_plans WHERE id = ?`)
      .get(String(payment.plan_id)) as { duration_days: number; name: string };

    if (action === 'reject') {
      db.prepare(`UPDATE payments SET status = 'failed', verified_by_admin = ? WHERE id = ?`).run(
        req.authUser!.username,
        payId,
      );
      db.prepare(`INSERT INTO notifications (id, user_id, type, title, message) VALUES (?, ?, 'payment', ?, ?)`).run(
        `not_pay_${Date.now()}`,
        String(payment.user_id),
        'Pembayaran Ditolak',
        `Pembayaran ${String(payment.external_ref)} (${plan.name}) tidak dapat diverifikasi. Silakan hubungi admin atau ulangi transaksi.`,
      );
      writeAuditLog(req.authUser!.id, 'ADMIN_PAYMENT_REJECTED', 'payment', payId, String(payment.external_ref), getClientIp(req));
      res.json({ ok: true, status: 'failed' });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE payments SET status = 'paid', paid_at = datetime('now'), verified_by_admin = ? WHERE id = ?`).run(
      req.authUser!.username,
      payId,
    );
    db.prepare(
      `UPDATE users SET subscription_tier = 'premium', subscription_started_at = ?, subscription_expires_at = ? WHERE id = ?`,
    ).run(now.toISOString(), expiresAt, String(payment.user_id));

    db.prepare(`INSERT INTO notifications (id, user_id, type, title, message) VALUES (?, ?, 'payment', ?, ?)`).run(
      `not_pay_${Date.now()}`,
      String(payment.user_id),
      'Pembayaran Terverifikasi — Premium Aktif',
      `Pembayaran ${String(payment.external_ref)} untuk ${plan.name} telah diverifikasi. Keanggotaan Premium aktif hingga ${new Date(expiresAt).toLocaleDateString('id-ID')}.`,
    );
    writeAuditLog(req.authUser!.id, 'ADMIN_PAYMENT_VERIFIED', 'payment', payId, `${String(payment.external_ref)} approved`, getClientIp(req));
    res.json({ ok: true, status: 'paid' });
  });

  app.post('/api/admin/movies', requireAdminElevated, (req: AuthedRequest, res) => {
    if (!req.body?.securityConfirmed) {
      res.status(400).json({ error: 'Konfirmasi keamanan wajib dicentang sebelum menyimpan film publik.' });
      return;
    }
    const confirmAdminPassword = typeof req.body?.confirmAdminPassword === 'string' ? req.body.confirmAdminPassword : '';
    const masterRow = db
      .prepare(`SELECT value FROM app_config WHERE key = 'admin_master_hash'`)
      .get() as { value: string } | undefined;
    if (!masterRow || !verifyPassword(confirmAdminPassword, masterRow.value)) {
      res.status(401).json({ error: 'Konfirmasi password administrator diperlukan sebelum memublikasikan film.' });
      return;
    }

    const title = sanitizeText(req.body?.title, 180);
    if (!title) {
      res.status(400).json({ error: 'Judul film wajib diisi.' });
      return;
    }

    const durationSeconds = Math.min(36000, Math.max(0, Math.round(Number(req.body?.durationSeconds) || 5400)));
    const id = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const slugBase = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slug = `${slugBase || 'film'}-${Date.now().toString(36)}`;
    const genres = Array.isArray(req.body?.genres)
      ? req.body.genres.map((g: unknown) => sanitizeText(g, 30)).filter(Boolean)
      : ['Drama'];
    const cast = Array.isArray(req.body?.cast)
      ? req.body.cast.map((c: unknown) => sanitizeText(c, 60)).filter(Boolean)
      : [];
    const qualities = Array.isArray(req.body?.availableQualities) ? req.body.availableQualities : ['Auto'];
    const nowUtc = new Date().toISOString();
    const publishStatus = ['pending_check', 'processing', 'ready', 'failed', 'unavailable'].includes(req.body?.publishStatus)
      ? String(req.body.publishStatus)
      : 'ready';

    db.prepare(
      `INSERT INTO movies (
        id, title, alt_titles, slug, type, category, genres, country, release_year, original_release_date,
        duration_seconds, age_rating, synopsis, director, cast_members,
        poster_url, backdrop_url, source_type, source_url, embed_url, premium_stream_url,
        playback_supported, available_qualities, access_tier, free_max_quality,
        publish_status, last_checked_at,
        is_featured, is_pinned_hero, is_admin_pick, published_at, created_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      title,
      sanitizeText(req.body?.altTitles, 180),
      slug,
      sanitizeText(req.body?.type || 'film', 30),
      sanitizeText(req.body?.category || 'Film Indonesia', 60),
      JSON.stringify(genres),
      sanitizeText(req.body?.country || 'Indonesia', 60),
      Number(req.body?.releaseYear) || new Date().getFullYear(),
      sanitizeText(req.body?.originalReleaseDate, 30),
      durationSeconds,
      sanitizeText(req.body?.ageRating || '13+', 10),
      sanitizeText(req.body?.synopsis, 2000),
      sanitizeText(req.body?.director, 120),
      JSON.stringify(cast),
      sanitizeText(req.body?.posterUrl, 600),
      sanitizeText(req.body?.backdropUrl || req.body?.posterUrl, 600),
      sanitizeText(req.body?.sourceType || 'hls', 30),
      sanitizeText(req.body?.sourceUrl, 800),
      sanitizeText(req.body?.embedUrl, 800),
      sanitizeText(req.body?.premiumStreamUrl, 800),
      req.body?.playbackSupported === false ? 0 : 1,
      JSON.stringify(qualities),
      req.body?.accessTier === 'premium' ? 'premium' : 'free',
      req.body?.freeMaxQuality === '480p' ? '480p' : '1080p',
      publishStatus,
      nowUtc,
      req.body?.isFeatured ? 1 : 0,
      req.body?.isPinnedHero ? 1 : 0,
      req.body?.isAdminPick ? 1 : 0,
      nowUtc,
      nowUtc,
      req.authUser!.id,
    );

    writeAuditLog(req.authUser!.id, 'ADMIN_ADD_MOVIE', 'movie', id, `Added "${title}" (${publishStatus})`, getClientIp(req));
    res.status(201).json({ ok: true, id });
  });

  app.patch('/api/admin/movies/:id', requireAdminElevated, (req: AuthedRequest, res) => {
    const id = sanitizeText(req.params.id, 100);
    const existing = db.prepare(`SELECT * FROM movies WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Film tidak ditemukan.' });
      return;
    }

    const title = req.body?.title !== undefined ? sanitizeText(req.body.title, 180) : String(existing.title);
    const accessTier =
      req.body?.accessTier === 'premium' || req.body?.accessTier === 'free'
        ? req.body.accessTier
        : String(existing.access_tier);
    const freeMaxQuality =
      req.body?.freeMaxQuality === '480p' || req.body?.freeMaxQuality === '720p' || req.body?.freeMaxQuality === '1080p'
        ? req.body.freeMaxQuality
        : String(existing.free_max_quality);
    const publishStatus =
      req.body?.publishStatus && ['pending_check', 'processing', 'ready', 'failed', 'unavailable'].includes(req.body.publishStatus)
        ? String(req.body.publishStatus)
        : String(existing.publish_status || 'ready');
    const category = req.body?.category !== undefined ? sanitizeText(req.body.category, 60) : String(existing.category);
    const synopsis = req.body?.synopsis !== undefined ? sanitizeText(req.body.synopsis, 2000) : String(existing.synopsis);
    const posterUrl = req.body?.posterUrl !== undefined ? sanitizeText(req.body.posterUrl, 600) : String(existing.poster_url);
    const backdropUrl = req.body?.backdropUrl !== undefined ? sanitizeText(req.body.backdropUrl, 600) : String(existing.backdrop_url);
    const isFeatured =
      typeof req.body?.isFeatured === 'boolean' ? (req.body.isFeatured ? 1 : 0) : Number(existing.is_featured);
    const isPinnedHero =
      typeof req.body?.isPinnedHero === 'boolean' ? (req.body.isPinnedHero ? 1 : 0) : Number(existing.is_pinned_hero || 0);
    const isAdminPick =
      typeof req.body?.isAdminPick === 'boolean' ? (req.body.isAdminPick ? 1 : 0) : Number(existing.is_admin_pick);

    db.prepare(
      `UPDATE movies SET title = ?, access_tier = ?, free_max_quality = ?, publish_status = ?, category = ?, synopsis = ?, poster_url = ?, backdrop_url = ?, is_featured = ?, is_pinned_hero = ?, is_admin_pick = ? WHERE id = ?`,
    ).run(title, accessTier, freeMaxQuality, publishStatus, category, synopsis, posterUrl, backdropUrl, isFeatured, isPinnedHero, isAdminPick, id);

    writeAuditLog(req.authUser!.id, 'ADMIN_EDIT_MOVIE', 'movie', id, `Updated "${title}" (${publishStatus})`, getClientIp(req));
    res.json({ ok: true });
  });

  app.delete('/api/admin/movies/:id', requireAdminElevated, (req: AuthedRequest, res) => {
    if (req.body?.securityConfirmed !== true) {
      res.status(400).json({ error: 'Konfirmasi penghapusan keamanan diperlukan.' });
      return;
    }
    const confirmAdminPassword = typeof req.body?.confirmAdminPassword === 'string' ? req.body.confirmAdminPassword : '';
    const masterRow = db
      .prepare(`SELECT value FROM app_config WHERE key = 'admin_master_hash'`)
      .get() as { value: string } | undefined;
    if (!masterRow || !verifyPassword(confirmAdminPassword, masterRow.value)) {
      res.status(401).json({ error: 'Konfirmasi password administrator salah.' });
      return;
    }
    const id = sanitizeText(req.params.id, 100);
    db.prepare(`DELETE FROM movies WHERE id = ?`).run(id);
    writeAuditLog(req.authUser!.id, 'ADMIN_DELETE_MOVIE', 'movie', id, 'Deleted movie', getClientIp(req));
    res.json({ ok: true });
  });

  app.post('/api/admin/movies/:id/subtitles', requireAdminElevated, (req: AuthedRequest, res) => {
    const movieId = sanitizeText(req.params.id, 100);
    const filename = sanitizeText(req.body?.filename || 'subtitle.vtt', 120);
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const langCode = sanitizeText(req.body?.languageCode || 'id', 16);
    const langLabel = sanitizeText(req.body?.languageLabel || 'Bahasa Indonesia', 60);

    const scan = scanUploadedBuffer(filename, Buffer.from(content, 'utf8'), 'subtitle');
    if (!scan.safe) {
      writeAuditLog(req.authUser!.id, 'SUBTITLE_SCAN_BLOCKED', 'movie', movieId, scan.reason || '', getClientIp(req));
      res.status(400).json({ error: scan.reason });
      return;
    }

    const format = filename.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt';
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(
      `INSERT INTO subtitles (id, movie_id, language_code, language_label, format, content, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, movieId, langCode, langLabel, format, content, req.body?.isDefault ? 1 : 0);

    writeAuditLog(req.authUser!.id, 'ADMIN_ADD_SUBTITLE', 'subtitle', id, `${langLabel} (${format})`, getClientIp(req));
    res.status(201).json({ ok: true, id });
  });

  app.get('/api/admin/users', requireAdminElevated, (_req, res) => {
    const users = db
      .prepare(
        `SELECT id, username, email, display_name, role, email_verified, totp_enabled, subscription_tier, subscription_expires_at, created_at
         FROM users ORDER BY created_at DESC`,
      )
      .all();
    res.json({ users });
  });

  app.patch('/api/admin/users/:id', requireAdminElevated, (req: AuthedRequest, res) => {
    const targetId = sanitizeText(req.params.id, 100);
    const nextTier = req.body?.subscriptionTier === 'premium' ? 'premium' : 'free';
    const expiresAt = nextTier === 'premium' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
    db.prepare(`UPDATE users SET subscription_tier = ?, subscription_expires_at = ? WHERE id = ?`).run(
      nextTier,
      expiresAt,
      targetId,
    );
    writeAuditLog(req.authUser!.id, 'ADMIN_UPDATE_USER_TIER', 'user', targetId, `Set tier ${nextTier}`, getClientIp(req));
    res.json({ ok: true });
  });

  app.patch('/api/admin/plans/:id', requireAdminElevated, (req: AuthedRequest, res) => {
    const planId = sanitizeText(req.params.id, 50);
    const priceIdr = Math.round(Number(req.body?.priceIdr) || 0);
    if (priceIdr < 1000 || priceIdr > 20000) {
      res.status(400).json({
        error: 'Harga paket berlangganan harus antara Rp1.000 hingga batas maksimum Rp20.000.',
      });
      return;
    }
    const name = sanitizeText(req.body?.name, 80);
    db.prepare(`UPDATE subscription_plans SET price_idr = ?, name = COALESCE(NULLIF(?, ''), name) WHERE id = ?`).run(
      priceIdr,
      name,
      planId,
    );
    writeAuditLog(req.authUser!.id, 'ADMIN_UPDATE_PLAN', 'plan', planId, `Set price Rp${priceIdr}`, getClientIp(req));
    res.json({ ok: true });
  });

  app.post('/api/admin/backup', requireAdminElevated, (req: AuthedRequest, res) => {
    const backup = createDatabaseBackup();
    writeAuditLog(req.authUser!.id, 'ADMIN_DB_BACKUP', 'database', backup.filename, `${backup.sizeBytes} bytes`, getClientIp(req));
    res.json({ ok: true, backup });
  });

  // ==================== RESUMABLE CHUNK UPLOAD (UP TO 10 HOURS) ====================
  app.post('/api/admin/upload/init', requireAdminElevated, (req: AuthedRequest, res) => {
    const filename = sanitizeText(req.body?.filename, 200);
    const mimeType = sanitizeText(req.body?.mimeType || 'video/mp4', 80);
    const totalSize = Math.max(1, Number(req.body?.totalSize) || 1);
    const totalChunks = Math.max(1, Number(req.body?.totalChunks) || 1);
    const durationSeconds = Math.max(0, Math.round(Number(req.body?.durationSeconds) || 0));

    if (durationSeconds > 36000) {
      res.status(400).json({ error: 'Durasi maksimal per file video adalah 10 jam (36.000 detik).' });
      return;
    }

    const scanExt = scanUploadedBuffer(filename, Buffer.alloc(0), 'video');
    if (!scanExt.safe) {
      res.status(400).json({ error: scanExt.reason });
      return;
    }

    const uploadId = `upl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpDir = path.join(PATHS.UPLOAD_DIR, uploadId);
    fs.mkdirSync(tmpDir, { recursive: true });

    db.prepare(
      `INSERT INTO upload_sessions (id, user_id, filename, mime_type, total_size, total_chunks, duration_seconds, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'uploading')`,
    ).run(uploadId, req.authUser!.id, filename, mimeType, totalSize, totalChunks, durationSeconds);

    res.status(201).json({ ok: true, uploadId });
  });

  app.post('/api/admin/upload/:uploadId/chunk', requireAdminElevated, (req: AuthedRequest, res) => {
    const uploadId = sanitizeText(req.params.uploadId, 80);
    const chunkIndex = Number(req.body?.chunkIndex);
    const base64Data = typeof req.body?.dataBase64 === 'string' ? req.body.dataBase64 : '';

    const session = db.prepare(`SELECT * FROM upload_sessions WHERE id = ?`).get(uploadId) as
      | Record<string, unknown>
      | undefined;
    if (!session) {
      res.status(404).json({ error: 'Sesi unggahan tidak ditemukan.' });
      return;
    }

    const buf = Buffer.from(base64Data, 'base64');
    if (chunkIndex === 0) {
      const scan = scanUploadedBuffer(String(session.filename), buf, 'video');
      if (!scan.safe) {
        db.prepare(`UPDATE upload_sessions SET status = 'failed', error_message = ? WHERE id = ?`).run(
          scan.reason || 'Blocked by scanner',
          uploadId,
        );
        writeAuditLog(req.authUser!.id, 'UPLOAD_MALWARE_BLOCKED', 'upload', uploadId, scan.reason || '', getClientIp(req));
        res.status(400).json({ error: scan.reason });
        return;
      }
    }

    const chunkPath = path.join(PATHS.UPLOAD_DIR, uploadId, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, buf);

    const received = safeJsonParse<number[]>(session.received_chunks, []);
    if (!received.includes(chunkIndex)) received.push(chunkIndex);
    const uploadedBytes = Number(session.uploaded_bytes) + buf.length;

    db.prepare(`UPDATE upload_sessions SET received_chunks = ?, uploaded_bytes = ? WHERE id = ?`).run(
      JSON.stringify(received),
      uploadedBytes,
      uploadId,
    );

    res.json({ ok: true, receivedChunks: received.length, totalChunks: Number(session.total_chunks) });
  });

  app.post('/api/admin/upload/:uploadId/complete', requireAdminElevated, (req: AuthedRequest, res) => {
    const uploadId = sanitizeText(req.params.uploadId, 80);
    const session = db.prepare(`SELECT * FROM upload_sessions WHERE id = ?`).get(uploadId) as
      | Record<string, unknown>
      | undefined;
    if (!session) {
      res.status(404).json({ error: 'Sesi unggahan tidak ditemukan.' });
      return;
    }

    db.prepare(`UPDATE upload_sessions SET status = 'scanning' WHERE id = ?`).run(uploadId);

    // Assemble & transcode asynchronously in background job
    const totalChunks = Number(session.total_chunks);
    const ext = path.extname(String(session.filename)) || '.mp4';
    const assembledPath = path.join(PATHS.UPLOAD_DIR, uploadId, `assembled${ext}`);

    try {
      const writeFd = fs.openSync(assembledPath, 'w');
      for (let i = 0; i < totalChunks; i += 1) {
        const chunkPath = path.join(PATHS.UPLOAD_DIR, uploadId, `chunk_${i}`);
        if (fs.existsSync(chunkPath)) {
          const data = fs.readFileSync(chunkPath);
          fs.writeSync(writeFd, data);
        }
      }
      fs.closeSync(writeFd);
    } catch (err) {
      db.prepare(`UPDATE upload_sessions SET status = 'failed', error_message = ? WHERE id = ?`).run(
        String(err),
        uploadId,
      );
      res.status(500).json({ error: 'Gagal menggabungkan bagian unggahan.' });
      return;
    }

    db.prepare(`UPDATE upload_sessions SET status = 'transcoding', transcode_progress = 5 WHERE id = ?`).run(uploadId);

    const outDir = path.join(PATHS.STREAM_DIR, uploadId);
    void transcodeVideoToMultiHls(assembledPath, outDir, uploadId, true)
      .then((result) => {
        db.prepare(
          `UPDATE upload_sessions
           SET status = 'ready', transcode_progress = 100, output_hls_url = ?, output_poster_url = ?, available_qualities = ?, duration_seconds = ?
           WHERE id = ?`,
        ).run(
          result.masterPlaylistUrl,
          result.posterUrl,
          JSON.stringify(result.availableQualities),
          result.durationSeconds,
          uploadId,
        );
      })
      .catch((err) => {
        db.prepare(`UPDATE upload_sessions SET status = 'failed', error_message = ? WHERE id = ?`).run(
          err instanceof Error ? err.message : 'Transcoding gagal',
          uploadId,
        );
      });

    res.json({ ok: true, status: 'transcoding', uploadId });
  });

  app.get('/api/admin/upload/:uploadId/status', requireAdminElevated, (req, res) => {
    const row = db.prepare(`SELECT * FROM upload_sessions WHERE id = ?`).get(sanitizeText(req.params.uploadId, 80)) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Sesi unggahan tidak ditemukan.' });
      return;
    }
    res.json({
      ...row,
      availableQualities: safeJsonParse<string[]>(row.available_qualities, []),
    });
  });

  // Return explicit JSON 404 for unknown /api/* routes rather than falling through to SPA HTML
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  // ==================== VITE DEV / STATIC PRODUCTION ====================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FLIXFIL] Server running at http://0.0.0.0:${PORT}`);
  });
}

void startServer();
