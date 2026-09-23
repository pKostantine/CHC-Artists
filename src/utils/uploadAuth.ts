/**
 * CHC uploads may last longer than a Supabase access token. Get a fresh token
 * for every upload request instead of capturing the JWT when the upload starts.
 * Concurrent parts share one refresh so one-use refresh tokens never race.
 */
export interface UploadSession {
  access_token: string;
  expires_at?: number | null;
}
export interface UploadAuthProvider {
  getSession(): Promise<{
    data: { session: UploadSession | null };
    error: { message: string } | null;
  }>;
  refreshSession(): Promise<{
    data: { session: UploadSession | null };
    error: { message: string } | null;
  }>;
}

const REFRESH_EARLY_MS = 90_000;

export function createUploadAuth(auth: UploadAuthProvider, fetchImpl: typeof fetch = fetch) {
  let refreshInFlight: Promise<string> | null = null;

  async function refresh(): Promise<string> {
    if (refreshInFlight) return refreshInFlight;

    const request = (async () => {
      const { data, error } = await auth.refreshSession();
      if (error || !data.session?.access_token) {
        throw Object.assign(new Error(error?.message || 'Your session expired. Sign in again to continue uploading.'), { status: 401 });
      }
      return data.session.access_token;
    })();
    refreshInFlight = request;
    try {
      return await request;
    } finally {
      if (refreshInFlight === request) refreshInFlight = null;
    }
  }

  async function getToken(forceRefresh = false): Promise<string> {
    if (refreshInFlight) return refreshInFlight;
    if (forceRefresh) return refresh();

    const { data, error } = await auth.getSession();
    if (error || !data.session?.access_token) {
      throw Object.assign(new Error(error?.message || 'Your session expired. Sign in again to continue uploading.'), { status: 401 });
    }
    const session = data.session;
    if (session.expires_at && session.expires_at * 1000 - Date.now() < REFRESH_EARLY_MS) {
      return refresh();
    }
    return session.access_token;
  }

  async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const send = async (forceRefresh: boolean) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${await getToken(forceRefresh)}`);
      return fetchImpl(url, { ...init, headers });
    };

    const response = await send(false);
    if (response.status !== 401) return response;
    // PostgREST PGRST303: refresh and replay just this request, not the video.
    return send(true);
  }

  return { getToken, authorizedFetch };
}
