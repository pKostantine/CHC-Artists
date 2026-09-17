import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase, supabaseKey, supabaseUrl } from '@/services/supabase';

WebBrowser.maybeCompleteAuthSession();

/** Where Google sends the browser back to after consent. Must be in Supabase's Redirect URLs allow list. */
export function oauthRedirectUrl(): string {
  if (Platform.OS === 'web') {
    // Return to the page the creator started from (e.g. /lyrics), without any stale auth params.
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    return url.toString();
  }
  return Linking.createURL('auth/callback');
}

/**
 * Exchanges the `?code=` a PKCE OAuth redirect carries for a session. Returns
 * false when the URL is not an auth redirect. Throws with Supabase's own
 * description when the provider reported an error.
 */
export async function completeOAuthFromUrl(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const error = parsed.searchParams.get('error_description') || hash.get('error_description');
  if (error) throw new Error(error.replace(/\+/g, ' '));

  const code = parsed.searchParams.get('code');
  if (!code) return false;
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return true;
}

/**
 * Supabase only reports a disabled provider after redirecting to it, which on
 * web strands the creator on a raw JSON error page. Ask first instead.
 */
async function assertGoogleEnabled(): Promise<void> {
  let enabled = true;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseKey } });
    if (response.ok) {
      const settings = await response.json() as { external?: { google?: boolean } };
      enabled = settings.external?.google !== false;
    }
  } catch {
    // If the check itself fails, let the real sign-in attempt report the problem.
  }
  if (!enabled) throw new Error('provider is not enabled');
}

export async function signInWithGoogle(): Promise<void> {
  await assertGoogleEnabled();
  const redirectTo = oauthRedirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in did not return a URL.');

  if (Platform.OS === 'web') {
    // Full-page redirect to Google; the ?code= is exchanged when the app loads again.
    window.location.assign(data.url);
    return;
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;
  await completeOAuthFromUrl(result.url);
}

/** Turns Supabase's provider error into something a creator can act on. */
export function describeAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/provider is not enabled|Unsupported provider/i.test(message)) {
    return 'Google sign-in is not switched on for CHC Artists yet. Use your email and password for now.';
  }
  if (/Invalid login credentials/i.test(message)) return 'That email and password do not match a CHC Artists account.';
  if (/Email not confirmed/i.test(message)) return 'Confirm your email address first. Check your inbox for the link.';
  return message;
}
