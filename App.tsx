import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { CreatorDashboard } from '@/components/CreatorDashboard';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { supabase } from '@/services/supabase';

type AuthMode = 'signIn' | 'signUp';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  function switchMode(next: AuthMode) {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmPassword('');
  }

  async function signIn() {
    setBusy(true);
    setError('');
    setNotice('');
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) setError(authError.message);
    setBusy(false);
  }

  async function signUp() {
    setError('');
    setNotice('');
    if (!displayName.trim()) {
      setError('Enter the name you want shown in CHC Artists.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: displayName.trim() },
      },
    });

    if (authError) {
      setError(authError.message);
    } else if (!data.session) {
      setNotice('Account created. Check your email to confirm it, then come back and sign in.');
      setMode('signIn');
      setPassword('');
      setConfirmPassword('');
    }
    setBusy(false);
  }

  async function signInWithGoogle() {
    setError('');
    setNotice('');
    if (Platform.OS !== 'web') {
      setError('Google single sign-on is currently available on the CHC Artists web app. Gmail addresses can still create an account here with email and password.');
      return;
    }

    setBusy(true);
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (authError) setError(authError.message);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const authDisabled = busy || !email.trim() || !password;
  const signUpDisabled = authDisabled || !displayName.trim() || !confirmPassword;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {!ready ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.gold} /></View>
      ) : session ? (
        <CreatorDashboard onSignOut={signOut} />
      ) : (
        <View style={styles.loginWrap}>
          <View style={styles.loginCard}>
            <Text style={styles.eyebrow}>CHC ARTISTS</Text>
            <Text style={styles.title}>{mode === 'signUp' ? 'Create your creator account' : 'Create, manage, and submit to CHC'}</Text>
            <Text style={styles.subtitle}>Music and Learn & Study creator dashboard</Text>

            <View style={styles.modeRow}>
              <Pressable style={[styles.modeButton, mode === 'signIn' && styles.modeButtonActive]} onPress={() => switchMode('signIn')}>
                <Text style={[styles.modeText, mode === 'signIn' && styles.modeTextActive]}>Sign in</Text>
              </Pressable>
              <Pressable style={[styles.modeButton, mode === 'signUp' && styles.modeButtonActive]} onPress={() => switchMode('signUp')}>
                <Text style={[styles.modeText, mode === 'signUp' && styles.modeTextActive]}>Sign up</Text>
              </Pressable>
            </View>

            {Platform.OS === 'web' && (
              <>
                <Pressable style={[styles.googleButton, busy && styles.disabled]} disabled={busy} onPress={() => void signInWithGoogle()}>
                  <Text style={styles.googleButtonText}>Continue with Google / Gmail</Text>
                </Pressable>
                <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.dividerText}>or</Text><View style={styles.divider} /></View>
              </>
            )}

            {mode === 'signUp' && (
              <TextInput
                style={styles.input}
                placeholder="Display name"
                placeholderTextColor={COLORS.muted}
                value={displayName}
                onChangeText={setDisplayName}
              />
            )}
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor={COLORS.muted}
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={COLORS.muted}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={mode === 'signIn' ? signIn : undefined}
            />
            {mode === 'signUp' && (
              <TextInput
                style={styles.input}
                secureTextEntry
                placeholder="Confirm password"
                placeholderTextColor={COLORS.muted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onSubmitEditing={signUp}
              />
            )}

            <Pressable
              style={[styles.button, (mode === 'signIn' ? authDisabled : signUpDisabled) && styles.disabled]}
              disabled={mode === 'signIn' ? authDisabled : signUpDisabled}
              onPress={() => void (mode === 'signIn' ? signIn() : signUp())}
            >
              <Text style={styles.buttonText}>{busy ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create account'}</Text>
            </Pressable>

            {!!error && <Text style={styles.error}>{error}</Text>}
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
            <Text style={styles.note}>
              {mode === 'signUp'
                ? 'Your CHC Artists creator workspace is created automatically after your first successful sign in.'
                : 'Your submissions stay private until CHC review and publication.'}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg, backgroundColor: COLORS.black },
  loginCard: { width: '100%', maxWidth: 480, gap: SPACING.md, padding: SPACING.xl, borderRadius: RADII.lg, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  eyebrow: { color: COLORS.gold, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 32, lineHeight: 40 },
  subtitle: { color: COLORS.goldBright, fontWeight: '800', fontSize: 16 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADII.sm, borderWidth: 1, borderColor: COLORS.border },
  modeButtonActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  modeText: { color: COLORS.white, fontWeight: '800' },
  modeTextActive: { color: COLORS.black },
  input: { color: COLORS.white, backgroundColor: COLORS.black, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.sm, paddingHorizontal: 14, paddingVertical: 12 },
  googleButton: { backgroundColor: COLORS.white, borderRadius: RADII.sm, paddingVertical: 13, alignItems: 'center' },
  googleButtonText: { color: COLORS.black, fontWeight: '900' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.muted, fontSize: 12 },
  button: { backgroundColor: COLORS.gold, borderRadius: RADII.sm, paddingVertical: 13, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  buttonText: { color: COLORS.black, fontWeight: '900' },
  error: { color: '#FF8B8B', lineHeight: 19 },
  notice: { color: COLORS.goldBright, lineHeight: 19 },
  note: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});
