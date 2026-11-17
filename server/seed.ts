import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PATHS, db } from './db.ts';
import { hashPassword } from './security.ts';

function upsertConfig(key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}

function getOrCreateSecretFromEnvOrBootstrap(envName: string, bootstrapKey: string): string {
  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.trim().length >= 8) {
    return fromEnv.trim();
  }
  const bootstrapPath = path.join(PATHS.DATA_DIR, `.${bootstrapKey}`);
  if (fs.existsSync(bootstrapPath)) {
    return fs.readFileSync(bootstrapPath, 'utf8').trim();
  }
  const generated = crypto.randomBytes(18).toString('base64url');
  fs.writeFileSync(bootstrapPath, generated, { mode: 0o600 });
  return generated;
}

export function seedInitialData(): void {
  // 1. Admin Master Password hash from server secret config (never hardcoded in source)
  if (process.env.ADMIN_MASTER_PASSWORD && process.env.ADMIN_MASTER_PASSWORD.trim().length >= 8) {
    upsertConfig('admin_master_hash', hashPassword(process.env.ADMIN_MASTER_PASSWORD.trim()));
  } else {
    const existingMaster = db.prepare(`SELECT value FROM app_config WHERE key = 'admin_master_hash'`).get() as
      | { value: string }
      | undefined;
    if (!existingMaster) {
      const secretPass = getOrCreateSecretFromEnvOrBootstrap('ADMIN_MASTER_PASSWORD', 'admin_master_secret');
      upsertConfig('admin_master_hash', hashPassword(secretPass));
    }
  }

  // Default AUTO FEATURE setting for Dynamic Hero Banner
  const existingAutoHero = db.prepare(`SELECT value FROM app_config WHERE key = 'hero_auto_feature'`).get();
  if (!existingAutoHero) {
    upsertConfig('hero_auto_feature', '1');
  }

  // 2. Clean up any legacy synthetic/dummy seeded movies from earlier revision so dashboard begins clean without fake cards
  const legacyDummyIds = [
    'mov_senja_sunda_kelapa',
    'mov_simfoni_nusantara',
    'mov_sintel_cc',
    'mov_tears_of_steel',
    'mov_night_living_dead',
    'mov_metropolis_1927',
    'mov_darah_dan_doa',
    'mov_gerbang_keramat',
    'mov_bara_jakarta',
    'mov_kontrakan_heboh',
    'mov_hujan_bandung',
    'mov_serial_menteng',
    'mov_seoul_station_echo',
    'mov_tokyo_skyline_anime',
    'mov_external_netflix_ref',
  ];
  const placeholders = legacyDummyIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM movies WHERE id IN (${placeholders})`).run(...legacyDummyIds);

  // 3. Seed Users if empty (admin credentials sourced from env/bootstrap secret; demo viewer for testing)
  const userCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM users`).get() as { cnt: number }).cnt;
  if (userCount === 0) {
    const adminId = 'usr_admin_flixfil';
    const demoUserId = 'usr_demo_penonton';
    const nowUtc = new Date().toISOString();
    const adminPass = getOrCreateSecretFromEnvOrBootstrap('ADMIN_INITIAL_PASSWORD', 'admin_login_secret');

    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, display_name, bio, role, email_verified, subscription_tier, is_profile_public, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'admin', 1, 'premium', 0, ?)`,
    ).run(
      adminId,
      'admin',
      'admin@flixfil.id',
      hashPassword(adminPass),
      'Administrator FLIXFIL',
      'Administrator resmi katalog FLIXFIL.',
      nowUtc,
    );

    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, display_name, bio, role, email_verified, subscription_tier, is_profile_public, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'user', 1, 'free', 1, ?)`,
    ).run(
      demoUserId,
      'penonton',
      'penonton@flixfil.id',
      hashPassword('FlixFilUser123!'),
      'Raka Pratama',
      'Penikmat sinema Indonesia dan internasional.',
      nowUtc,
    );

    db.prepare(`INSERT INTO user_settings (user_id, language) VALUES (?, 'id')`).run(adminId);
    db.prepare(`INSERT INTO user_settings (user_id, language) VALUES (?, 'id')`).run(demoUserId);
  }

  // 4. Seed Subscription Plans (strictly <= Rp20.000; All Films Free, Premium unlocks 1080p Premium HD)
  const planCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM subscription_plans`).get() as { cnt: number }).cnt;
  if (planCount === 0) {
    const insertPlan = db.prepare(
      `INSERT INTO subscription_plans (id, name, duration_days, price_idr, description, features, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    );

    insertPlan.run(
      'plan_7d',
      'Premium 7 Hari',
      7,
      5000,
      'Nikmati kualitas 1080p Premium HD bitrate tinggi dan pengalaman tanpa jeda selama seminggu.',
      JSON.stringify([
        'Semua film tetap gratis ditonton',
        'Buka kualitas 1080p Premium HD (jika didukung sumber)',
        'Subtitle Bahasa Indonesia & sinkronisasi otomatis',
        'Bebas iklan internal',
      ]),
    );

    insertPlan.run(
      'plan_30d',
      'Premium 30 Hari',
      30,
      15000,
      'Paket paling hemat untuk streaming kualitas 1080p Premium HD sebulan penuh.',
      JSON.stringify([
        'Semua film tetap gratis untuk semua pengguna',
        'Kualitas 1080p Premium HD adaptif bitrate tinggi',
        'Prioritas audio jernih & sinkronisasi subtitle',
        'Sinkronisasi progres lintas perangkat tanpa batas',
      ]),
    );

    insertPlan.run(
      'plan_30d_plus',
      'Premium 30 Hari Plus',
      30,
      20000,
      'Pengalaman sinematik 1080p Premium HD lengkap dengan batas harga resmi maksimal Rp20.000.',
      JSON.stringify([
        'Semua manfaat Premium 30 Hari + 1080p Premium HD',
        'Kualitas visual tertinggi jika tersedia di sumber video',
        'Dukungan Picture-in-Picture & kecepatan pemutaran penuh',
        'Prioritas dukungan anggota FLIXFIL',
      ]),
    );
  } else {
    // Keep legacy seeded default copy synchronized with All-Films-Free policy
    db.prepare(
      `UPDATE subscription_plans
       SET description = 'Nikmati kualitas 1080p Premium HD bitrate tinggi dan pengalaman tanpa jeda selama seminggu.',
           features = ?
       WHERE id = 'plan_7d' AND description LIKE '%film Premium%'`,
    ).run(
      JSON.stringify([
        'Semua film tetap gratis ditonton',
        'Buka kualitas 1080p Premium HD (jika didukung sumber)',
        'Subtitle Bahasa Indonesia & sinkronisasi otomatis',
        'Bebas iklan internal',
      ]),
    );
    db.prepare(
      `UPDATE subscription_plans
       SET features = ?
       WHERE id = 'plan_30d' AND features LIKE '%Akses semua film & serial Premium%'`,
    ).run(
      JSON.stringify([
        'Semua film tetap gratis untuk semua pengguna',
        'Kualitas 1080p Premium HD adaptif bitrate tinggi',
        'Prioritas audio jernih & sinkronisasi subtitle',
        'Sinkronisasi progres lintas perangkat tanpa batas',
      ]),
    );
  }
}
