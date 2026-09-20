import type { ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { supabase } from '@/services/supabase';

type TabIconName = 'submissions' | 'releases' | 'lyrics' | 'profile';

const SECTIONS: { href: Href; match: string; label: string; mobileLabel: string; description: string; icon: TabIconName }[] = [
  { href: '/submission', match: '/submission', label: 'Submissions', mobileLabel: 'Submissions', description: 'Drafts, review & requested changes', icon: 'submissions' },
  { href: '/releases', match: '/releases', label: 'Releases', mobileLabel: 'Releases', description: 'Ready and released music', icon: 'releases' },
  { href: '/lyrics', match: '/lyrics', label: 'Lyrics Studio', mobileLabel: 'Lyrics', description: 'Synchronized lyrics', icon: 'lyrics' },
  { href: '/profile', match: '/profile', label: 'Artist profile', mobileLabel: 'Profile', description: 'Picture, bio & links', icon: 'profile' },
];

const DESKTOP_NAV_MIN_WIDTH = 1100;
const BRAND_LOGO = Platform.OS === 'web'
  ? require('../../assets/images/CHC_Artists_sm_web.png')
  : require('../../assets/images/CHC_Artists_sm.png');

function isSectionActive(pathname: string, match: string) {
  return pathname === match
    || pathname.startsWith(`${match}/`)
    || (match === '/releases' && pathname.startsWith('/release/'));
}

function TabIcon({ kind, active }: { kind: TabIconName; active: boolean }) {
  const tint = active ? COLORS.goldBright : COLORS.muted;

  if (kind === 'releases') {
    return (
      <View style={[styles.discIcon, { borderColor: tint }]}>
        <View style={[styles.discHole, { borderColor: tint }]} />
      </View>
    );
  }

  if (kind === 'profile') {
    return (
      <View style={styles.profileIcon}>
        <View style={[styles.profileHead, { borderColor: tint }]} />
        <View style={[styles.profileShoulders, { borderColor: tint }]} />
      </View>
    );
  }

  return (
    <View style={[styles.linesIcon, kind === 'submissions' && styles.linesIconBox, { borderColor: tint }]}>
      <View style={[styles.iconLine, { backgroundColor: tint }]} />
      <View style={[styles.iconLine, { backgroundColor: tint }]} />
      <View style={[styles.iconLine, styles.iconLineShort, { backgroundColor: tint }]} />
    </View>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { account, accounts, selectAccount } = useWorkspace();

  // Native tablets and touch-first web apps use the bottom tab bar too.
  // The sidebar is reserved for genuinely desktop-like pointer layouts.
  const coarsePointer = Platform.OS !== 'web'
    || (typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
  const desktopNavigation = width >= DESKTOP_NAV_MIN_WIDTH && !coarsePointer;

  const goTo = (href: Href) => {
    // Top-level sections behave like tabs. replace() keeps navigation in the
    // current document and avoids building a long browser history on web/PWA.
    router.replace(href);
  };

  const signOut = (
    <Pressable
      accessibilityRole="button"
      onPress={() => void supabase.auth.signOut()}
      hitSlop={10}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Text style={styles.signOut}>Sign out</Text>
    </Pressable>
  );

  if (desktopNavigation) {
    return (
      <View style={styles.wideRoot}>
        <View style={[styles.sidebar, { paddingTop: SPACING.lg + insets.top }]}>
          <View style={styles.brandBlock}>
            <Image source={BRAND_LOGO} style={styles.brandLogoWide} resizeMode="contain" accessibilityLabel="CHC Artists" />
            <Text style={styles.brand}>CHC ARTISTS</Text>
          </View>
          <Text style={styles.account} numberOfLines={2}>{account?.displayName || 'Creator workspace'}</Text>

          {accounts.length > 1 && (
            <View style={styles.switcherColumn}>
              {accounts.map((workspace) => (
                <Pressable
                  key={workspace.id}
                  onPress={() => selectAccount(workspace.id)}
                  style={[styles.workspace, workspace.id === account?.id && styles.workspaceActive]}
                >
                  <Text
                    style={[styles.workspaceText, workspace.id === account?.id && styles.workspaceTextActive]}
                    numberOfLines={1}
                  >
                    {workspace.displayName}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.navList}>
            {SECTIONS.map((section) => {
              const active = isSectionActive(pathname, section.match);
              return (
                <Pressable
                  key={section.match}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => goTo(section.href)}
                  style={({ pressed }) => [styles.sideNav, active && styles.navActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.navText, active && styles.navTextActive]}>{section.label}</Text>
                  <Text style={styles.navDescription}>{section.description}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.spacer} />
          {signOut}
        </View>
        <View style={styles.main}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.narrowRoot}>
      <View style={[styles.mobileHeader, { paddingTop: Math.max(insets.top, SPACING.sm) }]}>
        <View style={styles.mobileHeaderRow}>
          <View style={styles.mobileIdentity}>
            <Image source={BRAND_LOGO} style={styles.brandLogoSmall} resizeMode="contain" accessibilityLabel="CHC Artists" />
            <View style={styles.mobileTitleBlock}>
              <Text style={styles.brand}>CHC ARTISTS</Text>
              <Text style={styles.accountSmall} numberOfLines={1}>{account?.displayName || 'Creator workspace'}</Text>
            </View>
          </View>
          {signOut}
        </View>

        {accounts.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.switcherRow}
          >
            {accounts.map((workspace) => (
              <Pressable
                key={workspace.id}
                onPress={() => selectAccount(workspace.id)}
                style={[styles.workspace, workspace.id === account?.id && styles.workspaceActive]}
              >
                <Text
                  style={[styles.workspaceText, workspace.id === account?.id && styles.workspaceTextActive]}
                  numberOfLines={1}
                >
                  {workspace.displayName}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.main}>{children}</View>

      <View
        accessibilityRole="tablist"
        style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 6) }]}
      >
        {SECTIONS.map((section) => {
          const active = isSectionActive(pathname, section.match);
          return (
            <Pressable
              key={section.match}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => goTo(section.href)}
              style={({ pressed }) => [
                styles.bottomNavItem,
                active && styles.bottomNavItemActive,
                pressed && styles.pressed,
              ]}
            >
              <TabIcon kind={section.icon} active={active} />
              <Text
                numberOfLines={1}
                style={[styles.bottomNavText, active && styles.bottomNavTextActive]}
              >
                {section.mobileLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.black },
  narrowRoot: { flex: 1, backgroundColor: COLORS.black },
  sidebar: {
    width: 240,
    padding: SPACING.lg,
    gap: SPACING.md,
    backgroundColor: '#0b0c0e',
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  brandBlock: { alignItems: 'flex-start', gap: 8 },
  brandLogoWide: { width: 112, height: 112 },
  brandLogoSmall: { width: 42, height: 42 },
  brand: { color: COLORS.gold, fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  account: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 20, lineHeight: 26 },
  accountSmall: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 16, lineHeight: 20 },
  navList: { gap: 6, marginTop: SPACING.sm },
  sideNav: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: RADII.sm, gap: 2 },
  navActive: { backgroundColor: COLORS.surfaceSoft },
  navText: { color: COLORS.white, fontWeight: '700' },
  navTextActive: { color: COLORS.goldBright },
  navDescription: { color: COLORS.muted, fontSize: 12 },
  pressed: { opacity: 0.72 },
  spacer: { flex: 1 },
  signOut: { color: COLORS.muted, fontWeight: '700', fontSize: 13 },
  main: { flex: 1, minWidth: 0, minHeight: 0 },

  mobileHeader: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    backgroundColor: '#0b0c0e',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mobileHeaderRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  mobileIdentity: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mobileTitleBlock: { flex: 1, minWidth: 0, gap: 1 },

  switcherColumn: { gap: 6 },
  switcherRow: { flexDirection: 'row', gap: 6, paddingRight: SPACING.md },
  workspace: {
    maxWidth: 220,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  workspaceActive: { borderColor: COLORS.gold, backgroundColor: COLORS.surfaceSoft },
  workspaceText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  workspaceTextActive: { color: COLORS.goldBright },

  bottomNav: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 6,
    paddingTop: 6,
    backgroundColor: '#0b0c0e',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  bottomNavItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    gap: 3,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2,
    borderTopColor: 'transparent',
    borderRadius: RADII.sm,
  },
  bottomNavItemActive: {
    borderTopColor: COLORS.gold,
    backgroundColor: COLORS.surfaceSoft,
  },
  bottomNavText: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  bottomNavTextActive: { color: COLORS.goldBright },

  linesIcon: { width: 22, height: 22, justifyContent: 'center', gap: 3, paddingHorizontal: 2 },
  linesIconBox: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 4 },
  iconLine: { height: 1.7, width: '100%', borderRadius: 2 },
  iconLineShort: { width: '68%' },
  discIcon: { width: 21, height: 21, borderWidth: 1.7, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  discHole: { width: 6, height: 6, borderWidth: 1.5, borderRadius: 3 },
  profileIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'flex-end' },
  profileHead: { width: 8, height: 8, borderWidth: 1.5, borderRadius: 4, marginBottom: 2 },
  profileShoulders: { width: 18, height: 8, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 9, borderTopRightRadius: 9 },
});
