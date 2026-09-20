import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import * as Linking from 'expo-linking';
import { SignInScreen } from '@/components/SignInScreen';
import { Loading } from '@/components/ui';
import { completeOAuthFromUrl, describeAuthError } from '@/services/authService';

/**
 * Native deep link target for Google sign-in (chcartists://auth/callback).
 * Usually openAuthSessionAsync captures the redirect first; this covers the
 * cases where the OS opens the app with the link instead.
 */
export default function AuthCallback() {
  const url = Linking.useLinkingURL();
  const [state, setState] = useState<'working' | 'done' | string>('working');

  useEffect(() => {
    if (!url) return;
    completeOAuthFromUrl(url)
      .then(() => setState('done'))
      .catch((error) => setState(describeAuthError(error)));
  }, [url]);

  if (state === 'done') return <Redirect href="/" />;
  if (state !== 'working') return <SignInScreen initialError={state} />;
  return <Loading label="Finishing Google sign-in…" />;
}
