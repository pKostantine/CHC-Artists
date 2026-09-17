import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

// These are public client credentials, not secrets. Supabase publishable keys are
// designed to ship in web/mobile apps; RLS and the signed-in user's JWT enforce
// authorization. Environment variables remain supported so development or
// deployment builds can override the defaults without changing source.
const DEFAULT_SUPABASE_URL = 'https://wtuujmeinzqfikvuofmh.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_H0lG0vRL6io4Uy0htd77Cw_dlNbwx0n';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

const webStorage =
  Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined'
    ? globalThis.localStorage
    : undefined;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: Boolean(webStorage),
    storage: webStorage,
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
