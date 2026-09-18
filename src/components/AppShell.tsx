import type { ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { supabase } from '@/services/supabase';

const SECTIONS: { href: Href; match: string; label: string; description: string }[] = [
  { href: '/submission', match: '/submission', label: 'Submissions', description: 'Releases, albums & lessons' },
  { href: '/lyrics', match: '/lyrics', label: 'Lyrics Studio', description: 'Synchronized lyrics' },
  { href: '/profile', match: '/profile', label: 'Artist profile', description: 'Picture, bio & links' },
];

const WIDE = 900;
const BRAND_LOGO = Platform.OS === 'web'
  ? require('../../assets/images/CHC_Artists_sm_web.png')
  : require('../../assets/images/CHC_Artists_sm.png');

export function AppShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { account, accounts, selectAccount } = useWorkspace();
  const wide = width >= WIDE;

  const nav = SECTIONS.map((section) => {
    const active = pathname === section.match || pathname.startsWith(`${section.match}/`);
    return (
      <Pressable
        key={section.match}
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        onPress={() => router.navigate(section.href)}
        style={({ pressed }) => [wide ? styles.sideNav : styles.topNav, active && styles.navActive, pressed && styles.pressed]}
      >
        <Text style={[styles.navText, active && styles.navTextActive]}>{section.label}</Text>
        {wide && <Text style={styles.navDescription}>{section.description}</Text>}
      </Pressable>
    );
  });

  const workspaceSwitcher = accounts.length > 1 && (
    <View style={wide ? styles.switcherColumn : styles.switcherRow}>
      {accounts.map((x) => (
        <Pressable key={x.id} onPress={() => selectAccount(x.id)} style={[styles.workspace, x.id === account?.id && styles.workspaceActive]}>
          <Text style={[styles.workspaceText, x.id === account?.id && styles.workspaceTextActive]} numberOfLines={1}>{x.displayName}</Text>
        </Pressable>
      ))}
    </View>
  );

  const signOut = (
    <Pressable accessibilityRole="button" onPress={() => void supabase.auth.signOut()} hitSlop={8}>
      <Text style={styles.signOut}>Sign out</Text>
    </Pressable>
  );

  if (wide) {
    return (
      <View style={styles.wideRoot}>
        <View style={[styles.sidebar, { paddingTop: SPACING.lg + insets.top }]}>
          <View style={styles.brandBlock}>
            <Image source={BRAND_LOGO} style={styles.brandLogoWide} resizeMode="contain" accessibilityLabel="CHC Artists" />
            <Text style={styles.brand}>CHC ARTISTS</Text>
          </View>
          <Text style={styles.account} numberOfLines={2}>{account?.displayName || 'Creator workspace'}</Text>
          {workspaceSwitcher}
          <View style={styles.navList}>{nav}</View>
          <View style={styles.spacer} />
          {signOut}
        </View>
        <View style={styles.main}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.narrowRoot}>
      <View style={[styles.topBar, { paddingTop: SPACING.sm + insets.top }]}>
        <View style={styles.topBarRow}>
          <View style={styles.mobileIdentity}>
            <Image source={BRAND_LOGO} style={styles.brandLogoSmall} resizeMode="contain" accessibilityLabel="CHC Artists" />
            <View style={styles.topBarTitle}>
              <Text style={styles.brand}>CHC ARTISTS</Text>
              <Text style={styles.accountSmall} numberOfLines={1}>{account?.displayName || 'Creator workspace'}</Text>
            </View>
          </View>
          {signOut}
        </View>
        {workspaceSwitcher}
        <View style={styles.topNavRow}>{nav}</View>
      </View>
      <View style={styles.main}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.black },
  narrowRoot: { flex: 1, backgroundColor: COLORS.black },
  sidebar: { width: 240, padding: SPACING.lg, gap: SPACING.md, backgroundColor: '#0b0c0e', borderRightWidth: 1, borderRightColor: COLORS.border },
  brandBlock: { alignItems: 'flex-start', gap: 8 },
  brandLogoWide: { width: 112, height: 112 },
  brandLogoSmall: { width: 46, height: 46 },
  brand: { color: COLORS.gold, fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  account: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 20, lineHeight: 26 },
  accountSmall: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17 },
  navList: { gap: 6, marginTop: SPACING.sm },
  sideNav: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: RADII.sm, gap: 2 },
  topNav: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: RADII.sm, borderWidth: 1, borderColor: COLORS.border },
  navActive: { backgroundColor: COLORS.surfaceSoft, borderColor: COLORS.gold },
  navText: { color: COLORS.white, fontWeight: '700' },
  navTextActive: { color: COLORS.goldBright },
  navDescription: { color: COLORS.muted, fontSize: 12 },
  pressed: { opacity: 0.8 },
  spacer: { flex: 1 },
  signOut: { color: COLORS.muted, fontWeight: '700' },
  main: { flex: 1 },
  topBar: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.sm, backgroundColor: '#0b0c0e', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  topBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  mobileIdentity: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  topBarTitle: { flexShrink: 1, gap: 2 },
  topNavRow: { flexDirection: 'row', gap: 8 },
  switcherColumn: { gap: 6 },
  switcherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  workspace: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.border },
  workspaceActive: { borderColor: COLORS.gold, backgroundColor: COLORS.surfaceSoft },
  workspaceText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  workspaceTextActive: { color: COLORS.goldBright },
});
