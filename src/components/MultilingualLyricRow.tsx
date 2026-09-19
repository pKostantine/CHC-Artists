import { useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { EditableMultilingualLyricRow, LocaleCode } from '@/types/lyrics';
import { formatEditorTimestamp, parseEditorTimestamp } from '@/utils/synchronizedLyrics';

export interface LyricRowLanguage {
  value: LocaleCode;
  label: string;
  rtl?: boolean;
  published?: boolean;
}

function DragDots({ disabled }: { disabled: boolean }) {
  return (
    <View style={[styles.dotGrid, disabled && styles.disabled]}>
      {Array.from({ length: 6 }).map((_, index) => <View key={index} style={styles.dot} />)}
    </View>
  );
}

export function MultilingualLyricRow({
  row,
  sequence,
  active,
  languages,
  structureEditable,
  onTextChange,
  onStartChange,
  onMark,
  onSeek,
  onDelete,
  onDragEnd,
  onLayoutRow,
}: {
  row: EditableMultilingualLyricRow;
  sequence: number;
  active: boolean;
  languages: LyricRowLanguage[];
  structureEditable: boolean;
  onTextChange: (locale: LocaleCode, text: string) => void;
  onStartChange: (startMs: number | null) => void;
  onMark: () => void;
  onSeek: () => void;
  onDelete: () => void;
  onDragEnd: (deltaY: number) => void;
  onLayoutRow: (y: number, height: number) => void;
}) {
  const [timestampText, setTimestampText] = useState(formatEditorTimestamp(row.startMs));
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setTimestampText(formatEditorTimestamp(row.startMs));
  }, [row.startMs]);

  const dragResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => structureEditable,
    onMoveShouldSetPanResponder: (_event, gesture) => structureEditable && Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => {
      setDragging(true);
      setDragY(0);
    },
    onPanResponderMove: (_event, gesture) => setDragY(gesture.dy),
    onPanResponderRelease: (_event, gesture) => {
      setDragging(false);
      setDragY(0);
      if (Math.abs(gesture.dy) > 8) onDragEnd(gesture.dy);
    },
    onPanResponderTerminate: () => {
      setDragging(false);
      setDragY(0);
    },
  }), [onDragEnd, structureEditable]);

  return (
    <View
      onLayout={(event) => onLayoutRow(event.nativeEvent.layout.y, event.nativeEvent.layout.height)}
      style={[
        styles.container,
        active && styles.active,
        dragging && styles.dragging,
        dragging && { transform: [{ translateY: dragY }] },
      ]}
    >
      <View
        accessibilityLabel={structureEditable ? `Drag line ${sequence} to reorder` : `Line ${sequence} order is locked`}
        {...dragResponder.panHandlers}
        style={[styles.dragHandle, !structureEditable && styles.dragHandleDisabled]}
      >
        <DragDots disabled={!structureEditable} />
      </View>

      <View style={styles.controls}>
        <Text style={styles.sequence}>{sequence}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={row.startMs === null}
          onPress={onSeek}
          style={[styles.seek, row.startMs === null && styles.disabledButton]}
        >
          <Text style={styles.seekText}>▶</Text>
        </Pressable>
        <TextInput
          style={[styles.timestamp, !structureEditable && styles.readOnly]}
          value={timestampText}
          editable={structureEditable}
          placeholder="00:00.000"
          placeholderTextColor={COLORS.muted}
          onChangeText={setTimestampText}
          onEndEditing={() => {
            if (!structureEditable) return;
            const parsed = parseEditorTimestamp(timestampText);
            onStartChange(parsed);
            setTimestampText(formatEditorTimestamp(parsed));
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!structureEditable}
          style={[styles.mark, !structureEditable && styles.disabledButton]}
          onPress={onMark}
        >
          <Text style={styles.markText}>Set time</Text>
        </Pressable>
      </View>

      <View style={styles.languageGrid}>
        {languages.map((language) => (
          <View key={language.value} style={styles.languageColumn}>
            <View style={styles.languageHeader}>
              <Text style={styles.languageLabel}>{language.label}</Text>
              {language.published && <Text style={styles.publishedLabel}>Published</Text>}
            </View>
            <TextInput
              style={[
                styles.lyric,
                language.rtl && styles.rtl,
                language.published && styles.readOnly,
              ]}
              value={row.texts[language.value] ?? ''}
              editable={!language.published}
              placeholder={language.published ? 'Published lyric' : `${language.label} lyric…`}
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => onTextChange(language.value, text)}
              multiline
            />
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!structureEditable}
        onPress={onDelete}
        style={[styles.deleteButton, !structureEditable && styles.disabledButton]}
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
    zIndex: 0,
  },
  active: { borderColor: COLORS.gold, backgroundColor: COLORS.navyDark },
  dragging: {
    zIndex: 20,
    borderColor: COLORS.goldBright,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  dragHandle: {
    width: 30,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleDisabled: { opacity: 0.45 },
  dotGrid: {
    width: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    justifyContent: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.goldBright },
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
  readOnly: { opacity: 0.65, backgroundColor: COLORS.navyDark },
  deleteButton: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: COLORS.danger, fontSize: 24, fontWeight: '700' },
  disabled: { opacity: 0.25 },
  disabledButton: { opacity: 0.3 },
});
