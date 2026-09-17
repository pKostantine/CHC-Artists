import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { describeAuthError, signInWithGoogle } from '@/services/authService';
import { supabase } from '@/services/supabase';
import { Banner, Button } from '@/components/ui';

type AuthMode = 'signIn' | 'signUp';

export function SignInScreen({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(initialError ?? '');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<'' | 'email' | 'google'>('');

  function switchMode(next: AuthMode) {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmPassword('');
  }

  async function signIn() {
    setBusy('email');
    setError('');
    setNotice('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) setError(describeAuthError(authError));
    setBusy('');
  }

  async function signUp() {
    setError('');
    setNotice('');
    if (!displayName.trim()) return setError('Enter the name you want shown in CHC Artists.');
    if (password.length < 8) return setError('Use a password with at least 8 characters.');
    if (password !== confirmPassword) return setError('The passwords do not match.');

    setBusy('email');
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: displayName.trim() },
        emailRedirectTo: Platform.OS === 'web' ? window.location.origin : undefined,
      },
    });

    if (authError) {
      setError(describeAuthError(authError));
    } else if (!data.session) {
      setNotice('Account created. Check your email to confirm it, then come back and sign in.');
      setMode('signIn');
      setPassword('');
      setConfirmPassword('');
    }
    setBusy('');
  }

  async function google() {
    setError('');
    setNotice('');
    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      // On web the page navigates away to Google, so this only matters on failure or cancel.
      setBusy('');
    }
  }

  const signInDisabled = Boolean(busy) || !email.trim() || !password;
  const signUpDisabled = signInDisabled || !displayName.trim() || !confirmPassword;
  const submit = mode === 'signIn' ? signIn : signUp;

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.eyebrow}>CHC ARTISTS</Text>
          <Text style={styles.title}>{mode === 'signUp' ? 'Create your creator account' : 'Create, manage, and submit to CHC'}</Text>
          <Text style={styles.subtitle}>Music and Learn & Study creator dashboard</Text>

          <View style={styles.modeRow} accessibilityRole="tablist">
            {(['signIn', 'signUp'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === value }}
                style={[styles.modeButton, mode === value && styles.modeButtonActive]}
                onPress={() => switchMode(value)}
              >
                <Text style={[styles.modeText, mode === value && styles.modeTextActive]}>{value === 'signIn' ? 'Sign in' : 'Sign up'}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.googleButton, Boolean(busy) && styles.disabled, pressed && styles.pressed]}
            disabled={Boolean(busy)}
            onPress={() => void google()}
          >
            <Text style={styles.googleMark}>G</Text>
            <Text style={styles.googleButtonText}>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or use email</Text>
            <View style={styles.divider} />
          </View>

          {mode === 'signUp' && (
            <TextInput
              style={styles.input}
              placeholder="Display name"
              placeholderTextColor={COLORS.muted}
              autoComplete="name"
              value={displayName}
              onChangeText={setDisplayName}
            />
          )}
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={COLORS.muted}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            placeholder="Password"
            placeholderTextColor={COLORS.muted}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => { if (mode === 'signIn' && !signInDisabled) void signIn(); }}
          />
          {mode === 'signUp' && (
            <TextInput
              style={styles.input}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Confirm password"
              placeholderTextColor={COLORS.muted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onSubmitEditing={() => { if (!signUpDisabled) void signUp(); }}
            />
          )}

          <Button
            kind="primary"
            label={busy === 'email' ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
            disabled={mode === 'signIn' ? signInDisabled : signUpDisabled}
            onPress={() => void submit()}
          />

          {!!error && <Banner tone="error">{error}</Banner>}
          {!!notice && <Banner tone="success">{notice}</Banner>}
          <Text style={styles.note}>
            {mode === 'signUp'
              ? 'Your CHC Artists creator workspace is created automatically the first time you sign in.'
              : 'Your submissions stay private until CHC review and publication.'}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.black },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.md },
  card: { width: '100%', maxWidth: 480, gap: SPACING.md, padding: SPACING.lg, borderRadius: RADII.lg, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  eyebrow: { color: COLORS.gold, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 30, lineHeight: 38 },
  subtitle: { color: COLORS.goldBright, fontWeight: '800', fontSize: 16 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADII.sm, borderWidth: 1, borderColor: COLORS.border },
  modeButtonActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  modeText: { color: COLORS.white, fontWeight: '800' },
  modeTextActive: { color: COLORS.black },
  input: { color: COLORS.white, backgroundColor: COLORS.black, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  googleButton: { flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: RADII.sm, paddingVertical: 12 },
  googleMark: { color: '#4285F4', fontWeight: '900', fontSize: 18 },
  googleButtonText: { color: '#1f1f1f', fontWeight: '800', fontSize: 15 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.muted, fontSize: 12 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  note: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});
