import { sanitizeText } from './security.ts';

export interface ContentMatchInput {
  title: string;
  detectedSourceTitle?: string;
  releaseYear: number;
  detectedYear?: number;
  durationSeconds: number;
  detectedDurationSeconds?: number;
  sourceType: string;
  sourceUrl: string;
  embedUrl?: string;
  posterUrl?: string;
  availableQualities?: string[];
  hasAudio?: boolean;
  hasSubtitle?: boolean;
  type?: string;
  episodeCount?: number;
}

export interface ContentMatchResult {
  matched: boolean;
  canPublish: boolean;
  confidenceScore: number;
  errors: string[];
  warnings: string[];
  checks: Array<{
    label: string;
    status: 'pass' | 'warn' | 'fail';
    detail: string;
  }>;
}

function tokenize(text: string): string[] {
  return sanitizeText(text, 300)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const w of ta) {
    if (tb.has(w)) overlap += 1;
  }
  return overlap / Math.max(1, Math.min(ta.size, tb.size));
}

export function verifyVideoMetadataMatch(input: ContentMatchInput): ContentMatchResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: ContentMatchResult['checks'] = [];
  let score = 100;

  // 1. Source identity & playability check
  const hasSource = Boolean(input.sourceUrl?.trim() || input.embedUrl?.trim());
  if (!hasSource) {
    errors.push('Sumber video atau URL tautan resmi belum diisi.');
    checks.push({ label: 'Identitas Sumber Video', status: 'fail', detail: 'URL sumber/video kosong.' });
    score -= 40;
  } else {
    checks.push({
      label: 'Identitas Sumber Video',
      status: 'pass',
      detail: `${input.sourceType.toUpperCase()} terhubung (${(input.sourceUrl || input.embedUrl || '').slice(0, 60)})`,
    });
  }

  // 2. Title & Source Title consistency check
  const cleanTitle = sanitizeText(input.title, 180);
  if (!cleanTitle) {
    errors.push('Judul film wajib diisi.');
    checks.push({ label: 'Kesesuaian Judul', status: 'fail', detail: 'Judul film kosong.' });
    score -= 30;
  } else if (input.detectedSourceTitle && input.detectedSourceTitle.trim().length > 2) {
    const cleanSource = input.detectedSourceTitle.replace(/^(Video YouTube|Video Vimeo|Judul Bstation).*/i, '').trim();
    if (cleanSource.length > 2) {
      const sim = tokenSimilarity(cleanTitle, cleanSource);
      if (sim < 0.25) {
        warnings.push(
          `Judul yang dimasukkan ("${cleanTitle}") berbeda jauh dengan judul asli sumber video ("${cleanSource}"). Pastikan video berasal dari film yang sama.`,
        );
        checks.push({
          label: 'Kesesuaian Judul',
          status: 'warn',
          detail: `Terdeteksi "${cleanSource}" vs input "${cleanTitle}"`,
        });
        score -= 25;
      } else {
        checks.push({
          label: 'Kesesuaian Judul',
          status: 'pass',
          detail: `Cocok dengan sumber "${cleanSource}"`,
        });
      }
    } else {
      checks.push({ label: 'Kesesuaian Judul', status: 'pass', detail: cleanTitle });
    }
  } else {
    checks.push({ label: 'Kesesuaian Judul', status: 'pass', detail: cleanTitle });
  }

  // 3. Release year consistency
  if (input.detectedYear && Math.abs(input.releaseYear - input.detectedYear) > 2) {
    warnings.push(
      `Tahun rilis (${input.releaseYear}) berbeda dengan tahun metadata sumber (${input.detectedYear}).`,
    );
    checks.push({
      label: 'Tahun Produksi',
      status: 'warn',
      detail: `Input ${input.releaseYear} vs Sumber ${input.detectedYear}`,
    });
    score -= 10;
  } else {
    checks.push({
      label: 'Tahun Produksi',
      status: 'pass',
      detail: `Tahun ${input.releaseYear}`,
    });
  }

  // 4. Duration sanity & 10-hour limit check
  if (input.durationSeconds > 36000) {
    errors.push('Durasi video melebihi batas maksimal 10 jam (36.000 detik).');
    checks.push({ label: 'Durasi Video', status: 'fail', detail: 'Melebihi 10 jam' });
    score -= 30;
  } else if (
    input.detectedDurationSeconds &&
    input.detectedDurationSeconds > 0 &&
    Math.abs(input.durationSeconds - input.detectedDurationSeconds) > Math.max(60, input.detectedDurationSeconds * 0.25)
  ) {
    warnings.push(
      `Durasi yang diisi (${input.durationSeconds}d) tidak sesuai dengan durasi asli berkas video (${input.detectedDurationSeconds}d).`,
    );
    checks.push({
      label: 'Durasi Video',
      status: 'warn',
      detail: `Input ${input.durationSeconds}d vs Video asli ${input.detectedDurationSeconds}d`,
    });
    score -= 15;
  } else {
    checks.push({
      label: 'Durasi Video',
      status: 'pass',
      detail: `${Math.floor(input.durationSeconds / 60)} menit (${input.durationSeconds} detik)`,
    });
  }

  // 5. Resolution / Quality check
  const quals = input.availableQualities || [];
  checks.push({
    label: 'Resolusi Video',
    status: quals.length > 0 ? 'pass' : 'warn',
    detail: quals.length > 0 ? quals.join(', ') : 'Mengikuti sumber asli',
  });

  // 6. Audio & Subtitle & Poster check
  checks.push({
    label: 'Audio & Subtitle',
    status: input.hasSubtitle ? 'pass' : 'warn',
    detail: `${input.hasAudio !== false ? 'Audio aktif' : 'Periksa audio'} · ${input.hasSubtitle ? 'Subtitle tersedia' : 'Belum ada subtitle (dapat ditambah setelah simpan)'}`,
  });

  if (!input.posterUrl) {
    warnings.push('Poster resmi belum diisi — sistem akan menampilkan placeholder resmi FLIXFIL hingga poster ditambahkan.');
    checks.push({ label: 'Poster Resmi', status: 'warn', detail: 'Menggunakan placeholder FLIXFIL' });
    score -= 5;
  } else {
    checks.push({ label: 'Poster Resmi', status: 'pass', detail: 'Poster/artwork resmi terlampir' });
  }

  if (input.type === 'series' && (input.episodeCount ?? 0) === 0) {
    checks.push({
      label: 'Episode Serial',
      status: 'warn',
      detail: 'Serial dapat ditambahkan episodenya di tab Kelola Film setelah disimpan.',
    });
  }

  const finalScore = Math.max(0, Math.min(100, score));
  return {
    matched: errors.length === 0 && warnings.length === 0,
    canPublish: errors.length === 0,
    confidenceScore: finalScore,
    errors,
    warnings,
    checks,
  };
}
