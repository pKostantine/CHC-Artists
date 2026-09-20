import type { EditableLyricLine } from '@/types/lyrics';

const TIMESTAMP_RE = /\[(\d{1,}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;

function assertNonnegativeMilliseconds(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative finite millisecond value.`);
  }
}

export function renumberLyricLines<T extends EditableLyricLine>(lines: T[]): T[] {
  return lines.map((line, index) => ({ ...line, sequence: index + 1 }));
}

export function createLyricLinesFromText(text: string): EditableLyricLine[] {
  // Blank rows are meaningful in multilingual lyrics. A mixed-language track
  // may intentionally have Arabic text on a row and no English/Coptic/French
  // text for that same shared timestamp, so never collapse empty lines here.
  return text
    .split(/\r?\n/)
    .map((line, index) => ({
      sequence: index + 1,
      startMs: null,
      endMs: null,
      text: line.trim(),
    }));
}

export function parseLrcTimestamp(timestamp: string): number | null {
  const match = timestamp.trim().match(/^\[?(\d{1,}):([0-5]\d)(?:[.:](\d{1,3}))?\]?$/);
  if (!match) return null;
  return Number(match[1]) * 60_000 + Number(match[2]) * 1_000 + Number((match[3] || '0').padEnd(3, '0').slice(0, 3));
}

export function formatLrcTimestamp(milliseconds: number): string {
  assertNonnegativeMilliseconds(milliseconds, 'milliseconds');
  const rounded = Math.round(milliseconds);
  const totalSeconds = Math.floor(rounded / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const ms = rounded % 1_000;
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}]`;
}

export function formatEditorTimestamp(milliseconds: number | null): string {
  if (milliseconds === null) return '';
  return formatLrcTimestamp(milliseconds).slice(1, -1);
}

export function parseEditorTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = parseLrcTimestamp(trimmed);
  if (timestamp !== null) return timestamp;
  const seconds = Number(trimmed);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1_000) : null;
}

export function parseLrc(lrc: string): EditableLyricLine[] {
  const parsed: Array<EditableLyricLine & { sourceIndex: number; startMs: number }> = [];

  lrc.split(/\r?\n/).forEach((rawLine, sourceIndex) => {
    const timestamps = [...rawLine.matchAll(TIMESTAMP_RE)];
    if (!timestamps.length) return;
    const text = rawLine.replace(TIMESTAMP_RE, '').trim();

    // A timed blank line is valid and preserves the shared multilingual row.
    timestamps.forEach((timestamp) => {
      const startMs = parseLrcTimestamp(timestamp[0]);
      if (startMs !== null) parsed.push({ sequence: 0, sourceIndex, startMs, endMs: null, text });
    });
  });

  return parsed
    .sort((a, b) => a.startMs - b.startMs || a.sourceIndex - b.sourceIndex)
    .map(({ sourceIndex: _sourceIndex, ...line }, index) => ({ ...line, sequence: index + 1 }));
}

export function formatLrc(lines: readonly EditableLyricLine[]): string {
  return [...lines]
    .filter((line): line is EditableLyricLine & { startMs: number } => line.startMs !== null)
    .sort((a, b) => a.startMs - b.startMs || a.sequence - b.sequence)
    .map((line) => `${formatLrcTimestamp(line.startMs)}${line.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

export function getLyricLineWindow(
  lines: readonly EditableLyricLine[],
  index: number,
): { startMs: number; endMs: number | null } | null {
  const line = lines[index];
  if (!line || line.startMs === null) return null;
  const nextStarted = lines.slice(index + 1).find((candidate) => candidate.startMs !== null);
  return { startMs: line.startMs, endMs: line.endMs ?? nextStarted?.startMs ?? null };
}

export function findActiveLyricLineIndex(lines: readonly EditableLyricLine[], positionMs: number): number {
  assertNonnegativeMilliseconds(positionMs, 'positionMs');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const window = getLyricLineWindow(lines, index);
    if (!window || positionMs < window.startMs) continue;
    if (window.endMs !== null && positionMs >= window.endMs) continue;
    return index;
  }
  return -1;
}
