const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/utils/uploads.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadUploads(creatorService) {
  const moduleObject = { exports: {} };
  function mockRequire(name) {
    if (name === 'expo-document-picker') return { getDocumentAsync: async () => ({ canceled: true }) };
    if (name === '@/services/creatorService') return { creatorService };
    if (name === '@/utils/titles') return {
      guessLocalizedTitlesFromFilename: () => ({ en: '', ar: '', cop: '', fr: '' }),
      preferredLocalizedTitle: (titles) => titles?.en || '',
    };
    throw new Error('Unexpected require: ' + name);
  }
  new Function('require', 'module', 'exports', compiled)(mockRequire, moduleObject, moduleObject.exports);
  return moduleObject.exports;
}

function original(uploadIntentId) {
  return {
    id: 'picked-video', name: 'Review Pascha lesson 1.m4v',
    size: 6_667_000_000, mediaType: 'video',
    uri: 'file://already-uploaded.m4v', uploadIntentId,
  };
}

test('retry after audio processing rejection enqueues existing video without sending bytes', async () => {
  let transferred = 0;
  const enqueued = [];
  const creatorService = {
    findReusableUploadedMediaIntent: async () => { throw Error('should not search with saved intent'); },
    upload: async () => { transferred += 1; return 'new-id'; },
    enqueueUploadProcessing: async (id, kind, mode) => { enqueued.push({ id, kind, mode }); },
    describeError: (e) => e.message,
  };
  const { runUpload } = loadUploads(creatorService);
  const patches = [];
  await runUpload('creator', original('existing-intent'), 'learning_lesson_set',
    (_, value) => patches.push(value));
  assert.equal(transferred, 0);
  assert.deepEqual(enqueued, [{
    id: 'existing-intent', kind: 'video', mode: 'learning_lesson_set',
  }]);
  assert.deepEqual(Object.assign({}, ...patches).uploadIntentId, 'existing-intent');
  assert.equal(Object.assign({}, ...patches).uploaded, true);
  assert.equal(Object.assign({}, ...patches).progress, 1);
});

test('existing verified 6 GB R2 upload is recovered even if old UI lost its intent', async () => {
  let transferred = 0;
  const calls = [];
  const creatorService = {
    findReusableUploadedMediaIntent: async (account, file) => {
      calls.push([account, file.name, file.size]);
      return 'recovered-intent';
    },
    upload: async () => { transferred += 1; return 'new-id'; },
    enqueueUploadProcessing: async (id) => { calls.push(['enqueue', id]); },
    describeError: (e) => e.message,
  };
  const { runUpload } = loadUploads(creatorService);
  const patches = [];
  await runUpload('creator', original(undefined), 'learning_lesson_set',
    (_, value) => patches.push(value));
  assert.equal(transferred, 0);
  assert.deepEqual(calls, [
    ['creator', 'Review Pascha lesson 1.m4v', 6_667_000_000],
    ['enqueue', 'recovered-intent'],
  ]);
  assert.equal(Object.assign({}, ...patches).uploaded, true);
});

test('a successfully transferred file keeps its R2 upload intent if enqueue fails', async () => {
  let transferred = 0;
  const creatorService = {
    findReusableUploadedMediaIntent: async () => null,
    upload: async () => { transferred += 1; return 'completed-r2-id'; },
    enqueueUploadProcessing: async () => { throw Error('video cannot be enqueued for audio'); },
    describeError: (e) => e.message,
  };
  const { runUpload } = loadUploads(creatorService);
  const patches = [];
  await runUpload('creator', original(undefined), 'learning_lesson_set',
    (_, value) => patches.push(value));
  const result = Object.assign({}, ...patches);
  assert.equal(transferred, 1);
  assert.equal(result.uploadIntentId, 'completed-r2-id');
  assert.equal(result.uploaded, true);
  assert.equal(result.progress, 0.97);
  assert.match(result.error, /safely uploaded/);
});

test('new transfer occurs only if server finds no matching uploaded original', async () => {
  let transferred = 0;
  const creatorService = {
    findReusableUploadedMediaIntent: async () => null,
    upload: async () => { transferred += 1; return 'fresh-id'; },
    enqueueUploadProcessing: async () => undefined,
    describeError: (e) => e.message,
  };
  const { runUpload } = loadUploads(creatorService);
  const patches = [];
  await runUpload('creator', original(undefined), 'learning_lesson_set',
    (_, value) => patches.push(value));
  assert.equal(transferred, 1);
  assert.equal(Object.assign({}, ...patches).uploadIntentId, 'fresh-id');
});

test('uploaded and processing-failed file has a distinct retry label', () => {
  const formatSource = fs.readFileSync('src/utils/format.ts', 'utf8');
  const compiledFormat = ts.transpileModule(formatSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('module', 'exports', compiledFormat)(moduleObject, moduleObject.exports);
  assert.match(moduleObject.exports.uploadLabel({
    ...original('saved-id'), uploaded: true, error: 'processing failed',
  }), /processing retry needed/i);
});
