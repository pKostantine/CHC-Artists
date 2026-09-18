import { Text, View } from 'react-native';
import { COLORS, RADII, SPACING } from '@/constants/theme';

function inputValue(value: string, mode: 'date' | 'datetime'): string {
  if (mode === 'date') return value.trim().slice(0, 10);
  return value.trim().replace(' ', 'T').slice(0, 16);
}

function minValue(date?: Date): string | undefined {
  if (!date) return undefined;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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
  return (
    <View style={{ gap: SPACING.sm }}>
      <Text style={{ color: COLORS.goldBright, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 }}>
        {label}
      </Text>
      <input
        aria-label={label}
        type={mode === 'date' ? 'date' : 'datetime-local'}
        value={inputValue(value, mode)}
        min={minValue(minimumDate)}
        onChange={(event) => onChange(mode === 'date' ? event.currentTarget.value : event.currentTarget.value.replace('T', ' '))}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          borderRadius: RADII.sm,
          border: `1px solid ${COLORS.border}`,
          color: COLORS.white,
          background: COLORS.black,
          padding: '11px 12px',
          font: 'inherit',
          colorScheme: 'dark',
        }}
      />
      {!!hint && <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 19 }}>{hint}</Text>}
    </View>
  );
}
