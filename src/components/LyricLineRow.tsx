import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { EditableLyricLine } from '@/types/lyrics';
import { formatEditorTimestamp, parseEditorTimestamp } from '@/utils/synchronizedLyrics';

export function LyricLineRow({
  line,
  active,
  canMoveUp,
  canMoveDown,
  onChange,
  onMark,
  onSeek,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  line: EditableLyricLine;
  active: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (line: EditableLyricLine) => void;
  onMark: () => void;
  onSeek: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [timestampText, setTimestampText] = useState(formatEditorTimestamp(line.startMs));

  useEffect(() => {
    setTimestampText(formatEditorTimestamp(line.startMs));
  }, [line.startMs]);

  return (
    <View style={[styles.container, active && styles.active]}>
      <Text style={styles.sequence}>{line.sequence}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={line.startMs === null}
        onPress={onSeek}
        style={[styles.seek, line.startMs === null && styles.disabledButton]}
      >
        <Text style={styles.seekText}>▶</Text>
      </Pressable>
      <TextInput
        style={styles.timestamp}
        value={timestampText}
        placeholder="00:00.000"
        placeholderTextColor={COLORS.muted}
        onChangeText={setTimestampText}
        onEndEditing={() => {
          const parsed = parseEditorTimestamp(timestampText);
          onChange({ ...line, startMs: parsed });
          setTimestampText(formatEditorTimestamp(parsed));
        }}
      />
      <Pressable accessibilityRole="button" style={styles.mark} onPress={onMark}>
        <Text style={styles.markText}>Set time</Text>
      </Pressable>
      <TextInput
        style={styles.lyric}
        value={line.text}
        onChangeText={(text) => onChange({ ...line, text })}
        multiline
      />
      <View style={styles.actions}>
        <Pressable disabled={!canMoveUp} onPress={onMoveUp}>
          <Text style={[styles.action, !canMoveUp && styles.disabled]}>↑</Text>
        </Pressable>
        <Pressable disabled={!canMoveDown} onPress={onMoveDown}>
          <Text style={[styles.action, !canMoveDown && styles.disabled]}>↓</Text>
        </Pressable>
        <Pressable onPress={onDelete}>
          <Text style={[styles.action, styles.delete]}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  active: { borderColor: COLORS.gold, backgroundColor: COLORS.navyDark },
  sequence: { width: 24, textAlign: 'center', color: COLORS.goldBright, fontWeight: '700' },
  seek: {
    width: 34,
    height: 34,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekText: { color: COLORS.goldBright, fontSize: 13, fontWeight: '900' },
  timestamp: {
    width: 96,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontVariant: ['tabular-nums'],
  },
  mark: { backgroundColor: COLORS.gold, borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 8 },
  markText: { color: COLORS.black, fontWeight: '800' },
  lyric: {
    flex: 1,
    minWidth: 220,
    minHeight: 38,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.body,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  action: { color: COLORS.white, fontSize: 20, minWidth: 22, textAlign: 'center' },
  disabled: { opacity: 0.25 },
  disabledButton: { opacity: 0.3 },
  delete: { color: COLORS.danger },
});
