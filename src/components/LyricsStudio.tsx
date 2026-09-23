import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Banner, Loading, PageHeader } from '@/components/ui';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { resolveTrackAudio } from '@/services/mediaService';
import { listEditableTracks, loadLyricDraft, publishLyricLanguages, saveLyricStudioDraft } from '@/services/lyricsService';
import type {
  EditableLyricLine,
  EditableMultilingualLyricRow,
  LocaleCode,
  LyricDraft,
  LyricEditorTrack,
} from '@/types/lyrics';
import { confirmAction } from '@/utils/dialogs';
import { exportLrcFile, importLrcFile } from '@/utils/lrcFiles';
import {
  createLyricLinesFromText,
  findActiveLyricLineIndex,
  formatLrc,
  parseLrc,
} from '@/utils/synchronizedLyrics';
import { MultilingualLyricRow } from './MultilingualLyricRow';
import { ReorderableList } from './ReorderableList';

const LOCALES: Array<{ value: LocaleCode; label: string; rtl?: boolean }> = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'cop', label: 'Coptic' },
  { value: 'ar', label: 'Arabic', rtl: true },
];

type LanguageState = 'none' | 'draft' | 'published' | 'published_draft';
type Message = { tone: 'success' | 'error' | 'info'; text: string } | null;

let newRowCounter = 0;

function nextRowKey(): string {
  newRowCounter += 1;
  return `lyric-row-${Date.now()}-${newRowCounter}`;
}

function localeLabel(locale: LocaleCode): string {
  return LOCALES.find((item) => item.value === locale)?.label ?? locale;
}

function localeOrder(locales: LocaleCode[]): LocaleCode[] {
  const order = new Map(LOCALES.map((item, index) => [item.value, index]));
  return [...locales].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds || 0);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe - Math.floor(safe)) * 1_000);
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
}

function draftRows(drafts: Record<string, LyricDraft | null>): EditableMultilingualLyricRow[] {
  const maxLines = Math.max(0, ...LOCALES.map((item) => drafts[item.value]?.lines.length ?? 0));

  return Array.from({ length: maxLines }, (_, index) => {
    const existingLines = LOCALES
      .map((item) => ({ locale: item.value, draft: drafts[item.value], line: drafts[item.value]?.lines[index] }))
      .filter((item): item is { locale: LocaleCode; draft: LyricDraft; line: EditableLyricLine } => Boolean(item.draft && item.line));

    const publishedLines = existingLines.filter(({ draft }) => draft.publicationStatus === 'published');
    const timingLine = publishedLines.find(({ line }) => line.startMs !== null)
      ?? publishedLines[0]
      ?? existingLines.find(({ line }) => line.startMs !== null)
      ?? existingLines[0];
    const lineIds: Record<string, string> = {};
    const texts: Record<string, string> = {};

    LOCALES.forEach((item) => {
      const line = drafts[item.value]?.lines[index];
      texts[item.value] = line?.text ?? '';
      if (line?.id) lineIds[item.value] = line.id;
    });

    return {
      key: timingLine?.line.id ? `existing-${timingLine.line.id}` : nextRowKey(),
      startMs: timingLine?.line.startMs ?? null,
      endMs: timingLine?.line.endMs ?? null,
      texts,
      lineIds,
    };
  });
}

function editableLinesForLocale(
  rows: EditableMultilingualLyricRow[],
  locale: LocaleCode,
): EditableLyricLine[] {
  return rows.map((row, index) => ({
    id: row.lineIds?.[locale],
    sequence: index + 1,
    startMs: row.startMs,
    endMs: row.endMs,
    text: row.texts[locale] ?? '',
  }));
}

export function LyricsStudio() {
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const [tracks, setTracks] = useState<LyricEditorTrack[]>([]);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [selectedLocales, setSelectedLocales] = useState<LocaleCode[]>(['en']);
  const [rows, setRows] = useState<EditableMultilingualLyricRow[]>([]);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [pasteTexts, setPasteTexts] = useState<Record<string, string>>({});
  const [languageStates, setLanguageStates] = useState<Record<string, LanguageState>>({});
  const [loading, setLoading] = useState(true);
  const [draftLoading, setDraftLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [dirty, setDirty] = useState(false);
  const [timelineWidth, setTimelineWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dirtyRevision = useRef(0);
  const knownLocales = useRef<Set<LocaleCode>>(new Set());
  const draftSnapshot = useRef<{
    trackId: string | null;
    locales: LocaleCode[];
    rows: EditableMultilingualLyricRow[];
    descriptions: Record<string, string>;
    dirty: boolean;
  }>({ trackId: null, locales: [], rows: [], descriptions: {}, dirty: false });

  const selectedTrack = tracks.find((track) => track.id === trackId) ?? null;
  const audioUrl = selectedTrack ? resolveTrackAudio(selectedTrack) : null;
  const player = useAudioPlayer(null, { updateInterval: 80 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    player.pause();
    player.replace(audioUrl);
  }, [audioUrl, player]);

  const timelineLines = useMemo(
    () => rows.map((row, index) => ({
      sequence: index + 1,
      startMs: row.startMs,
      endMs: row.endMs,
      text: row.texts[selectedLocales[0] ?? 'cop'] ?? '',
    })),
    [rows, selectedLocales],
  );

  const activeIndex = useMemo(
    () => findActiveLyricLineIndex(timelineLines, Math.max(0, Math.round(status.currentTime * 1_000))),
    [timelineLines, status.currentTime],
  );
  const timedCount = useMemo(() => rows.filter((row) => row.startMs !== null).length, [rows]);
  const nextUntimedIndex = useMemo(() => rows.findIndex((row) => row.startMs === null), [rows]);
  const progress = status.duration > 0 ? Math.min(1, Math.max(0, status.currentTime / status.duration)) : 0;
  const publishedLocales = LOCALES
    .map((item) => item.value)
    .filter((locale) => languageStates[locale] === 'published' || languageStates[locale] === 'published_draft');
  const editableSelected = selectedLocales;

  useEffect(() => {
    listEditableTracks()
      .then((result) => {
        setTracks(result);
        setTrackId((current) => current ?? result[0]?.id ?? null);
      })
      .catch((error) => setMessage({ tone: 'error', text: errorText(error, 'Could not load your tracks.') }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!trackId) return;
    let cancelled = false;

    setDraftLoading(true);
    setMessage(null);
    setRows([]);

    Promise.all(LOCALES.map(async (item) => ({
      locale: item.value,
      draft: await loadLyricDraft(trackId, item.value),
    })))
      .then((results) => {
        if (cancelled) return;

        const drafts: Record<string, LyricDraft | null> = {};
        const states: Record<string, LanguageState> = {};
        const nextDescriptions: Record<string, string> = {};
        const existingLocales: LocaleCode[] = [];

        results.forEach(({ locale, draft }) => {
          drafts[locale] = draft;
          states[locale] = !draft
            ? 'none'
            : draft.publicationStatus === 'published'
              ? (draft.hasDraft ? 'published_draft' : 'published')
              : 'draft';
          nextDescriptions[locale] = draft?.description ?? '';
          if (draft) existingLocales.push(locale);
        });

        knownLocales.current = new Set(existingLocales);
        setLanguageStates(states);
        setDescriptions(nextDescriptions);
        setPasteTexts({});
        setRows(draftRows(drafts));
        setSelectedLocales((current) => {
          if (existingLocales.length) return localeOrder(existingLocales);
          return current.length ? localeOrder(current) : ['en'];
        });
        setDirty(false);
      })
      .catch((error) => setMessage({ tone: 'error', text: errorText(error, 'Could not load the lyric languages for this track.') }))
      .finally(() => {
        if (!cancelled) setDraftLoading(false);
      });

    return () => { cancelled = true; };
  }, [trackId]);

  function currentDraftLocales(): LocaleCode[] {
    const locales = new Set<LocaleCode>([
      ...knownLocales.current,
      ...selectedLocales,
      ...LOCALES
        .map((item) => item.value)
        .filter((locale) => (languageStates[locale] ?? 'none') !== 'none'),
    ]);
    return localeOrder([...locales]);
  }

  useEffect(() => {
    draftSnapshot.current = {
      trackId,
      locales: currentDraftLocales(),
      rows,
      descriptions,
      dirty,
    };
  }, [descriptions, dirty, languageStates, rows, selectedLocales, trackId]);

  useEffect(() => {
    if (!dirty || !trackId || draftLoading) return;
    const timer = setTimeout(() => {
      void saveDraft(true);
    }, 500);
    return () => clearTimeout(timer);
    // saveDraft intentionally reads the current render snapshot; row/description
    // changes retrigger this debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptions, dirty, draftLoading, languageStates, rows, selectedLocales, trackId]);

  useEffect(() => {
    const flushCurrentSnapshot = () => {
      const snapshot = draftSnapshot.current;
      if (!snapshot.dirty || !snapshot.trackId || !snapshot.locales.length) return;
      void saveLyricStudioDraft({
        trackId: snapshot.trackId,
        languages: snapshot.locales.map((locale) => ({
          locale,
          description: snapshot.descriptions[locale]?.trim() || null,
          lines: editableLinesForLocale(snapshot.rows, locale),
        })),
      }).catch(() => undefined);
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushCurrentSnapshot();
    });

    return () => {
      subscription.remove();
      // Navigating away from Lyrics Studio flushes one complete multilingual
      // snapshot in a single transaction: every known language, description,
      // row, order and shared timestamp.
      flushCurrentSnapshot();
    };
  }, []);

  function markLocaleTouched(locale: LocaleCode) {
    knownLocales.current.add(locale);
  }

  function markDirty() {
    dirtyRevision.current += 1;
    setDirty(true);
  }

  function editRows(update: (current: EditableMultilingualLyricRow[]) => EditableMultilingualLyricRow[]) {
    markDirty();
    setRows(update);
  }

  async function switchTrack(nextTrackId: string) {
    if (nextTrackId === trackId) return;
    if (dirty) {
      const saved = await saveDraft(true);
      if (!saved) return;
    }
    setTrackId(nextTrackId);
  }

  function toggleLocale(locale: LocaleCode) {
    setMessage(null);
    setSelectedLocales((current) => {
      if (current.includes(locale)) {
        if (current.length === 1) {
          setMessage({ tone: 'info', text: 'Keep at least one language selected.' });
          return current;
        }
        return current.filter((item) => item !== locale);
      }
      return localeOrder([...current, locale]);
    });
  }

  function replaceRowText(index: number, locale: LocaleCode, text: string) {
    markLocaleTouched(locale);
    editRows((current) => current.map((row, rowIndex) => (
      rowIndex === index
        ? { ...row, texts: { ...row.texts, [locale]: text } }
        : row
    )));
  }

  function replaceRowStart(index: number, startMs: number | null) {
    editRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, startMs } : row
    )));
  }

  function markLine(index: number) {
    if (!rows[index]) return;
    replaceRowStart(index, Math.max(0, Math.round(status.currentTime * 1_000)));
  }

  function addLine() {
    const texts: Record<string, string> = {};
    LOCALES.forEach((item) => { texts[item.value] = ''; });
    editRows((current) => [...current, {
      key: nextRowKey(),
      startMs: null,
      endMs: null,
      texts,
      lineIds: {},
    }]);
  }

  function deleteLine(index: number) {
    editRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function moveLine(fromIndex: number, toIndex: number) {
    editRows((current) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function seekBy(deltaSeconds: number) {
    const requested = Math.max(0, status.currentTime + deltaSeconds);
    player.seekTo(status.duration > 0 ? Math.min(status.duration, requested) : requested);
  }

  async function saveDraft(silent = false): Promise<boolean> {
    if (!trackId) return true;
    const locales = currentDraftLocales();
    if (!locales.length) return true;
    const revision = dirtyRevision.current;

    if (!silent) {
      setSaving(true);
      setMessage(null);
    }

    try {
      const payload = await saveLyricStudioDraft({
        trackId,
        languages: locales.map((locale) => ({
          locale,
          description: descriptions[locale]?.trim() || null,
          lines: editableLinesForLocale(rows, locale),
        })),
      });
      const saved = payload.languages;

      saved.forEach((draft) => knownLocales.current.add(draft.locale));

      setRows((current) => current.map((row, index) => {
        const lineIds = { ...(row.lineIds ?? {}) };
        saved.forEach((draft) => {
          const lineId = draft.lines[index]?.id;
          if (lineId) lineIds[draft.locale] = lineId;
        });
        return { ...row, lineIds };
      }));

      setLanguageStates((current) => {
        const next = { ...current };
        saved.forEach((draft) => {
          next[draft.locale] = draft.publicationStatus === 'published' ? 'published_draft' : 'draft';
        });
        return next;
      });

      if (dirtyRevision.current === revision) setDirty(false);
      if (!silent) setMessage({ tone: 'success', text: 'Draft saved.' });
      return true;
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error, 'Could not save the complete lyric draft.') });
      return false;
    } finally {
      if (!silent) setSaving(false);
    }
  }

  async function publishLyrics() {
    if (!trackId) return;
    const localesToPublish = currentDraftLocales();
    if (!localesToPublish.length) return;

    if (!rows.length) {
      setMessage({ tone: 'error', text: 'Add at least one lyric line before publishing.' });
      return;
    }

    if (rows.some((row) => row.startMs === null)) {
      setMessage({ tone: 'error', text: 'Set a synchronized start time for every line before publishing.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveDraft(true);
      if (!saved) return;

      await publishLyricLanguages(trackId, localesToPublish);
      setLanguageStates((current) => {
        const next = { ...current };
        localesToPublish.forEach((locale) => { next[locale] = 'published'; });
        return next;
      });
      dirtyRevision.current += 1;
      setDirty(false);
      setMessage({
        tone: 'success',
        text: `Published ${localesToPublish.map(localeLabel).join(', ')} lyrics to CHC.`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error, 'Could not publish the lyrics.') });
    } finally {
      setSaving(false);
    }
  }

  async function importLrc(locale: LocaleCode, pickedFile?: File) {
    try {
      markLocaleTouched(locale);
      const contents = pickedFile ? await pickedFile.text() : await importLrcFile();
      if (contents === null) return;
      const parsed = createLyricLinesFromText(
        contents
          .split(/\r?\n/)
          .map((line) => line.replace(/^\s*\[[^\]]+\]\s*/, ''))
          .join('\n'),
      );
      const timed = parseLrc(contents);
      const imported = timed.length ? timed : parsed;

      if (!imported.length) {
        setMessage({ tone: 'error', text: 'That file has no lyric lines in it.' });
        return;
      }

      if (rows.length && imported.length !== rows.length) {
        if (!(await confirmAction(
          'Change the shared lyric row count?',
          `${localeLabel(locale)} has ${imported.length} imported rows while the shared timeline has ${rows.length}. CHC will resize the shared timeline and keep other languages aligned with blank rows where needed. Existing timestamps are cleared because the row structure changed.`,
          'Resize rows',
        ))) return;

        const nextCount = imported.length;
        editRows((current) => Array.from({ length: nextCount }, (_, index) => {
          const previous = current[index];
          const texts: Record<string, string> = {};
          LOCALES.forEach((item) => {
            texts[item.value] = item.value === locale
              ? (imported[index]?.text ?? '')
              : (previous?.texts[item.value] ?? '');
          });
          return {
            key: previous?.key ?? nextRowKey(),
            startMs: imported[index]?.startMs ?? null,
            endMs: imported[index]?.endMs ?? null,
            texts,
            lineIds: previous?.lineIds ?? {},
          };
        }));

        setMessage({ tone: 'success', text: `Imported ${localeLabel(locale)} and resized the shared lyric timeline.` });
        return;
      }

      if (!rows.length) {
        const nextRows = imported.map((line) => {
          const texts: Record<string, string> = {};
          LOCALES.forEach((item) => { texts[item.value] = ''; });
          texts[locale] = line.text;
          return {
            key: nextRowKey(),
            startMs: line.startMs,
            endMs: line.endMs,
            texts,
            lineIds: {},
          };
        });
        editRows(() => nextRows);
      } else {
        const hasTiming = rows.some((row) => row.startMs !== null);
        editRows((current) => current.map((row, index) => ({
          ...row,
          startMs: hasTiming ? row.startMs : imported[index]?.startMs ?? row.startMs,
          endMs: hasTiming ? row.endMs : imported[index]?.endMs ?? row.endMs,
          texts: { ...row.texts, [locale]: imported[index]?.text ?? '' },
        })));
      }

      setMessage({ tone: 'success', text: `Imported ${localeLabel(locale)} into the shared lyric timeline.` });
    } catch (error) {
      setMessage({ tone: 'error', text: `Could not import LRC: ${errorText(error, 'unknown error')}` });
    }
  }

  async function exportLrc(locale: LocaleCode) {
    try {
      const lines = editableLinesForLocale(rows, locale).filter((line) => line.text.trim());
      await exportLrcFile(`${selectedTrack?.title ?? 'lyrics'}-${locale}`, formatLrc(lines));
    } catch (error) {
      setMessage({ tone: 'error', text: `Could not export LRC: ${errorText(error, 'unknown error')}` });
    }
  }

  async function usePastedLyrics() {
    const parsedByLocale = new Map<LocaleCode, EditableLyricLine[]>();
    editableSelected.forEach((locale) => {
      const text = pasteTexts[locale] ?? '';
      if (text.trim()) parsedByLocale.set(locale, createLyricLinesFromText(text));
    });

    if (!parsedByLocale.size) {
      setMessage({ tone: 'info', text: 'Paste lyrics into at least one selected language first.' });
      return;
    }

    parsedByLocale.forEach((_lines, locale) => markLocaleTouched(locale));

    const lineCount = Math.max(
      0,
      ...[...parsedByLocale.values()].map((lines) => lines.length),
    );
    if (!lineCount) return;

    if (rows.length && rows.length !== lineCount) {
      if (!(await confirmAction(
        'Replace the synced line structure?',
        `The shared timeline has ${rows.length} rows and the pasted lyrics need ${lineCount}. CHC will resize the shared timeline, keep untouched language text where the same row still exists, and fill missing language rows with blanks. Existing timestamps are cleared because the row structure changed.`,
        'Replace rows',
      ))) return;

      const nextRows = Array.from({ length: lineCount }, (_, index) => {
        const previous = rows[index];
        const texts: Record<string, string> = {};
        LOCALES.forEach((item) => {
          const pasted = parsedByLocale.get(item.value);
          texts[item.value] = pasted
            ? (pasted[index]?.text ?? '')
            : (previous?.texts[item.value] ?? '');
        });
        return {
          key: previous?.key ?? nextRowKey(),
          startMs: null,
          endMs: null,
          texts,
          lineIds: previous?.lineIds ?? {},
        };
      });
      editRows(() => nextRows);
    } else if (!rows.length) {
      const nextRows = Array.from({ length: lineCount }, (_, index) => {
        const texts: Record<string, string> = {};
        LOCALES.forEach((item) => {
          texts[item.value] = parsedByLocale.get(item.value)?.[index]?.text ?? '';
        });
        return {
          key: nextRowKey(),
          startMs: null,
          endMs: null,
          texts,
          lineIds: {},
        };
      });
      editRows(() => nextRows);
    } else {
      editRows((current) => current.map((row, index) => {
        const texts = { ...row.texts };
        parsedByLocale.forEach((lines, locale) => {
          texts[locale] = lines[index]?.text ?? '';
        });
        return { ...row, texts };
      }));
    }

    setPasteTexts((current) => {
      const next = { ...current };
      parsedByLocale.forEach((_lines, locale) => { next[locale] = ''; });
      return next;
    });
    setMessage(null);
  }

  async function clearTiming() {
    if (!timedCount) return;
    if (!(await confirmAction('Clear all timing?', 'This keeps every language and lyric line but removes the shared timestamps.', 'Clear timing'))) return;
    editRows((current) => current.map((row) => ({ ...row, startMs: null, endMs: null })));
  }

  if (loading) return <Loading label="Loading your editable tracks…" />;

  if (!tracks.length) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, compact && styles.contentCompact]}>
        <PageHeader title="Lyrics Studio" subtitle="Add several lyric languages and synchronize them together on one timeline." />
        {message?.tone === 'error' ? (
          <Banner tone="error">{message.text}</Banner>
        ) : (
          <Banner tone="info">
            No submitted music tracks are ready yet. Submit a music release first; its tracks will appear here as soon as the submission creates them.
          </Banner>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, compact && styles.contentCompact]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!dragging}
      >
        <PageHeader
          title="Lyrics Studio"
          subtitle="Choose a track and all of its lyric languages together. Every selected language shares the same line order and timestamps."
        />

        <View style={[styles.panel, compact && styles.panelCompact]}>
          <Text style={styles.sectionTitle}>1. Choose a track</Text>
          <View style={[styles.trackList, compact && styles.trackListCompact]}>
            {tracks.map((track) => (
              <Pressable
                key={track.id}
                style={[styles.trackCard, compact && styles.trackCardCompact, track.id === trackId && styles.trackCardSelected]}
                onPress={() => void switchTrack(track.id)}
              >
                <Text style={styles.trackTitle}>{track.title}</Text>
                <Text style={styles.muted}>
                  {track.publicationStatus}
                  {track.durationMs ? ` · ${(track.durationMs / 1_000).toFixed(1)}s` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.panel, compact && styles.panelCompact]}>
          <Text style={styles.sectionTitle}>2. Choose your languages</Text>
          <Text style={styles.muted}>
            Pick every language that belongs to these lyrics. They are edited side by side and synchronized as one lyric timeline, not as separate timing packs.
          </Text>
          <View style={styles.languageChips}>
            {LOCALES.map((item) => {
              const selected = selectedLocales.includes(item.value);
              const state = languageStates[item.value] ?? 'none';
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleLocale(item.value)}
                  style={[styles.languageChip, selected && styles.languageChipSelected]}
                >
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    <Text style={styles.checkboxMark}>{selected ? '✓' : ''}</Text>
                  </View>
                  <Text style={[styles.languageChipText, selected && styles.languageChipTextSelected]}>{item.label}</Text>
                  {state !== 'none' && (
                    <Text style={[styles.languageState, (state === 'published' || state === 'published_draft') && styles.languageStatePublished]}>
                      {state === 'published_draft' ? 'Published · Draft' : state === 'published' ? 'Published' : 'Draft saved'}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.panel, compact && styles.panelCompact]}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>3. Add the lyrics</Text>
            <Text style={styles.muted}>
              Paste one row per shared lyric moment. A language can be blank on any row — for example, an English/Arabic track can alternate languages while keeping one shared timeline.
            </Text>
          </View>

          <View style={styles.languagePasteGrid}>
            {selectedLocales.map((locale) => {
              const language = LOCALES.find((item) => item.value === locale);
              const isPublished = languageStates[locale] === 'published' || languageStates[locale] === 'published_draft';
              return (
                <View key={locale} style={styles.languagePasteCard}>
                  <View style={styles.languagePasteHeader}>
                    <View>
                      <Text style={styles.languagePasteTitle}>{language?.label ?? locale}</Text>
                      {isPublished && <Text style={styles.publishedSmall}>Published · editable</Text>}
                    </View>
                    <View style={styles.inlineButtons}>
                      {Platform.OS === 'web' ? (
                        <label style={{
                          position: 'relative',
                          display: 'inline-flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: RADII.sm,
                          padding: '6px 8px',
                          overflow: 'hidden',
                        }}>
                          <Text style={styles.miniButtonText}>Import LRC</Text>
                          <input
                            type="file"
                            aria-label={`Import ${locale} LRC file`}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = '';
                              if (file) {
                                if (!/\.(lrc|txt)$/i.test(file.name)) {
                                  setMessage({ tone: 'error', text: 'Choose an LRC or TXT lyrics file.' });
                                } else {
                                  void importLrc(locale, file);
                                }
                              }
                            }}
                            style={{
                              display: 'block',
                              position: 'absolute',
                              inset: 0,
                              opacity: 0,
                              width: '100%',
                              height: '100%',
                              cursor: 'pointer',
                              fontSize: 16,
                            }}
                          />
                        </label>
                      ) : (
                        <Pressable style={styles.miniButton} onPress={() => void importLrc(locale)}>
                          <Text style={styles.miniButtonText}>Import LRC</Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={[styles.miniButton, !rows.length && styles.disabledButton]}
                        disabled={!rows.length}
                        onPress={() => void exportLrc(locale)}
                      >
                        <Text style={styles.miniButtonText}>Export LRC</Text>
                      </Pressable>
                    </View>
                  </View>

                  <TextInput
                    style={[styles.pasteBox, language?.rtl && styles.arabic, locale === 'cop' && styles.coptic]}
                    placeholder={`Paste ${language?.label ?? locale} lyrics here…`}
                    placeholderTextColor={COLORS.muted}
                    value={pasteTexts[locale] ?? ''}
                    onChangeText={(text) => setPasteTexts((current) => ({ ...current, [locale]: text }))}
                    multiline
                  />

                  <TextInput
                    style={[styles.description, language?.rtl && styles.arabic, locale === 'cop' && styles.coptic]}
                    placeholder="Optional description"
                    placeholderTextColor={COLORS.muted}
                    value={descriptions[locale] ?? ''}
                    onChangeText={(value) => {
                      markLocaleTouched(locale);
                      setDescriptions((current) => ({ ...current, [locale]: value }));
                      markDirty();
                    }}
                    multiline
                  />
                </View>
              );
            })}
          </View>

          <Pressable
            style={[styles.secondaryButton, !editableSelected.length && styles.disabledButton]}
            disabled={!editableSelected.length}
            onPress={() => void usePastedLyrics()}
          >
            <Text style={styles.secondaryButtonText}>Use these language lines</Text>
          </Pressable>
        </View>

        <View style={[styles.syncPanel, compact && styles.panelCompact]}>
          <View style={styles.rowBetween}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>4. Sync the lines</Text>
              <Text style={styles.muted}>
                Every block is one shared timestamp across the languages. Any language may be blank on any block. Edit text directly here, add lines whenever you need them, and drag the six-dot handle to put blocks in the exact order you want.
              </Text>
            </View>
          </View>

          {publishedLocales.length > 0 && (
            <Banner tone="info">
              Published lyrics stay live while you edit. Your changes are autosaved as a draft and replace the live lyrics only when you press Publish lyrics.
            </Banner>
          )}

          {draftLoading ? (
            <Banner tone="info">Loading the selected track’s lyric languages…</Banner>
          ) : (
            <>
              <View style={styles.playbackCard}>
                <View style={styles.playerTop}>
                  <View style={styles.playerText}>
                    <Text style={styles.playbackTitle}>Playback</Text>
                    <Text style={styles.timeText}>{formatTime(status.currentTime)} / {formatTime(status.duration)}</Text>
                  </View>
                  <Text style={styles.syncCount}>{timedCount} / {rows.length} shared lines timed</Text>
                </View>

                <Pressable
                  accessibilityRole="adjustable"
                  disabled={!audioUrl || status.duration <= 0}
                  onLayout={(event) => setTimelineWidth(event.nativeEvent.layout.width)}
                  onPress={(event) => {
                    if (!audioUrl || status.duration <= 0 || timelineWidth <= 0) return;
                    const locationX = Number(event.nativeEvent.locationX ?? 0);
                    player.seekTo(Math.max(0, Math.min(status.duration, (locationX / timelineWidth) * status.duration)));
                  }}
                  style={styles.timeline}
                >
                  <View style={[styles.timelineProgress, { width: `${progress * 100}%` }]} />
                </Pressable>

                <View style={styles.playerActions}>
                  <Pressable
                    style={[styles.secondaryButton, !audioUrl && styles.disabledButton]}
                    disabled={!audioUrl}
                    onPress={() => seekBy(-5)}
                  >
                    <Text style={styles.secondaryButtonText}>−5s</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, !audioUrl && styles.disabledButton]}
                    disabled={!audioUrl}
                    onPress={() => seekBy(-1)}
                  >
                    <Text style={styles.secondaryButtonText}>−1s</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.playButton, !audioUrl && styles.disabledButton]}
                    disabled={!audioUrl}
                    onPress={() => (status.playing ? player.pause() : player.play())}
                  >
                    <Text style={styles.playButtonText}>{status.playing ? 'Pause' : 'Play'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, !audioUrl && styles.disabledButton]}
                    disabled={!audioUrl}
                    onPress={() => seekBy(1)}
                  >
                    <Text style={styles.secondaryButtonText}>+1s</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, !audioUrl && styles.disabledButton]}
                    disabled={!audioUrl}
                    onPress={() => seekBy(5)}
                  >
                    <Text style={styles.secondaryButtonText}>+5s</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.markNextButton,
                      (!audioUrl || nextUntimedIndex < 0) && styles.disabledButton,
                    ]}
                    disabled={!audioUrl || nextUntimedIndex < 0}
                    onPress={() => markLine(nextUntimedIndex)}
                  >
                    <Text style={styles.markNextText}>
                      {nextUntimedIndex >= 0 ? `Mark next · Line ${nextUntimedIndex + 1}` : 'All lines timed'}
                    </Text>
                  </Pressable>
                </View>

                {!audioUrl && selectedTrack && <Text style={styles.error}>This track does not have a playable music asset yet.</Text>}
                {!!status.error && <Text style={styles.error}>{status.error}</Text>}
              </View>

              {!!rows.length && (
                <View style={styles.rowBetween}>
                  <Text style={styles.muted}>The gold block is the line currently playing. Drag only from the six-dot handle.</Text>
                  <Pressable
                    style={[styles.textButton, !timedCount && styles.disabledButton]}
                    disabled={!timedCount}
                    onPress={() => void clearTiming()}
                  >
                    <Text style={styles.textButtonText}>Clear all timing</Text>
                  </Pressable>
                </View>
              )}

              <ReorderableList
                items={rows}
                getKey={(row) => row.key}
                onMove={moveLine}
                onDragActiveChange={setDragging}
                renderItem={(row, index, dragHandle, rowDragging) => (
                  <MultilingualLyricRow
                    row={row}
                    sequence={index + 1}
                    active={index === activeIndex}
                    languages={selectedLocales.map((locale) => {
                      const language = LOCALES.find((item) => item.value === locale);
                      return {
                        value: locale,
                        label: language?.label ?? locale,
                        rtl: language?.rtl,
                        published: languageStates[locale] === 'published' || languageStates[locale] === 'published_draft',
                      };
                    })}
                    dragHandle={dragHandle}
                    dragging={rowDragging}
                    onTextChange={(locale, text) => replaceRowText(index, locale, text)}
                    onStartChange={(startMs) => replaceRowStart(index, startMs)}
                    onMark={() => markLine(index)}
                    onSeek={() => row.startMs !== null && player.seekTo(row.startMs / 1_000)}
                    onDelete={() => deleteLine(index)}
                  />
                )}
                style={styles.lines}
              />

              {!rows.length && (
                <View style={styles.emptySync}>
                  <Text style={styles.muted}>Paste language lines above or use the Add line button below to start.</Text>
                </View>
              )}
            </>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={dragging}
            onPress={addLine}
            style={[styles.addLineFull, dragging && styles.disabledButton]}
          >
            <Text style={styles.addLineFullText}>+ Add line</Text>
          </Pressable>

          <View style={styles.publishFooter}>
            <Text style={styles.autosaveNote}>
              Lyrics are automatically saved as a draft when you exit.
              {dirty ? ' Saving draft…' : ''}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={saving || !trackId || !selectedLocales.length || dragging}
              onPress={() => void publishLyrics()}
              style={[styles.primaryButton, (saving || !trackId || !selectedLocales.length || dragging) && styles.disabledButton]}
            >
              <Text style={styles.primaryButtonText}>{saving ? 'Publishing…' : 'Publish lyrics'}</Text>
            </Pressable>
          </View>

          {!!message && <Banner tone={message.tone}>{message.text}</Banner>}
        </View>

        {!!rows.length && (
          <View style={[styles.previewPanel, compact && styles.panelCompact]}>
            <Text style={styles.sectionTitle}>Live multilingual preview</Text>
            <Text style={styles.muted}>All chosen languages advance together on the same timestamp.</Text>
            <View style={styles.preview}>
              {rows.map((row, index) => (
                <Pressable
                  key={`preview-${row.key}`}
                  onPress={() => row.startMs !== null && player.seekTo(row.startMs / 1_000)}
                  style={[styles.previewRow, index === activeIndex && styles.previewRowActive]}
                >
                  {selectedLocales.map((locale) => {
                    const language = LOCALES.find((item) => item.value === locale);
                    return (
                      <View key={locale} style={styles.previewLanguage}>
                        <Text style={styles.previewLanguageLabel}>{language?.label ?? locale}</Text>
                        <Text
                          style={[
                            styles.previewLine,
                            index === activeIndex && styles.previewActive,
                            language?.rtl && styles.arabic,
                            locale === 'cop' && styles.coptic,
                          ]}
                        >
                          {row.texts[locale] || '—'}
                        </Text>
                      </View>
                    );
                  })}
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  content: {
    width: '100%',
    maxWidth: 1320,
    alignSelf: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 80,
  },
  contentCompact: { paddingHorizontal: 16, paddingTop: 18, gap: 22, paddingBottom: 40 },
  panel: {
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  panelCompact: { padding: 0, paddingTop: 16, borderRadius: 0, backgroundColor: 'transparent', borderWidth: 0, borderTopWidth: 1, borderTopColor: COLORS.border },
  syncPanel: {
    gap: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  previewPanel: {
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.navyDark,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  sectionCopy: { flex: 1, minWidth: 240, gap: 4 },
  muted: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  trackList: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  trackListCompact: { gap: 0 },
  trackCard: {
    minWidth: 220,
    flexGrow: 1,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black,
  },
  trackCardSelected: { borderColor: COLORS.gold, backgroundColor: COLORS.navy },
  trackCardCompact: { minWidth: '100%', paddingHorizontal: 0, paddingVertical: 12, borderRadius: 0, borderWidth: 0, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: 'transparent' },
  trackTitle: { color: COLORS.white, fontWeight: '800', fontSize: 15 },

  languageChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  languageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black,
  },
  languageChipSelected: { borderColor: COLORS.gold, backgroundColor: COLORS.navy },
  languageChipText: { color: COLORS.muted, fontWeight: '700', fontSize: 13 },
  languageChipTextSelected: { color: COLORS.white },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  checkboxMark: { color: COLORS.black, fontWeight: '900', fontSize: 12, lineHeight: 14 },
  languageState: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  languageStatePublished: { color: COLORS.goldBright },

  languagePasteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, alignItems: 'stretch' },
  languagePasteCard: {
    flexGrow: 1,
    flexBasis: 280,
    minWidth: 250,
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black,
  },
  languagePasteHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  languagePasteTitle: { color: COLORS.white, fontWeight: '900', fontSize: 15 },
  publishedSmall: { color: COLORS.goldBright, fontSize: 10, fontWeight: '800', marginTop: 2 },
  pasteBox: {
    minHeight: 160,
    textAlignVertical: 'top',
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    color: COLORS.white,
    backgroundColor: COLORS.surface,
  },
  description: {
    minHeight: 58,
    textAlignVertical: 'top',
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: COLORS.surface,
  },
  readOnly: { opacity: 0.65, backgroundColor: COLORS.navyDark },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  coptic: { fontFamily: TYPOGRAPHY.coptic },

  rowBetween: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
  },
  inlineButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  syncHeaderActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, alignItems: 'center' },
  primaryButton: {
    backgroundColor: COLORS.gold,
    borderRadius: RADII.sm,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignSelf: 'flex-start',
  },
  primaryButtonText: { color: COLORS.black, fontWeight: '900' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: RADII.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  secondaryButtonText: { color: COLORS.goldBright, fontWeight: '800' },
  miniButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  miniButtonText: { color: COLORS.goldBright, fontWeight: '800', fontSize: 10 },
  addLineFull: {
    width: '100%',
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.black,
  },
  addLineFullText: { color: COLORS.goldBright, fontWeight: '900', fontSize: 14 },
  publishFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  autosaveNote: { flex: 1, minWidth: 220, color: COLORS.muted, fontSize: 12, textAlign: 'right' },
  disabledButton: { opacity: 0.35 },

  playbackCard: {
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: COLORS.navyDark,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  playerTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  playerText: { gap: 3 },
  playbackTitle: { color: COLORS.white, fontSize: 15, fontWeight: '900' },
  timeText: { color: COLORS.goldBright, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  syncCount: { color: COLORS.muted, fontSize: 12, fontWeight: '800' },
  timeline: {
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.black,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  timelineProgress: { height: '100%', backgroundColor: COLORS.gold },
  playerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  playButton: {
    minWidth: 92,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.sm,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
  },
  playButtonText: { color: COLORS.black, fontWeight: '900' },
  markNextButton: {
    backgroundColor: COLORS.gold,
    borderRadius: RADII.sm,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginLeft: 'auto',
  },
  markNextText: { color: COLORS.black, fontWeight: '900' },
  lines: { gap: SPACING.sm },
  emptySync: { gap: SPACING.sm, alignItems: 'flex-start' },
  textButton: { paddingHorizontal: 8, paddingVertical: 6 },
  textButtonText: { color: COLORS.goldBright, fontWeight: '800', fontSize: 12 },

  preview: { gap: SPACING.sm, paddingVertical: SPACING.sm },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    opacity: 0.65,
  },
  previewRowActive: { opacity: 1, borderColor: COLORS.gold, backgroundColor: COLORS.surface },
  previewLanguage: { flexGrow: 1, flexBasis: 220, minWidth: 180, gap: 3 },
  previewLanguageLabel: { color: COLORS.goldBright, fontSize: 10, fontWeight: '800' },
  previewLine: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 17, lineHeight: 25 },
  previewActive: { color: COLORS.white, fontWeight: '800' },
  error: { color: '#FF8B8B', fontWeight: '700' },
});
