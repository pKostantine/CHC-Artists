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
import type { EditableLyricLine, LocaleCode, LyricEditorTrack, LyricKind } from '@/types/lyrics';
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

const KINDS: Array<{ value: LyricKind; label: string }> = [
  { value: 'original', label: 'Original' },
  { value: 'translation', label: 'Translation' },
  { value: 'transliteration', label: 'Transliteration' },
];

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds || 0);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe - Math.floor(safe)) * 1_000);
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

type Message = { tone: 'success' | 'error'; text: string } | null;

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
}

export function LyricsStudio() {
  const [tracks, setTracks] = useState<LyricEditorTrack[]>([]);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [locale, setLocale] = useState<LocaleCode>('cop');
  const [kind, setKind] = useState<LyricKind>('original');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [lines, setLines] = useState<EditableLyricLine[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [dirty, setDirty] = useState(false);
  // save_track_lyric_draft refuses to overwrite a published set, so say so before any editing.
  const [published, setPublished] = useState(false);

  const selectedTrack = tracks.find((track) => track.id === trackId) ?? null;
  const audioUrl = selectedTrack ? resolveTrackAudio(selectedTrack) : null;
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    player.pause();
    player.replace(audioUrl);
  }, [audioUrl, player]);

  const activeIndex = useMemo(
    () => findActiveLyricLineIndex(lines, Math.max(0, Math.round(status.currentTime * 1_000))),
    [lines, status.currentTime],
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
    setMessage(null);
    loadLyricDraft(trackId, locale, kind)
      .then((draft) => {
        setTitle(draft?.title ?? '');
        setSource(draft?.source ?? '');
        setLines(draft?.lines ?? []);
        setPublished(draft?.publicationStatus === 'published');
        setDirty(false);
      })
      .catch((error) => setMessage({ tone: 'error', text: errorText(error, 'Could not load this lyric set.') }));
  }, [trackId, locale, kind]);

  // Marks unsaved work so switching track, language, or kind can warn first.
  function editLines(update: (current: EditableLyricLine[]) => EditableLyricLine[]) {
    setDirty(true);
    setLines(update);
  }

  async function switchTo(apply: () => void) {
    if (dirty && !(await confirmAction('Discard unsaved lyrics?', 'You have changes that are not saved to this lyric set.', 'Discard'))) return;
    apply();
  }

  function replaceLine(index: number, line: EditableLyricLine) {
    editLines((current) => current.map((item, itemIndex) => (itemIndex === index ? line : item)));
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

  async function save() {
    if (!trackId) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveLyricDraft({
        trackId,
        locale,
        kind,
        syncPrecision: 'line',
        title: title || null,
        source: source || null,
        lines,
      });
      setLines(saved.lines);
      setPublished(saved.publicationStatus === 'published');
      setDirty(false);
      setMessage({ tone: 'success', text: 'Draft saved.' });
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
      await exportLrcFile(`${selectedTrack?.title ?? 'lyrics'}-${locale}-${kind}`, formatLrc(lines));
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

  if (loading) return <Loading label="Loading your editable tracks…" />;

  if (!tracks.length) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <PageHeader title="Lyrics Studio" subtitle="Add and time synchronized lyrics after submitting your music." />
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
        <PageHeader title="Lyrics Studio" subtitle="Add and time synchronized lyrics after submitting your music." />
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Recording</Text>
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
          <Text style={styles.sectionTitle}>Lyric set</Text>
          <Text style={styles.label}>Language</Text>
          <ChoiceChips options={LOCALES} value={locale} onChange={(next) => { if (next !== locale) void switchTo(() => setLocale(next)); }} />
          <Text style={styles.label}>Kind</Text>
          <ChoiceChips options={KINDS} value={kind} onChange={(next) => { if (next !== kind) void switchTo(() => setKind(next)); }} />
          <View style={styles.twoColumn}>
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder="Optional title"
              placeholderTextColor={COLORS.muted}
              value={title}
              onChangeText={(value) => { setTitle(value); setDirty(true); }}
            />
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder="Optional source / credit"
              placeholderTextColor={COLORS.muted}
              value={source}
              onChangeText={(value) => { setSource(value); setDirty(true); }}
            />
          </View>
        </View>

        <View style={styles.playerPanel}>
          <View style={styles.playerText}>
            <Text style={styles.sectionTitle}>Playback & timing</Text>
            <Text style={styles.muted}>{formatTime(status.currentTime)} / {formatTime(status.duration)}</Text>
          </View>
          <View style={styles.playerActions}>
            <Pressable
              style={[styles.primaryButton, !audioUrl && styles.disabledButton]}
              disabled={!audioUrl}
              onPress={() => (status.playing ? player.pause() : player.play())}
            >
              <Text style={styles.primaryButtonText}>{status.playing ? 'Pause' : 'Play'}</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, !audioUrl && styles.disabledButton]}
              disabled={!audioUrl}
              onPress={() => player.seekTo(Math.max(0, status.currentTime - 5))}
            >
              <Text style={styles.secondaryButtonText}>−5s</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, !audioUrl && styles.disabledButton]}
              disabled={!audioUrl}
              onPress={() => {
                const requested = status.currentTime + 5;
                player.seekTo(status.duration > 0 ? Math.min(status.duration, requested) : requested);
              }}
            >
              <Text style={styles.secondaryButtonText}>+5s</Text>
            </Pressable>
          </View>
          {!audioUrl && selectedTrack && <Text style={styles.error}>This track does not have a resolvable published music asset.</Text>}
          {!!status.error && <Text style={styles.error}>{status.error}</Text>}
        </View>

        <View style={styles.panel}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Paste or import</Text>
            <View style={styles.inlineButtons}>
              <Pressable style={styles.secondaryButton} onPress={() => void importLrc()}>
                <Text style={styles.secondaryButtonText}>Import LRC</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, !lines.length && styles.disabledButton]} disabled={!lines.length} onPress={() => void exportLrc()}>
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
          <Pressable style={[styles.secondaryButton, !pasteText.trim() && styles.disabledButton]} disabled={!pasteText.trim()} onPress={() => void splitPastedLyrics()}>
            <Text style={styles.secondaryButtonText}>Split into lines</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <View style={styles.rowBetween}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Line synchronization</Text>
              <Text style={styles.muted}>Play the track and press Mark on each line. Timestamps stay editable.</Text>
            </View>
            <Pressable
              style={[styles.primaryButton, (saving || !trackId || published) && styles.disabledButton]}
              disabled={saving || !trackId || published}
              onPress={() => void save()}
            >
              <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : dirty ? 'Save draft •' : 'Save draft'}</Text>
            </Pressable>
          </View>

          {published && (
            <Banner tone="info">
              This {LOCALES.find((x) => x.value === locale)?.label ?? locale} {kind} lyric set is already published, so it cannot be edited here.
              Choose another language or kind to write a new set, or export it as LRC.
            </Banner>
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
                onMark={() => replaceLine(index, {
                  ...line,
                  startMs: Math.max(0, Math.round(status.currentTime * 1_000)),
                })}
                onMoveUp={() => moveLine(index, -1)}
                onMoveDown={() => moveLine(index, 1)}
                onDelete={() => editLines((current) => renumberLyricLines(current.filter((_, itemIndex) => itemIndex !== index)))}
              />
            ))}
          </View>

          {!lines.length && <Text style={styles.muted}>Paste lyrics or import an LRC file to begin.</Text>}
          {!!message && <Banner tone={message.tone}>{message.text}</Banner>}
        </View>

        <View style={styles.previewPanel}>
          <Text style={styles.sectionTitle}>Live preview</Text>
          <Text style={styles.muted}>The highlighted line is driven by the current playback position. Tap a timed line to seek to it.</Text>
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
  playerPanel: {
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.navyDark,
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
  label: {
    color: COLORS.goldBright,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: SPACING.xs,
  },
  muted: { color: COLORS.muted, fontSize: 13 },
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
  twoColumn: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  flex: { flex: 1, minWidth: 240 },
  input: {
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: COLORS.black,
  },
  playerText: { gap: 4 },
  playerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
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
  lines: { gap: SPACING.sm },
  preview: { gap: 10, paddingVertical: SPACING.sm },
  previewLine: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 19, lineHeight: 28, opacity: 0.55 },
  previewActive: { color: COLORS.white, opacity: 1, fontSize: 23, fontWeight: '800' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  error: { color: '#FF8B8B', fontWeight: '700' },
});
