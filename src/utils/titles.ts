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
  let clean = value.trim().replace(/^\s*(?:disc|disk|cd)\s*\d{1,2}\s*(?:[._)-]\s*|[-–—]\s*|\s+)/i, '');
  // Shared by music tracks, learning recordings and individual lessons.
  // Strip nested labels, e.g. "Disc 1 - 02. Lesson 03 - Introduction".
  for (let i = 0; i < 4; i += 1) {
    const next = clean.replace(/^\s*(?:(?:track|lesson|part|recording|episode)\s*)?\d{1,3}\s*(?:[._)-]\s*|[-–—]\s*|\s+)/i, '');
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

  const english = titleSegment(latinSide);
  const arabic = titleSegment(arabicSide);
  return {
    // A bare number ("01.m4a") is an ordering hint, not a recording title.
    // Leave it empty so the artist must supply a meaningful title.
    en: /^\d+$/.test(english) ? '' : english,
    ar: /^\d+$/.test(arabic) ? '' : arabic,
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

/** Numeric disc and position hint from a filename; never a required field. */
export interface FilenameOrderHint { disc: number; position: number }

/**
 * Recognizes leading numbers ("02 - Psalm"), role labels ("Lesson 03"),
 * disc-prefixed tracks ("Disc 2 - Track 05") and nested "1. 04" numbering.
 * Only the filename is considered. The artist can always drag the file.
 */
export function guessFilenameOrder(filename: string): FilenameOrderHint | null {
  const base = withoutExtension(filename).trim();
  const discTrack = base.match(/^(?:disc|disk|cd)\s*0*(\d{1,2})\s*(?:[._)-]\s*|[-–—]\s*|\s+)(?:(?:track|lesson|part|recording|episode)\s*)?0*(\d{1,3})(?=$|[a-z\s._)–—-])/i);
  if (discTrack) return { disc: Number(discTrack[1]), position: Number(discTrack[2]) };
  const nested = base.match(/^0*(\d{1,2})[._)]\s*0*(\d{1,3})(?=$|[\s._)–—-])/i);
  if (nested) return { disc: Number(nested[1]), position: Number(nested[2]) };
  const single = base.match(/^(?:(?:track|lesson|part|recording|episode)\s*)?0*(\d{1,3})(?=$|[\s._)–—-])/i);
  return single ? { disc: 1, position: Number(single[1]) } : null;
}

/** Best-effort initial ordering. Equal/unmarked filenames retain picker order.
 * Call only before the user manually reorders the draft.
 */
export function sortMediaByFilenameOrder<T extends { name: string }>(items: readonly T[]): T[] {
  const guessed = items.map((item, selectedIndex) => ({
    item, selectedIndex, order: guessFilenameOrder(item.name),
  }));
  // Don't unexpectedly move an entire album based on one ambiguous number.
  if (guessed.filter((entry) => entry.order !== null).length < 2) return [...items];
  guessed.sort((a, b) => {
    if (!a.order && !b.order) return a.selectedIndex - b.selectedIndex;
    if (!a.order) return 1;
    if (!b.order) return -1;
    return a.order.disc - b.order.disc
      || a.order.position - b.order.position
      || a.selectedIndex - b.selectedIndex;
  });
  return guessed.map((entry) => entry.item);
}
