import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { usePathname } from 'expo-router';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { PublicationStatus } from '@/types/creator';
import { statusLabel, statusTone, type StatusTone } from '@/utils/format';

export function Page({ children, scrollEnabled = true }: { children: ReactNode; scrollEnabled?: boolean }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const scrollRef = useRef<ScrollView>(null);
  const compact = width < 700;

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [pathname]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.page}
      contentContainerStyle={[styles.pageContent, compact && styles.pageContentCompact]}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={scrollEnabled}
    >
      {children}
    </ScrollView>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { width } = useWindowDimensions();
  const compact = width < 700;
  return (
    <View style={[styles.pageHeader, compact && styles.pageHeaderCompact]}>
      <View style={[styles.pageHeaderText, compact && styles.pageHeaderTextCompact]}>
        <Text style={[styles.hero, compact && styles.heroCompact]}>{title}</Text>
        {!!subtitle && <Text style={styles.subhero}>{subtitle}</Text>}
      </View>
      {!!action && <View style={compact ? styles.headerActionCompact : undefined}>{action}</View>}
    </View>
  );
}

export function Card({ title, description, children, style }: { title?: string; description?: string; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { width } = useWindowDimensions();
  const compact = width < 700;
  return (
    <View style={[styles.card, compact && styles.cardCompact, style]}>
      {!!title && <Text style={styles.cardTitle}>{title}</Text>}
      {!!description && <Text style={styles.muted}>{description}</Text>}
      {children}
    </View>
  );
}

export function Field({ label, hint, ...input }: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={COLORS.muted}
        {...input}
        style={[styles.input, input.multiline && styles.multiline, input.style]}
      />
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Chips({ items, value, onChange }: { items: { id: string; title: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <View style={styles.chips}>
      {items.map((item) => {
        const active = value === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(active ? '' : item.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Like Chips, but one option is always selected. */
export function Segmented({ items, value, onChange }: { items: { id: string; title: string }[]; value: string; onChange: (id: string) => void }) {
  return <Chips items={items} value={value} onChange={(id) => id && onChange(id)} />;
}

export function Dropdown({ label, items, value, onChange, placeholder = 'Select an option', hint }: {
  label: string;
  items: { id: string; title: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((item) => item.id === value);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.dropdownButton, pressed && styles.pressed]}
      >
        <Text style={[styles.dropdownText, !selected && styles.dropdownPlaceholder]}>
          {selected?.title ?? placeholder}
        </Text>
        <Text style={styles.dropdownChevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <View style={styles.dropdownMenu}>
          {items.map((item) => {
            const active = item.id === value;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="menuitem"
                onPress={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.dropdownOption,
                  active && styles.dropdownOptionActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>
                  {item.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({ label, onPress, kind = 'secondary', disabled, busy, style }: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.button, buttonStyles[kind], off && styles.disabled, pressed && !off && styles.pressed, style]}
    >
      {busy ? <ActivityIndicator size="small" color={kind === 'primary' ? COLORS.black : COLORS.goldBright} /> : null}
      <Text style={[styles.buttonText, buttonTextStyles[kind]]}>{label}</Text>
    </Pressable>
  );
}

type BannerTone = 'info' | 'error' | 'success' | 'warning';

export function Banner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.banner, bannerStyles[tone]]}>
      <Text style={[styles.bannerText, bannerTextStyles[tone]]}>{children}</Text>
    </View>
  );
}

const TONE_COLORS: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: '#1b2733', fg: COLORS.muted },
  progress: { bg: '#19202a', fg: COLORS.goldBright },
  warning: { bg: '#2d230c', fg: '#ffc36b' },
  success: { bg: '#10281a', fg: '#8fe0a8' },
  danger: { bg: '#2d1414', fg: '#ff9b9b' },
};

export function StatusPill({ status }: { status: PublicationStatus }) {
  const tone = TONE_COLORS[statusTone(status)];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{statusLabel(status)}</Text>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={COLORS.gold} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export const uiStyles = StyleSheet.create({
  muted: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, flexWrap: 'wrap' },
  rowTitle: { color: COLORS.white, fontWeight: '800', fontSize: 14 },
  link: { color: COLORS.goldBright, fontWeight: '700', fontSize: 13 },
  remove: { color: '#ff8b8b', fontWeight: '700' },
  success: { color: '#8fe0a8', fontSize: 12, fontWeight: '800' },
  error: { color: '#ff8b8b', fontSize: 12, fontWeight: '800' },
  errorDetail: { color: '#ffb0b0', fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.black },
  pageContent: { padding: SPACING.lg, gap: SPACING.lg, maxWidth: 1120, width: '100%', alignSelf: 'center', paddingBottom: 48 },
  pageContentCompact: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 32, gap: 22 },
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: SPACING.md },
  pageHeaderCompact: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch', gap: 14 },
  pageHeaderText: { flexShrink: 1, minWidth: 240, gap: 6 },
  pageHeaderTextCompact: { minWidth: 0, width: '100%' },
  headerActionCompact: { alignItems: 'flex-start' },
  hero: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  heroCompact: { fontSize: 23, lineHeight: 28, fontWeight: '700' },
  subhero: { color: COLORS.muted, fontSize: 14, lineHeight: 20, maxWidth: 680 },
  card: { padding: 18, gap: 14, borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  cardCompact: { padding: 0, paddingTop: 16, borderRadius: 0, backgroundColor: 'transparent', borderWidth: 0, borderTopWidth: 1, borderTopColor: COLORS.border },
  cardTitle: { color: COLORS.white, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  muted: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  field: { gap: 6 },
  label: { color: COLORS.muted, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0 },
  hint: { color: COLORS.muted, fontSize: 12 },
  input: { minHeight: 44, color: COLORS.white, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  dropdownButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dropdownText: { color: COLORS.white, fontSize: 15, flex: 1 },
  dropdownPlaceholder: { color: COLORS.muted },
  dropdownChevron: { color: COLORS.goldBright, fontSize: 11, fontWeight: '900' },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.black,
    overflow: 'hidden',
  },
  dropdownOption: { paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: COLORS.border },
  dropdownOptionActive: { backgroundColor: COLORS.surfaceSoft },
  dropdownOptionText: { color: COLORS.white, fontSize: 15 },
  dropdownOptionTextActive: { color: COLORS.goldBright, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  chipText: { color: COLORS.white, fontWeight: '700' },
  chipTextActive: { color: COLORS.black },
  button: { minHeight: 42, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, borderRadius: RADII.sm, borderWidth: 1 },
  buttonText: { fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  banner: { padding: 12, borderRadius: RADII.sm, borderWidth: 1 },
  bannerText: { lineHeight: 20 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADII.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '800' },
  loading: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
});

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  secondary: { borderColor: COLORS.border, backgroundColor: COLORS.surface },
  ghost: { borderColor: 'transparent', paddingHorizontal: 8 },
  danger: { borderColor: '#7a2d2d' },
});

const buttonTextStyles = StyleSheet.create({
  primary: { color: COLORS.black, fontWeight: '900' },
  secondary: { color: COLORS.goldBright },
  ghost: { color: COLORS.goldBright },
  danger: { color: '#ff9b9b' },
});

const bannerStyles = StyleSheet.create({
  info: { borderColor: COLORS.border, backgroundColor: COLORS.surfaceSoft },
  error: { borderColor: '#7a2d2d', backgroundColor: '#2a1212' },
  success: { borderColor: '#2f6b45', backgroundColor: '#10281a' },
  warning: { borderColor: '#7a5a1d', backgroundColor: '#241c09' },
});

const bannerTextStyles = StyleSheet.create({
  info: { color: COLORS.muted },
  error: { color: '#ffb0b0' },
  success: { color: '#b5ecc6' },
  warning: { color: '#ffd28f' },
});
