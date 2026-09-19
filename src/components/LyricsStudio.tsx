import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Banner, Loading, PageHeader } from '@/components/ui';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { resolveTrackAudio } from '@/services/mediaService';
import { listEditableTracks, loadLyricDraft, saveLyricDraft } from '@/services/lyricsService';
import type { EditableLyricLine, LocaleCode, LyricEditorTrack } from '@/types/lyrics';
import { confirmAction } from '@/utils/dialogs';
import { exportLrcFile, importLrcFile } from '@/utils/lrcFiles';
import {
  createLyricLinesFromText,
  findActiveLyricLineIndex,
  formatLrc,
  parseLrc,
  renumberLyricLines,
} from '@/utils/synchronizedLyrics';
import { ChoiceChips } from './ChoiceChips';
import { LyricLineRow } from './LyricLineRow';

const LOCALES: Array<{ value: LocaleCode; label: string }> = [
  { value: 'cop', label: 'Coptic' },
  { value: 'ar', label: 'Arabic' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
];

type LanguageState = 'none' | 'draft' | 'published';
type Message = { tone: 'success' | 'error'; text: string } | null;

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

export function LyricsStudio() {
  const [tracks, setTracks] = useState<LyricEditorTrack[]>([]);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [locale, setLocale] = useState<LocaleCode>('cop');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<EditableLyricLine[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [dirty, setDirty] = useState(false);
  const [published, setPublished] = useState(false);
  const [languageStates, setLanguageStates] = useState<Record<string, LanguageState>>({});
  const [timelineWidth, setTimelineWidth] = useState(0);

  const selectedTrack = tracks.find((track) => track.id === trackId) ?? null;
  const audioUrl = selectedTrack ? resolveTrackAudio(selectedTrack) : null;
  const player = useAudioPlayer(null, { updateInterval: 80 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    player.pause();
    player.replace(audioUrl);
  }, [audioUrl, player]);

  const activeIndex = useMemo(
    () => findActiveLyricLineIndex(lines, Math.max(0, Math.round(status.currentTime * 1_000))),
    [lines, status.currentTime],
  );
  const timedCount = useMemo(() => lines.filter((line) => line.startMs !== null).length, [lines]);
  const nextUntimedIndex = useMemo(() => lines.findIndex((line) => line.startMs === null), [lines]);
  const progress = status.duration > 0 ? Math.min(1, Math.max(0, status.currentTime / status.duration)) : 0;

  const localeOptions = useMemo(
    () => LOCALES.map((item) => ({
      ...item,
      label: languageStates[item.value] === 'published'
        ? `${item.label} · Published`
        : languageStates[item.value] === 'draft'
          ? `${item.label} · Saved`
          : item.label,
    })),
    [languageStates],
  );

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

    Promise.all(LOCALES.map(async (item) => ({
      locale: item.value,
      draft: await loadLyricDraft(trackId, item.value),
    })))
      .then((results) => {
        if (cancelled) return;
        const states: Record<string, LanguageState> = {};
        results.forEach(({ locale: language, draft }) => {
          states[language] = !draft ? 'none' : draft.publicationStatus === 'published' ? 'published' : 'draft';
        });
        setLanguageStates(states);
      })
      .catch(() => {
        // The selected-language loader below displays the actionable error.
      });

    return () => { cancelled = true; };
  }, [trackId]);

  useEffect(() => {
    if (!trackId) return;
    setMessage(null);
    loadLyricDraft(trackId, locale)
      .then((draft) => {
        setDescription(draft?.description ?? '');
        setLines(draft?.lines ?? []);
        setPublished(draft?.publicationStatus === 'published');
        setDirty(false);
      })
      .catch((error) => setMessage({ tone: 'error', text: errorText(error, 'Could not load this lyric set.') }));
  }, [trackId, locale]);

  function editLines(update: (current: EditableLyricLine[]) => EditableLyricLine[]) {
    setDirty(true);
    setLines(update);
  }

  async function switchTo(apply: () => void) {
    if (dirty && !(await confirmAction('Discard unsaved lyrics?', 'You have changes that are not saved to this language.', 'Discard'))) return;
    apply();
  }

  function replaceLine(index: number, line: EditableLyricLine) {
    editLines((current) => current.map((item, itemIndex) => (itemIndex === index ? line : item)));
  }

  function markLine(index: number) {
    replaceLine(index, {
      ...lines[index],
      startMs: Math.max(0, Math.round(status.currentTime * 1_000)),
    });
  }

  function moveLine(index: number, delta: -1 | 1) {
    editLines((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return renumberLyricLines(next);
    });
  }

  function seekBy(deltaSeconds: number) {
    const requested = Math.max(0, status.currentTime + deltaSeconds);
    player.seekTo(status.duration > 0 ? Math.min(status.duration, requested) : requested);
  }

  async function save() {
    if (!trackId) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveLyricDraft({
        trackId,
        locale,
        description: description.trim() || null,
        lines,
      });
      setLines(saved.lines);
      setDescription(saved.description ?? '');
      setPublished(saved.publicationStatus === 'published');
      setLanguageStates((current) => ({
        ...current,
        [locale]: saved.publicationStatus === 'published' ? 'published' : 'draft',
      }));
      setDirty(false);
      setMessage({ tone: 'success', text: 'Lyrics saved.' });
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error, 'Could not save lyrics.') });
    } finally {
      setSaving(false);
    }
  }

  async function importLrc() {
    try {
      const contents = await importLrcFile();
      if (contents === null) return;
      const parsed = parseLrc(contents);
      if (!parsed.length) {
        setMessage({ tone: 'error', text: 'That file has no lyric lines in it.' });
        return;
      }
      if (lines.length && !(await confirmAction('Replace lines?', 'Importing replaces the current editable line list.', 'Replace'))) return;
      editLines(() => parsed);
      setMessage(null);
    } catch (error) {
      setMessage({ tone: 'error', text: `Could not import LRC: ${errorText(error, 'unknown error')}` });
    }
  }

  async function exportLrc() {
    try {
      await exportLrcFile(`${selectedTrack?.title ?? 'lyrics'}-${locale}`, formatLrc(lines));
    } catch (error) {
      setMessage({ tone: 'error', text: `Could not export LRC: ${errorText(error, 'unknown error')}` });
    }
  }

  async function splitPastedLyrics() {
    const nextLines = createLyricLinesFromText(pasteText);
    if (!nextLines.length) return;
    if (lines.length && !(await confirmAction('Replace lines?', 'This replaces the current editable line list.', 'Replace'))) return;
    editLines(() => nextLines);
    setPasteText('');
  }

  async function clearTiming() {
    if (!timedCount) return;
    if (!(await confirmAction('Clear all timing?', 'This keeps every lyric line but removes all timestamps.', 'Clear timing'))) return;
    editLines((current) => current.map((line) => ({ ...line, startMs: null, endMs: null })));
  }

  if (loading) return <Loading label="Loading your editable tracks…" />;

  if (!tracks.length) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <PageHeader title="Lyrics Studio" subtitle="Add lyrics in each language and synchronize them to your track." />
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader
          title="Lyrics Studio"
          subtitle="Choose a track, add a language, paste the lyrics, then tap along with the music. That’s it."
        />

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>1. Choose a track</Text>
          <View style={styles.trackList}>
            {tracks.map((track) => (
              <Pressable
                key={track.id}
                style={[styles.trackCard, track.id === trackId && styles.trackCardSelected]}
                onPress={() => { if (track.id !== trackId) void switchTo(() => setTrackId(track.id)); }}
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

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>2. Choose a language</Text>
          <Text style={styles.muted}>
            Each language has its own lyric set. You can come back and add as many languages as you need.
          </Text>
          <ChoiceChips
            options={localeOptions}
            value={locale}
            onChange={(next) => { if (next !== locale) void switchTo(() => setLocale(next)); }}
          />
          <TextInput
            style={styles.description}
            placeholder="Optional description"
            placeholderTextColor={COLORS.muted}
            value={description}
            onChangeText={(value) => { setDescription(value); setDirty(true); }}
            multiline
          />
        </View>

        <View style={styles.panel}>
          <View style={styles.rowBetween}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>3. Add the lyrics</Text>
              <Text style={styles.muted}>Paste one lyric line per line, or import an existing LRC file.</Text>
            </View>
            <View style={styles.inlineButtons}>
              <Pressable style={styles.secondaryButton} onPress={() => void importLrc()}>
                <Text style={styles.secondaryButtonText}>Import LRC</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, !lines.length && styles.disabledButton]}
                disabled={!lines.length}
                onPress={() => void exportLrc()}
              >
                <Text style={styles.secondaryButtonText}>Export LRC</Text>
              </Pressable>
            </View>
          </View>
          <TextInput
            style={styles.pasteBox}
            placeholder="Paste lyrics here, one line per lyric line…"
            placeholderTextColor={COLORS.muted}
            value={pasteText}
            onChangeText={setPasteText}
            multiline
          />
          <Pressable
            style={[styles.secondaryButton, !pasteText.trim() && styles.disabledButton]}
            disabled={!pasteText.trim()}
            onPress={() => void splitPastedLyrics()}
          >
            <Text style={styles.secondaryButtonText}>Use these lines</Text>
          </Pressable>
        </View>

        <View style={styles.syncPanel}>
          <View style={styles.rowBetween}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>4. Synchronize the lines</Text>
              <Text style={styles.muted}>
                Press Play, then tap Mark next each time a new line begins. Use ±1s to fine-tune quickly, or edit any timestamp directly.
              </Text>
            </View>
            <Pressable
              style={[styles.primaryButton, (saving || !trackId || published) && styles.disabledButton]}
              disabled={saving || !trackId || published}
              onPress={() => void save()}
            >
              <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : dirty ? 'Save lyrics •' : 'Save lyrics'}</Text>
            </Pressable>
          </View>

          <View style={styles.playbackCard}>
            <View style={styles.playerTop}>
              <View style={styles.playerText}>
                <Text style={styles.playbackTitle}>Playback</Text>
                <Text style={styles.timeText}>{formatTime(status.currentTime)} / {formatTime(status.duration)}</Text>
              </View>
              <Text style={styles.syncCount}>
                {timedCount} / {lines.length} lines timed
              </Text>
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
                  (!audioUrl || nextUntimedIndex < 0 || published) && styles.disabledButton,
                ]}
                disabled={!audioUrl || nextUntimedIndex < 0 || published}
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

          {published && (
            <Banner tone="info">
              The {LOCALES.find((item) => item.value === locale)?.label ?? locale} lyrics are already published and cannot be edited here.
              Choose another language to add another lyric set.
            </Banner>
          )}

          {!!lines.length && (
            <View style={styles.rowBetween}>
              <Text style={styles.muted}>Tip: the gold row is the line currently playing.</Text>
              <Pressable
                style={[styles.textButton, !timedCount && styles.disabledButton]}
                disabled={!timedCount || published}
                onPress={() => void clearTiming()}
              >
                <Text style={styles.textButtonText}>Clear all timing</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.lines}>
            {lines.map((line, index) => (
              <LyricLineRow
                key={line.id ?? `${line.sequence}-${index}`}
                line={line}
                active={index === activeIndex}
                canMoveUp={index > 0}
                canMoveDown={index < lines.length - 1}
                onChange={(next) => replaceLine(index, next)}
                onMark={() => markLine(index)}
                onSeek={() => line.startMs !== null && player.seekTo(line.startMs / 1_000)}
                onMoveUp={() => moveLine(index, -1)}
                onMoveDown={() => moveLine(index, 1)}
                onDelete={() => editLines((current) => renumberLyricLines(current.filter((_, itemIndex) => itemIndex !== index)))}
              />
            ))}
          </View>

          {!lines.length && <Text style={styles.muted}>Add lyric lines above to start synchronizing.</Text>}
          {!!message && <Banner tone={message.tone}>{message.text}</Banner>}
        </View>

        {!!lines.length && (
          <View style={styles.previewPanel}>
            <Text style={styles.sectionTitle}>Live preview</Text>
            <Text style={styles.muted}>This is how the timing feels. Tap any timed line to jump to it.</Text>
            <View style={styles.preview}>
              {lines.map((line, index) => (
                <Pressable key={`preview-${line.id ?? index}`} onPress={() => line.startMs !== null && player.seekTo(line.startMs / 1_000)}>
                  <Text
                    style={[
                      styles.previewLine,
                      index === activeIndex && styles.previewActive,
                      locale === 'ar' && styles.arabic,
                    ]}
                  >
                    {line.text}
                  </Text>
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
    maxWidth: 1180,
    alignSelf: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 80,
  },
  panel: {
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
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
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 20, fontWeight: '700' },
  sectionCopy: { flex: 1, minWidth: 240, gap: 4 },
  muted: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  trackList: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
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
  trackTitle: { color: COLORS.white, fontWeight: '800', fontSize: 15 },
  description: {
    minHeight: 72,
    textAlignVertical: 'top',
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: COLORS.black,
  },
  pasteBox: {
    minHeight: 130,
    textAlignVertical: 'top',
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    color: COLORS.white,
    backgroundColor: COLORS.black,
  },
  rowBetween: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
  },
  inlineButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
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
  textButton: { paddingHorizontal: 8, paddingVertical: 6 },
  textButtonText: { color: COLORS.goldBright, fontWeight: '800', fontSize: 12 },
  preview: { gap: 10, paddingVertical: SPACING.sm },
  previewLine: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 19, lineHeight: 28, opacity: 0.55 },
  previewActive: { color: COLORS.white, opacity: 1, fontSize: 23, fontWeight: '800' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  error: { color: '#FF8B8B', fontWeight: '700' },
});
