import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface SmartSearchMovieSummary {
  id: string;
  title: string;
  altTitles: string;
  category: string;
  genres: string[];
  country: string;
  releaseYear: number;
  director: string;
  cast: string[];
  synopsis: string;
}

export interface SmartSearchResult {
  matchedIds: string[];
  interpretedIntent: string;
  correctedQuery: string;
  usedAi: boolean;
}

export async function runSmartMovieSearch(
  query: string,
  catalog: SmartSearchMovieSummary[],
): Promise<SmartSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      matchedIds: catalog.map((m) => m.id),
      interpretedIntent: '',
      correctedQuery: '',
      usedAi: false,
    };
  }

  const ai = getAiClient();
  if (ai) {
    try {
      const compactCatalog = catalog.map((m) => ({
        id: m.id,
        title: m.title,
        alt: m.altTitles,
        cat: m.category,
        genres: m.genres,
        country: m.country,
        year: m.releaseYear,
        dir: m.director,
        cast: m.cast,
        plot: m.synopsis.slice(0, 220),
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `User query: "${trimmed}"\n\nCatalog JSON:\n${JSON.stringify(compactCatalog)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are the semantic search engine for FLIXFIL, an Indonesian and international movie streaming platform. ' +
            'Understand Indonesian and English queries, typos, synonyms, plot themes (e.g., "horor indonesia terbaru", "perang dunia kedua", "keluarga", "komedi romantis"), actor names, directors, and partial titles. ' +
            'ONLY return IDs that strictly exist in the provided Catalog JSON, ordered by highest relevance. Never invent fake movie IDs. ' +
            'If nothing matches strongly, return the 3 closest thematic recommendations in matchedIds and explain briefly in interpretedIntent (Bahasa Indonesia).',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matchedIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              interpretedIntent: { type: Type.STRING },
              correctedQuery: { type: Type.STRING },
            },
            required: ['matchedIds', 'interpretedIntent', 'correctedQuery'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        matchedIds?: string[];
        interpretedIntent?: string;
        correctedQuery?: string;
      };
      const validSet = new Set(catalog.map((c) => c.id));
      const matchedIds = (parsed.matchedIds ?? []).filter((id) => validSet.has(id));
      return {
        matchedIds,
        interpretedIntent: parsed.interpretedIntent || `Menampilkan hasil relevan untuk "${trimmed}"`,
        correctedQuery: parsed.correctedQuery || trimmed,
        usedAi: true,
      };
    } catch (err) {
      console.warn('[FLIXFIL AI] Smart search fallback:', err);
    }
  }

  // Deterministic bilingual fuzzy & synonym fallback when API key isn't active
  const synonymMap: Record<string, string[]> = {
    horor: ['horror', 'seram', 'hantu', 'mistis', 'misteri'],
    horror: ['horor', 'seram', 'hantu', 'mistis'],
    aksi: ['action', 'laga', 'pertarungan', 'perang'],
    action: ['aksi', 'laga', 'pertarungan'],
    perang: ['war', 'world war', 'sejarah', 'perjuangan', 'militer'],
    keluarga: ['family', 'ibu', 'ayah', 'anak', 'rumah'],
    romantis: ['romance', 'cinta', 'love', 'bahagia'],
    komedi: ['comedy', 'lucu', 'humor'],
    dokumenter: ['documentary', 'sejarah', 'arsip', 'nyata'],
    indonesia: ['nusantara', 'jakarta', 'jawa', 'lokal'],
  };

  const tokens = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const expandedTokens = new Set<string>(tokens);
  for (const token of tokens) {
    for (const [k, syns] of Object.entries(synonymMap)) {
      if (token.includes(k) || syns.some((s) => token.includes(s))) {
        expandedTokens.add(k);
        for (const s of syns) expandedTokens.add(s);
      }
    }
  }

  const scored = catalog
    .map((m) => {
      const hay = [
        m.title,
        m.altTitles,
        m.category,
        m.country,
        String(m.releaseYear),
        m.director,
        ...m.genres,
        ...m.cast,
        m.synopsis,
      ]
        .join(' ')
        .toLowerCase();

      let score = 0;
      if (hay.includes(trimmed.toLowerCase())) score += 10;
      for (const tok of expandedTokens) {
        if (hay.includes(tok)) score += tokens.includes(tok) ? 3 : 1;
      }
      return { id: m.id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    matchedIds: scored.map((s) => s.id),
    interpretedIntent:
      scored.length > 0
        ? `Menemukan ${scored.length} judul yang cocok dengan "${trimmed}"`
        : `Tidak ditemukan judul persis untuk "${trimmed}" — menampilkan rekomendasi terdekat.`,
    correctedQuery: trimmed,
    usedAi: false,
  };
}

export async function translateSubtitleWithAi(
  vttContent: string,
  targetLanguageLabel: string,
): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY belum dikonfigurasi di Settings > Secrets untuk penerjemahan subtitle AI.',
    );
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Translate the following WebVTT/SRT subtitle file naturally into ${targetLanguageLabel}. Keep WEBVTT header and ALL timestamps (00:00:00.000 --> 00:00:00.000) 100% intact. Output ONLY the translated subtitle text without markdown fences.\n\n${vttContent.slice(0, 24000)}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'You are a professional Indonesian & international film subtitler. Preserve exact cue numbers and timestamps. Translate dialogue idiomatically and concisely for screen readability.',
    },
  });

  const translated = (response.text ?? '').replace(/^```(?:vtt|srt)?\n?/i, '').replace(/```$/i, '').trim();
  if (!translated.startsWith('WEBVTT') && vttContent.trim().startsWith('WEBVTT')) {
    return `WEBVTT\n\n${translated}`;
  }
  return translated;
}
