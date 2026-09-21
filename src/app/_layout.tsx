import { useFonts as useLocalFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { AppShell } from '@/components/AppShell';
import { SignInScreen } from '@/components/SignInScreen';
import { Loading } from '@/components/ui';
import { COLORS } from '@/constants/theme';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { describeAuthError } from '@/services/authService';
import { supabase } from '@/services/supabase';

function AppStack() {
  return (
    <Stack
      screenOptions={{
        animation: 'none',
        contentStyle: { backgroundColor: COLORS.black },
        headerShown: false,
      }}
    />
  );
}

/** Reads an OAuth error the provider put in the URL on web, then removes the auth params. */
function takeWebAuthRedirectError(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const message = url.searchParams.get('error_description') || hash.get('error_description') || '';
  if (message) {
    window.history.replaceState(null, '', url.pathname);
  }
  return message ? describeAuthError(new Error(message.replace(/\+/g, ' '))) : '';
}

function clearWebAuthCode() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.has('code')) window.history.replaceState(null, '', url.pathname);
}

export default function RootLayout() {
  const pathname = usePathname();
  const [fontsLoaded] = useLocalFonts({
    Athanasius: require('../../assets/fonts/CopticCHC-Athanasius-V1.0.ttf'),
  });
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [authError] = useState(takeWebAuthRedirectError);

  useEffect(() => {
    // getSession waits for the web ?code= exchange (detectSessionInUrl) to finish.
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      if (data.session) clearWebAuthCode();
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={styles.root} />
      </SafeAreaProvider>
    );
  }

  let content;
  if (pathname === '/auth/callback') {
    // Native OAuth deep link: that route finishes the exchange itself.
    content = <AppStack />;
  } else if (!ready) {
    content = <Loading label="Opening CHC Artists…" />;
  } else if (!session) {
    content = <SignInScreen initialError={authError} />;
  } else {
    // Keyed by user so switching accounts never shows the previous creator's data.
    content = (
      <WorkspaceProvider key={session.user.id}>
        <AppShell>
          <AppStack />
        </AppShell>
      </WorkspaceProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>{content}</View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.black },
});
