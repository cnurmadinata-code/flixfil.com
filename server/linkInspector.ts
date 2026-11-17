import { isSafePublicUrl, sanitizeText } from './security.ts';

export interface InspectedLinkMetadata {
  platformName: string;
  sourceType: 'youtube' | 'vimeo' | 'dailymotion' | 'bilibili' | 'archive' | 'hls' | 'mp4' | 'external_only';
  title: string;
  synopsis: string;
  director: string;
  releaseYear: number;
  posterUrl: string;
  backdropUrl: string;
  sourceUrl: string;
  embedUrl: string;
  playbackSupported: boolean;
  availableQualities: string[];
  notice: string;
}

function extractYouTubeId(urlObj: URL): string | null {
  const host = urlObj.hostname.toLowerCase();
  if (host === 'youtu.be') {
    return urlObj.pathname.slice(1).split('/')[0] || null;
  }
  if (host.includes('youtube.com')) {
    if (urlObj.pathname === '/watch') {
      return urlObj.searchParams.get('v');
    }
    if (urlObj.pathname.startsWith('/embed/') || urlObj.pathname.startsWith('/shorts/')) {
      return urlObj.pathname.split('/')[2] || null;
    }
  }
  return null;
}

function extractVimeoId(urlObj: URL): string | null {
  if (!urlObj.hostname.toLowerCase().includes('vimeo.com')) return null;
  const match = urlObj.pathname.match(/\/(?:video\/)?(\d+)/);
  return match ? match[1] : null;
}

function extractDailymotionId(urlObj: URL): string | null {
  const host = urlObj.hostname.toLowerCase();
  if (host === 'dai.ly') return urlObj.pathname.slice(1).split('/')[0] || null;
  if (host.includes('dailymotion.com')) {
    const match = urlObj.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }
  return null;
}

function extractArchiveId(urlObj: URL): string | null {
  if (!urlObj.hostname.toLowerCase().includes('archive.org')) return null;
  const match = urlObj.pathname.match(/\/(?:details|embed)\/([^/?#]+)/);
  return match ? match[1] : null;
}

function extractBilibiliId(urlObj: URL): string | null {
  const host = urlObj.hostname.toLowerCase();
  if (!host.includes('bilibili.')) return null;
  const bvidMatch = urlObj.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/);
  if (bvidMatch) return bvidMatch[1];
  const epMatch = urlObj.pathname.match(/\/play\/(\d+)/);
  if (epMatch) return epMatch[1];
  return null;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 4500): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FLIXFIL-MetadataInspector/1.0' },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function inspectExternalVideoUrl(rawUrl: string): Promise<InspectedLinkMetadata> {
  const cleanUrl = sanitizeText(rawUrl, 1200);
  if (!isSafePublicUrl(cleanUrl)) {
    throw new Error('URL tidak valid atau mengarah ke jaringan privat yang diblokir.');
  }

  const parsed = new URL(cleanUrl);
  const host = parsed.hostname.toLowerCase();

  // 1. YouTube
  const ytId = extractYouTubeId(parsed);
  if (ytId) {
    const oembed = await fetchJsonWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ytId}`)}&format=json`,
    );
    const title = sanitizeText(oembed?.title || `Video YouTube (${ytId})`, 180);
    const author = sanitizeText(oembed?.author_name || 'YouTube Creator', 120);
    const thumb = sanitizeText(oembed?.thumbnail_url || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`, 500);
    return {
      platformName: 'YouTube',
      sourceType: 'youtube',
      title,
      synopsis: `Konten dari kanal ${author} melalui integrasi resmi YouTube.`,
      director: author,
      releaseYear: new Date().getFullYear(),
      posterUrl: thumb,
      backdropUrl: thumb,
      sourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?enablejsapi=1&rel=0`,
      playbackSupported: true,
      availableQualities: ['Auto'],
      notice: 'Pemutaran embed resmi YouTube aktif. Pengaturan kualitas dikelola otomatis oleh pemutar resmi YouTube.',
    };
  }

  // 2. Vimeo
  const vimeoId = extractVimeoId(parsed);
  if (vimeoId) {
    const oembed = await fetchJsonWithTimeout(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(cleanUrl)}`,
    );
    const title = sanitizeText(oembed?.title || `Video Vimeo (${vimeoId})`, 180);
    const author = sanitizeText(oembed?.author_name || 'Vimeo Filmmaker', 120);
    const thumb = sanitizeText(oembed?.thumbnail_url || '', 500);
    return {
      platformName: 'Vimeo',
      sourceType: 'vimeo',
      title,
      synopsis: sanitizeText(oembed?.description || `Karya video oleh ${author} di Vimeo.`, 500),
      director: author,
      releaseYear: new Date().getFullYear(),
      posterUrl: thumb,
      backdropUrl: thumb,
      sourceUrl: cleanUrl,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      playbackSupported: true,
      availableQualities: ['Auto'],
      notice: 'Integrasi embed resmi Vimeo terdeteksi.',
    };
  }

  // 3. Dailymotion
  const dmId = extractDailymotionId(parsed);
  if (dmId) {
    const oembed = await fetchJsonWithTimeout(
      `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`,
    );
    const title = sanitizeText(oembed?.title || `Video Dailymotion (${dmId})`, 180);
    const author = sanitizeText(oembed?.author_name || 'Dailymotion', 120);
    const thumb = sanitizeText(oembed?.thumbnail_url || '', 500);
    return {
      platformName: 'Dailymotion',
      sourceType: 'dailymotion',
      title,
      synopsis: `Video resmi dari ${author} di Dailymotion.`,
      director: author,
      releaseYear: new Date().getFullYear(),
      posterUrl: thumb,
      backdropUrl: thumb,
      sourceUrl: cleanUrl,
      embedUrl: `https://www.dailymotion.com/embed/video/${dmId}`,
      playbackSupported: true,
      availableQualities: ['Auto'],
      notice: 'Integrasi embed resmi Dailymotion terdeteksi.',
    };
  }

  // 4. Internet Archive
  const iaId = extractArchiveId(parsed);
  if (iaId) {
    const meta = await fetchJsonWithTimeout(`https://archive.org/metadata/${encodeURIComponent(iaId)}`);
    const md = (meta?.metadata ?? {}) as Record<string, unknown>;
    const rawTitle = Array.isArray(md.title) ? md.title[0] : md.title;
    const rawDesc = Array.isArray(md.description) ? md.description[0] : md.description;
    const rawCreator = Array.isArray(md.creator) ? md.creator[0] : md.creator;
    const rawYear = Array.isArray(md.year) ? md.year[0] : md.year;
    const files = Array.isArray(meta?.files) ? (meta.files as Array<Record<string, unknown>>) : [];
    const mp4File = files.find((f) => typeof f.name === 'string' && f.name.endsWith('.mp4'));
    const directMp4 = mp4File ? `https://archive.org/download/${iaId}/${encodeURIComponent(String(mp4File.name))}` : '';
    const thumb = `https://archive.org/services/img/${iaId}`;

    return {
      platformName: 'Internet Archive',
      sourceType: directMp4 ? 'mp4' : 'archive',
      title: sanitizeText(String(rawTitle || iaId), 180),
      synopsis: sanitizeText(String(rawDesc || 'Koleksi arsip film domain publik dari Internet Archive.').replace(/<[^>]+>/g, ' '), 700),
      director: sanitizeText(String(rawCreator || 'Public Domain Archive'), 120),
      releaseYear: Number.parseInt(String(rawYear || '1968'), 10) || 1968,
      posterUrl: thumb,
      backdropUrl: thumb,
      sourceUrl: directMp4 || `https://archive.org/details/${iaId}`,
      embedUrl: `https://archive.org/embed/${iaId}`,
      playbackSupported: true,
      availableQualities: directMp4 ? ['480p'] : ['Auto'],
      notice: 'Sumber domain publik / arsip terbuka Internet Archive terdeteksi.',
    };
  }

  // 5. Bstation / Bilibili
  if (host.includes('bilibili.')) {
    const bId = extractBilibiliId(parsed);
    const isGlobalBstation = host.includes('bilibili.tv');
    return {
      platformName: isGlobalBstation ? 'Bstation' : 'Bilibili',
      sourceType: isGlobalBstation || !bId ? 'external_only' : 'bilibili',
      title: bId ? `Judul Bstation / Bilibili (${bId})` : 'Tautan Bstation / Bilibili',
      synopsis: 'Tautan dari Bstation / Bilibili. Sesuaikan judul dan detail sebelum menyimpan.',
      director: 'Bstation / Bilibili',
      releaseYear: new Date().getFullYear(),
      posterUrl: '',
      backdropUrl: '',
      sourceUrl: cleanUrl,
      embedUrl: !isGlobalBstation && bId ? `https://player.bilibili.com/player.html?bvid=${bId}&high_quality=1` : '',
      playbackSupported: !isGlobalBstation && Boolean(bId),
      availableQualities: !isGlobalBstation && bId ? ['Auto'] : [],
      notice: isGlobalBstation
        ? 'Bstation (bilibili.tv) membatasi pemutaran embed eksternal. Informasi disimpan ke koleksi dengan tombol Buka di Aplikasi Asli.'
        : 'Tautan Bilibili terdeteksi.',
    };
  }

  // 6. Direct HLS / MP4
  if (/\.m3u8(\?|$)/i.test(parsed.pathname)) {
    return {
      platformName: 'HLS Adaptive Stream',
      sourceType: 'hls',
      title: decodeURIComponent(parsed.pathname.split('/').pop() || 'Stream HLS').replace(/\.m3u8$/i, ''),
      synopsis: 'Aliran video adaptif HLS (.m3u8).',
      director: 'Official Stream',
      releaseYear: new Date().getFullYear(),
      posterUrl: '',
      backdropUrl: '',
      sourceUrl: cleanUrl,
      embedUrl: '',
      playbackSupported: true,
      availableQualities: ['Auto', '360p', '720p', '1080p'],
      notice: 'Stream HLS (.m3u8) terdeteksi. Pemutaran adaptif siap digunakan.',
    };
  }

  if (/\.(mp4|webm)(\?|$)/i.test(parsed.pathname)) {
    return {
      platformName: 'Direct Video',
      sourceType: 'mp4',
      title: decodeURIComponent(parsed.pathname.split('/').pop() || 'Video Langsung').replace(/\.(mp4|webm)$/i, ''),
      synopsis: 'Berkas video langsung yang sah.',
      director: 'Official Distribution',
      releaseYear: new Date().getFullYear(),
      posterUrl: '',
      backdropUrl: '',
      sourceUrl: cleanUrl,
      embedUrl: '',
      playbackSupported: true,
      availableQualities: ['720p'],
      notice: 'URL video langsung terdeteksi.',
    };
  }

  // 7. DRM-Protected Platforms (Netflix, Disney+, Prime Video, Vidio, Max, Apple TV)
  const drmPlatforms: Array<[string, string]> = [
    ['netflix.com', 'Netflix'],
    ['disneyplus.com', 'Disney+'],
    ['hotstar.com', 'Disney+ Hotstar'],
    ['primevideo.com', 'Prime Video'],
    ['vidio.com', 'Vidio'],
    ['hbomax.com', 'Max'],
    ['max.com', 'Max'],
    ['tv.apple.com', 'Apple TV+'],
  ];

  const matchedDrm = drmPlatforms.find(([domain]) => host.includes(domain));
  const platformLabel = matchedDrm ? matchedDrm[1] : parsed.hostname.replace(/^www\./, '');

  return {
    platformName: platformLabel,
    sourceType: 'external_only',
    title: `Tontonan dari ${platformLabel}`,
    synopsis: `Tersimpan dari ${platformLabel}. Karena kebijakan DRM & lisensi platform asli, pemutaran dilakukan langsung di aplikasi resmi ${platformLabel}.`,
    director: platformLabel,
    releaseYear: new Date().getFullYear(),
    posterUrl: '',
    backdropUrl: '',
    sourceUrl: cleanUrl,
    embedUrl: '',
    playbackSupported: false,
    availableQualities: [],
    notice: `${platformLabel} melindungi konten dengan DRM. FLIXFIL tidak melewati DRM; tautan disimpan rapi dengan tombol "Buka di Aplikasi Asli".`,
  };
}

export async function searchTmdbOfficial(query: string): Promise<Array<Record<string, unknown>>> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return [];
  const data = await fetchJsonWithTimeout(
    `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(apiKey)}&language=id-ID&query=${encodeURIComponent(query)}`,
  );
  const results = Array.isArray(data?.results) ? (data.results as Array<Record<string, unknown>>) : [];
  return results.slice(0, 6).map((item) => ({
    title: item.title || item.name || '',
    releaseYear: String(item.release_date || item.first_air_date || '').slice(0, 4),
    synopsis: item.overview || '',
    posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
    backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : '',
  }));
}
