import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';
import type { Request, Response, NextFunction } from 'express';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const SECRET_FILE = path.join(DATA_DIR, '.session_secret');

function resolveSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

export const SESSION_SECRET = resolveSessionSecret();

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  if (!plain || !hash) return false;
  return bcrypt.compareSync(plain, hash);
}

export function hashToken(token: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function signValue(value: string): string {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
  return `${value}.${sig}`;
}

export function verifySignedValue(signed: string): string | null {
  const idx = signed.lastIndexOf('.');
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return value;
}

export function sanitizeText(input: unknown, maxLen = 2000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .trim()
    .slice(0, maxLen);
}

export function isSafePublicUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    // Block private IPv4 ranges
    const ipv4Match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const a = Number(ipv4Match[1]);
      const b = Number(ipv4Match[2]);
      if (a === 10 || a === 127 || a === 0) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export interface ScanResult {
  safe: boolean;
  reason?: string;
}

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.sh', '.bash', '.ps1', '.vbs',
  '.js', '.mjs', '.cjs', '.php', '.py', '.rb', '.pl', '.html', '.htm', '.svg', '.msi', '.apk',
]);

export function scanUploadedBuffer(filename: string, buffer: Buffer, category: 'video' | 'subtitle' | 'image'): ScanResult {
  const ext = path.extname(filename).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { safe: false, reason: `Ekstensi file ${ext} diblokir oleh pemindai keamanan.` };
  }

  // Check executable magic bytes (PE/MZ, ELF, Mach-O, Shebang)
  if (buffer.length >= 4) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    const b2 = buffer[2];
    const b3 = buffer[3];
    // Windows PE: MZ
    if (b0 === 0x4d && b1 === 0x5a) {
      return { safe: false, reason: 'Terdeteksi signature executable (PE/MZ).' };
    }
    // Linux ELF: 0x7F E L F
    if (b0 === 0x7f && b1 === 0x45 && b2 === 0x4c && b3 === 0x46) {
      return { safe: false, reason: 'Terdeteksi signature executable (ELF).' };
    }
    // Mach-O
    if ((b0 === 0xfe && b1 === 0xed && b2 === 0xfa) || (b0 === 0xcf && b1 === 0xfa && b2 === 0xed)) {
      return { safe: false, reason: 'Terdeteksi signature executable (Mach-O).' };
    }
    // Shebang #!/
    if (b0 === 0x23 && b1 === 0x21) {
      return { safe: false, reason: 'Skrip shell/executable tidak diizinkan.' };
    }
  }

  if (category === 'subtitle') {
    if (!['.vtt', '.srt', '.txt'].includes(ext)) {
      return { safe: false, reason: 'Hanya file subtitle .vtt atau .srt yang diizinkan.' };
    }
    const textSample = buffer.subarray(0, 65536).toString('utf8');
    if (/<script|javascript:|onerror=|onload=/i.test(textSample)) {
      return { safe: false, reason: 'Terdeteksi pola skrip berbahaya di dalam file subtitle.' };
    }
  }

  if (category === 'image') {
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return { safe: false, reason: 'Hanya gambar JPG, PNG, atau WebP yang diizinkan.' };
    }
    const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!isJpg && !isPng && !isWebp) {
      return { safe: false, reason: 'Header biner gambar tidak valid.' };
    }
  }

  if (category === 'video') {
    if (!['.mp4', '.webm', '.mkv', '.mov', '.m4v', '.ts', '.m3u8'].includes(ext)) {
      return { safe: false, reason: 'Format video harus MP4, WebM, MKV, MOV, atau HLS.' };
    }
  }

  return { safe: true };
}

// In-memory rate limiter for high-frequency endpoints
interface RateBucket {
  count: number;
  resetAt: number;
}
const rateBuckets = new Map<string, RateBucket>();

export function createRateLimiter(maxRequests: number, windowMs: number, prefix = 'rl') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${prefix}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.status(429).json({
        error: 'Terlalu banyak permintaan. Silakan tunggu beberapa saat sebelum mencoba lagi.',
      });
      return;
    }
    next();
  };
}

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: data: https:",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.dailymotion.com https://archive.org https://player.bilibili.com",
      "connect-src 'self' https://accounts.google.com",
    ].join('; '),
  );
  next();
}

export function generateTotpSetup(username: string): { secret: string; uri: string } {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'FLIXFIL',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

export function verifyTotpToken(secretBase32: string, token: string): boolean {
  if (!secretBase32 || !token) return false;
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'FLIXFIL',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    const delta = totp.validate({ token: token.replace(/\s+/g, ''), window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}
