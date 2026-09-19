import type { LocalizedMetadata, ReleaseType } from '@/types/creator';

export const MUSIC_TITLE_LOCALES = [
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'Arabic' },
  { key: 'fr', label: 'French' },
] as const;

const RECORDING_MARKER = /\s*\((?:live|studio|instrumental|acoustic|a\s*cappella|acapella|remaster(?:ed)?|demo|mix)\)\s*$/i;
const ARABIC_CHAR = /[\u0600-\u06FF]/;

function withoutExtension(name: string): string {
  return name.replace(/\.(?:wav|flac|mp3|m4a|aac|ogg|opus|webm|mp4|mov|m4v)$/i, '');
}

function withoutTrackPrefix(value: string): string {
  let clean = value.trim();
  // Remove repeated leading disc/track numbering such as "1. 01 ", "02 - ", or "Track 3 ".
  for (let i = 0; i < 3; i += 1) {
    const next = clean.replace(/^\s*(?:track\s*)?\d{1,3}\s*(?:[._)-]\s*|[-–—]\s*|\s+)/i, '');
    if (next === clean) break;
    clean = next.trim();
  }
  return clean;
}

function titleSegment(value: string): string {
  return withoutTrackPrefix(value)
    .replace(RECORDING_MARKER, '')
    .split(/\s*[♱†‡|]\s*/)[0]
    .replace(RECORDING_MARKER, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function preferredLocalizedTitle(titles?: Partial<LocalizedMetadata> | null): string {
  if (!titles) return '';
  return [titles.en, titles.ar, titles.fr, titles.cop]
    .map((value) => value?.trim() ?? '')
    .find(Boolean) ?? '';
}

export function hasMusicTitle(titles?: Partial<LocalizedMetadata> | null): boolean {
  if (!titles) return false;
  return [titles.en, titles.ar, titles.fr].some((value) => Boolean(value?.trim()));
}

export function releaseTypeForTrackCount(trackCount: number): ReleaseType {
  if (trackCount <= 1) return 'single';
  if (trackCount <= 6) return 'ep';
  return 'album';
}

/**
 * Best-effort metadata guess from a picked audio filename.
 *
 * Example:
 * "1. 01 Nisavev Teerou ♱ Liturgy with Ibrahim Ayad (Live) نيسافيف تيرو ♱ قداس مع إبراهيم عياد.wav"
 * -> English: "Nisavev Teerou", Arabic: "نيسافيف تيرو".
 *
 * We intentionally only prefill fields; the artist can always correct the guess.
 */
export function guessLocalizedTitlesFromFilename(filename: string): LocalizedMetadata {
  const base = withoutTrackPrefix(withoutExtension(filename));
  const arabicIndex = base.search(ARABIC_CHAR);
  const latinSide = arabicIndex >= 0 ? base.slice(0, arabicIndex) : base;
  const arabicSide = arabicIndex >= 0 ? base.slice(arabicIndex) : '';

  return {
    en: titleSegment(latinSide),
    ar: titleSegment(arabicSide),
    cop: '',
    fr: '',
  };
}

export function guessRecordingTypeFromFilename(filename: string): string {
  const base = withoutExtension(filename);
  if (/\binstrumental\b/i.test(base)) return 'Instrumental';
  if (/\blive\b/i.test(base)) return 'Live';
  if (/\bstudio\b/i.test(base)) return 'Studio';
  if (/\bacoustic\b/i.test(base)) return 'Acoustic';
  if (/\ba\s*cappella\b|\bacapella\b/i.test(base)) return 'A cappella';
  return '';
}
