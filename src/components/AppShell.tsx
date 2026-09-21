import type { ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomTabBar, { type ArtistTab } from '@/components/BottomTabBar';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { supabase } from '@/services/supabase';

const SECTIONS: { href: Href; match: string; label: string; description: string; tab: Exclude<ArtistTab, null> }[] = [
  { href: '/', match: '/', label: 'Submissions', description: 'Drafts, review & requested changes', tab: 'submissions' },
  { href: '/releases', match: '/releases', label: 'Releases', description: 'Ready and released music', tab: 'releases' },
  { href: '/lyrics', match: '/lyrics', label: 'Lyrics Studio', description: 'Synchronized lyrics', tab: 'lyrics' },
  { href: '/profile', match: '/profile', label: 'Artist profile', description: 'Picture, bio & links', tab: 'profile' },
];

const DESKTOP_NAV_MIN_WIDTH = 1100;
const BRAND_LOGO = Platform.OS === 'web'
  ? require('../../assets/images/CHC_Artists_sm_web.png')
  : require('../../assets/images/CHC_Artists_sm.png');

function isSectionActive(pathname: string, match: string) {
  if (match === '/') return pathname === '/' || pathname.startsWith('/submission');
  return pathname === match
    || pathname.startsWith(`${match}/`)
    || (match === '/releases' && pathname.startsWith('/release/'));
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
  const activeTab = SECTIONS.find((section) => isSectionActive(pathname, section.match))?.tab ?? null;

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
      <Text style={styles.signOut}>Log out</Text>
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
    <SafeAreaView edges={['left', 'right']} style={styles.narrowRoot}>
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

      <BottomTabBar active={activeTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.black },
  narrowRoot: { flex: 1, backgroundColor: COLORS.black },
  sidebar: {
    width: 252,
    padding: SPACING.lg,
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandLogoWide: { width: 40, height: 40 },
  brandLogoSmall: { width: 34, height: 34 },
  brand: { color: COLORS.goldBright, fontWeight: '900', letterSpacing: 0, fontSize: 12 },
  account: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, lineHeight: 23, fontWeight: '700' },
  accountSmall: { color: COLORS.muted, fontFamily: TYPOGRAPHY.title, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  navList: { gap: 6, marginTop: SPACING.sm },
  sideNav: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: RADII.sm, gap: 2 },
  navActive: { backgroundColor: COLORS.surfaceSoft },
  navText: { color: COLORS.white, fontWeight: '700' },
  navTextActive: { color: COLORS.goldBright },
  navDescription: { color: COLORS.muted, fontSize: 12 },
  pressed: { opacity: 0.72 },
  spacer: { flex: 1 },
  signOut: { color: COLORS.muted, fontWeight: '700', fontSize: 12 },
  main: { flex: 1, minWidth: 0, minHeight: 0 },

  mobileHeader: {
    paddingHorizontal: 16,
    paddingBottom: 7,
    gap: 6,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mobileHeaderRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
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

});
