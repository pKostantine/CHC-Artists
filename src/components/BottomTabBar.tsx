import { useRouter, type Href } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '@/components/Icon';
import { COLORS } from '@/constants/theme';

export type ArtistTab = 'submissions' | 'releases' | 'lyrics' | 'profile' | null;

interface BottomTabBarProps {
  active: ArtistTab;
}

const TABS: { active: Exclude<ArtistTab, null>; href: Href; icon: IconName; label: string }[] = [
  { active: 'submissions', href: '/', icon: 'document-outline', label: 'Submissions' },
  { active: 'releases', href: '/releases', icon: 'globe-outline', label: 'Releases' },
  { active: 'lyrics', href: '/lyrics', icon: 'lyrics-outline', label: 'Lyrics' },
  { active: 'profile', href: '/profile', icon: 'person-outline', label: 'Profile' },
];

function isStandaloneWebApp() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean };
  return standaloneNavigator.standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export default function BottomTabBar({ active }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isCompactLandscape = width > height && height <= 599;
  const needsBrowserBottomInset = Platform.OS === 'web' && !isStandaloneWebApp();
  const iconSize = isCompactLandscape ? 22 : 27;

  return (
    <View style={styles.shell}>
      <View
        accessibilityRole="tablist"
        style={[styles.bar, needsBrowserBottomInset && { paddingBottom: insets.bottom }]}
      >
        {TABS.map((tab) => {
          const selected = active === tab.active;
          return (
            <Pressable
              key={tab.active}
              accessibilityLabel={tab.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => router.replace(tab.href)}
              style={[styles.tab, isCompactLandscape && styles.tabLandscape]}
            >
              {selected ? <View style={styles.activeIndicator} /> : null}
              <Icon name={tab.icon} size={iconSize} color={selected ? COLORS.goldBright : COLORS.muted} />
              <Text
                numberOfLines={1}
                style={[styles.tabLabel, isCompactLandscape && styles.tabLabelLandscape, selected && styles.tabLabelActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: COLORS.surface },
  bar: {
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  activeIndicator: {
    backgroundColor: COLORS.gold,
    height: 3,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 10,
    position: 'relative',
  },
  tabLandscape: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  tabLabel: {
    color: COLORS.muted,
    fontFamily: 'Georgia',
    fontSize: 12,
    fontWeight: '700',
  },
  tabLabelLandscape: {
    flexShrink: 1,
    fontSize: 14,
  },
  tabLabelActive: { color: COLORS.goldBright },
});
