import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { COLORS, RADII, SPACING } from '@/constants/theme';

function parseLocal(value: string): Date {
  const parsed = new Date(value.trim().replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? new Date(Date.now() + 72 * 60 * 60 * 1000) : parsed;
}

function formatLocal(date: Date, mode: 'date' | 'datetime'): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return mode === 'date' ? datePart : `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function displayValue(date: Date, mode: 'date' | 'datetime'): string {
  return date.toLocaleString(undefined, mode === 'date'
    ? { year: 'numeric', month: 'short', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ReleaseDateTimeField({
  label,
  value,
  onChange,
  minimumDate,
  hint,
  mode = 'datetime',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimumDate?: Date;
  hint?: string;
  mode?: 'date' | 'datetime';
}) {
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const date = parseLocal(value);

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>

      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={date}
          mode={mode}
          display="compact"
          minimumDate={minimumDate}
          themeVariant="dark"
          accentColor={COLORS.gold}
          onValueChange={(_event, selectedDate) => onChange(formatLocal(selectedDate, mode))}
        />
      ) : (
        <>
          <Pressable style={styles.button} onPress={() => setShowAndroidPicker(true)}>
            <Text style={styles.buttonText}>{displayValue(date, mode)}</Text>
          </Pressable>
          {showAndroidPicker && (
            <DateTimePicker
              value={date}
              mode={mode}
              minimumDate={minimumDate}
              presentation="dialog"
              accentColor={COLORS.gold}
              onValueChange={(_event, selectedDate) => {
                setShowAndroidPicker(false);
                onChange(formatLocal(selectedDate, mode));
              }}
              onDismiss={() => setShowAndroidPicker(false)}
            />
          )}
        </>
      )}

      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACING.sm },
  label: {
    color: COLORS.goldBright,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  button: {
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  buttonText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  hint: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
});
