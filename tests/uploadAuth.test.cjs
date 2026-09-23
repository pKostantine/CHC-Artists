const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/utils/uploadAuth.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleObject = { exports: {} };
new Function('module', 'exports', compiled)(moduleObject, moduleObject.exports);
const { createUploadAuth } = moduleObject.exports;

function session(accessToken, expiresInSeconds = 3600) {
  return { access_token: accessToken, expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds };
}

test('proactively refreshes expiring tokens once for concurrent multipart chunks', async () => {
  let refreshes = 0;
  let current = session('expiring', 10);
  const auth = {
    async getSession() { return { data: { session: current }, error: null }; },
    async refreshSession() {
      refreshes += 1;
      await Promise.resolve();
      current = session('fresh');
      return { data: { session: current }, error: null };
    },
  };
  const upload = createUploadAuth(auth);
  const tokens = await Promise.all(Array.from({ length: 6 }, () => upload.getToken()));
  assert.deepEqual(tokens, Array(6).fill('fresh'));
  assert.equal(refreshes, 1);
});

test('retries only the failed authenticated request when PostgREST returns 401', async () => {
  let refreshes = 0;
  const headers = [];
  let current = session('expired-server-side');
  const auth = {
    async getSession() { return { data: { session: current }, error: null }; },
    async refreshSession() {
      refreshes += 1;
      current = session('new-jwt');
      return { data: { session: current }, error: null };
    },
  };
  const fetchMock = async (_url, init) => {
    headers.push(new Headers(init.headers).get('Authorization'));
    return new Response('{}', { status: headers.length === 1 ? 401 : 200 });
  };
  const response = await createUploadAuth(auth, fetchMock).authorizedFetch(
    '/uploads/intent-id/multipart', { method: 'POST' },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(headers, ['Bearer expired-server-side', 'Bearer new-jwt']);
  assert.equal(refreshes, 1);
});

test('does not retry a 403 authorization failure or consume a refresh token', async () => {
  let refreshes = 0;
  let requests = 0;
  const auth = {
    async getSession() { return { data: { session: session('valid') }, error: null }; },
    async refreshSession() { refreshes += 1; throw new Error('unexpected refresh'); },
  };
  const upload = createUploadAuth(auth, async () => {
    requests += 1;
    return new Response('{}', { status: 403 });
  });
  const response = await upload.authorizedFetch('/uploads/intent-id');
  assert.equal(response.status, 403);
  assert.equal(requests, 1);
  assert.equal(refreshes, 0);
});

test('a failed token refresh is reported instead of retrying uploads with an expired JWT', async () => {
  const auth = {
    async getSession() { return { data: { session: session('about-to-expire', 1) }, error: null }; },
    async refreshSession() {
      return { data: { session: null }, error: { message: 'Refresh token is no longer valid' } };
    },
  };
  await assert.rejects(createUploadAuth(auth).getToken(), /Refresh token is no longer valid/);
});

test('large video uploads use refreshed JWTs for every chunk and upload control request', () => {
  const service = fs.readFileSync('src/services/creatorService.ts', 'utf8');
  assert.match(service, /const uploadAuth = createUploadAuth\(supabase\.auth\)/);
  assert.match(service, /const send = async \(access: string\)/);
  assert.match(service, /if \(status !== 401\) throw error;/);
  assert.match(service, /return send\(await uploadAuth\.getToken\(true\)\)/);
  assert.match(service, /uploadAuth\.authorizedFetch\(/);
  assert.doesNotMatch(service, /const access = await token\(\)/);
});
