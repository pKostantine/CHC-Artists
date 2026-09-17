import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

// Native has no localStorage; expo-sqlite provides a persistent one so the
// session (and the PKCE verifier used by Google sign-in) survives app restarts.
if (Platform.OS !== 'web') {
  require('expo-sqlite/localStorage/install');
}

// These are public client credentials, not secrets. Supabase publishable keys are
// designed to ship in web/mobile apps; RLS and the signed-in user's JWT enforce
// authorization. Environment variables remain supported so development or
// deployment builds can override the defaults without changing source.
const DEFAULT_SUPABASE_URL = 'https://wtuujmeinzqfikvuofmh.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_H0lG0vRL6io4Uy0htd77Cw_dlNbwx0n';

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

// Static web export renders once without a window; skip storage there.
const storage = typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : undefined;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    flowType: 'pkce',
    persistSession: Boolean(storage),
    storage,
    autoRefreshToken: true,
    // On web the OAuth redirect lands back on the app with ?code=, which the
    // client exchanges itself. Native completes the exchange in authService.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
