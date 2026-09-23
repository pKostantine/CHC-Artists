import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { EditableMultilingualLyricRow, LocaleCode } from '@/types/lyrics';
import { formatEditorTimestamp, parseEditorTimestamp } from '@/utils/synchronizedLyrics';

export interface LyricRowLanguage {
  value: LocaleCode;
  label: string;
  rtl?: boolean;
  published?: boolean;
}

export function MultilingualLyricRow({
  row,
  sequence,
  active,
  languages,
  dragHandle,
  dragging,
  timingEnabled = true,
  onTextChange,
  onStartChange,
  onMark,
  onSeek,
  onDelete,
}: {
  row: EditableMultilingualLyricRow;
  sequence: number;
  active: boolean;
  languages: LyricRowLanguage[];
  dragHandle: ReactNode;
  dragging: boolean;
  timingEnabled?: boolean;
  onTextChange: (locale: LocaleCode, text: string) => void;
  onStartChange: (startMs: number | null) => void;
  onMark: () => void;
  onSeek: () => void;
  onDelete: () => void;
}) {
  const [timestampText, setTimestampText] = useState(formatEditorTimestamp(row.startMs));

  useEffect(() => {
    setTimestampText(formatEditorTimestamp(row.startMs));
  }, [row.startMs]);

  return (
    <View style={[styles.container, active && styles.active, dragging && styles.dragging]}>
      {dragHandle}

      <View style={styles.controls}>
        <Text style={styles.sequence}>{sequence}</Text>
        {timingEnabled ? <>
        <Pressable
          accessibilityRole="button"
          disabled={row.startMs === null || dragging}
          onPress={onSeek}
          style={[styles.seek, (row.startMs === null || dragging) && styles.disabledButton]}
        >
          <Text style={styles.seekText}>▶</Text>
        </Pressable>
        <TextInput
          style={styles.timestamp}
          value={timestampText}
          editable={!dragging}
          placeholder="00:00.000"
          placeholderTextColor={COLORS.muted}
          onChangeText={setTimestampText}
          onEndEditing={() => {
            const parsed = parseEditorTimestamp(timestampText);
            onStartChange(parsed);
            setTimestampText(formatEditorTimestamp(parsed));
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={dragging}
          style={[styles.mark, dragging && styles.disabledButton]}
          onPress={onMark}
        >
          <Text style={styles.markText}>Set time</Text>
        </Pressable>
        </> : null}
      </View>

      <View style={styles.languageGrid}>
        {languages.map((language) => (
          <View key={language.value} style={styles.languageColumn}>
            <View style={styles.languageHeader}>
              <Text style={styles.languageLabel}>{language.label}</Text>
              {language.published && <Text style={styles.publishedLabel}>Published</Text>}
            </View>
            <TextInput
              style={[styles.lyric, language.rtl && styles.rtl, language.value === 'cop' && styles.coptic]}
              value={row.texts[language.value] ?? ''}
              editable={!dragging}
              placeholder={`${language.label} lyric…`}
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => onTextChange(language.value, text)}
              multiline
            />
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={dragging}
        onPress={onDelete}
        style={[styles.deleteButton, dragging && styles.disabledButton]}
      >
        <Text style={styles.deleteText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  active: { borderColor: COLORS.gold, backgroundColor: COLORS.navyDark },
  dragging: { borderColor: COLORS.goldBright, backgroundColor: COLORS.surfaceSoft },
  controls: {
    width: 120,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 6,
  },
  sequence: { textAlign: 'center', color: COLORS.goldBright, fontWeight: '800', fontSize: 12 },
  seek: {
    height: 32,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekText: { color: COLORS.goldBright, fontSize: 12, fontWeight: '900' },
  timestamp: {
    color: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  mark: {
    backgroundColor: COLORS.gold,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  markText: { color: COLORS.black, fontWeight: '800', fontSize: 12 },
  languageGrid: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  languageColumn: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 180,
    gap: 5,
  },
  languageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  languageLabel: { color: COLORS.white, fontWeight: '800', fontSize: 12 },
  publishedLabel: { color: COLORS.goldBright, fontSize: 10, fontWeight: '800' },
  lyric: {
    minHeight: 58,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.body,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: 'top',
  },
  rtl: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  coptic: { fontFamily: TYPOGRAPHY.coptic },
  deleteButton: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: COLORS.danger, fontSize: 24, fontWeight: '700' },
  disabledButton: { opacity: 0.3 },
});
