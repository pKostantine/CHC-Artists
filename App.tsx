import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LyricsStudio } from '@/components/LyricsStudio';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { supabase } from '@/services/supabase';

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) setError(authError.message);
    else setSignedIn(true);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSignedIn(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {signedIn ? (
        <LyricsStudio onSignOut={signOut} />
      ) : (
        <View style={styles.loginWrap}>
          <View style={styles.loginCard}>
            <Text style={styles.eyebrow}>CHC ARTISTS</Text>
            <Text style={styles.title}>Creator tools for the Coptic Hymns Centre</Text>
            <Text style={styles.subtitle}>Phase 7 Lyrics Studio</Text>
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
              onSubmitEditing={signIn}
            />
            <Pressable
              style={[styles.button, (busy || !email || !password) && styles.disabled]}
              disabled={busy || !email || !password}
              onPress={signIn}
            >
              <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
            </Pressable>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Text style={styles.note}>
              Use an account that has creator or admin access in the shared CHC Supabase project.
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.black },
  loginWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.black,
  },
  loginCard: {
    width: '100%',
    maxWidth: 460,
    gap: SPACING.md,
    padding: SPACING.xl,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  eyebrow: { color: COLORS.gold, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 30, lineHeight: 38 },
  subtitle: { color: COLORS.goldBright, fontWeight: '800', fontSize: 16 },
  input: {
    color: COLORS.white,
    backgroundColor: COLORS.black,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: { backgroundColor: COLORS.gold, borderRadius: RADII.sm, paddingVertical: 13, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  buttonText: { color: COLORS.black, fontWeight: '900' },
  error: { color: '#FF8B8B' },
  note: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});
