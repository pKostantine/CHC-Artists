const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');

test('Web file selectors use directly tappable HTML inputs, not scripted clicks', () => {
  for (const path of [
    'src/components/FileSelectButton.web.tsx',
    'src/components/FileDropZone.web.tsx',
  ]) {
    const source = read(path);
    assert.match(source, /<input\s/);
    assert.match(source, /type="file"/);
    assert.match(source, /onChange=/);
    assert.match(source, /opacity: 0/);
    assert.doesNotMatch(source, /display:\s*['"]none['"]/);
    assert.doesNotMatch(source, /\.click\(\)/);
    assert.match(source, /isIOSFilesPicker/);
  }
});

test('The main CHC Artists upload entry points use the iPhone-safe picker', () => {
  const form = read('src/app/submission/new.tsx');
  const release = read('src/app/release/[id].tsx');
  const profile = read('src/app/profile.tsx');
  const revision = read('src/app/submission/[id].tsx');
  for (const source of [form, release, profile, revision]) {
    assert.match(source, /<FileSelectButton/);
    assert.doesNotMatch(source, /pickUploadCandidates\(/);
  }
  assert.match(form, /kind="image"/);
  assert.match(form, /kind=\{draft\.mode === 'learning_lesson_set' \? 'lesson' : 'audio'\}/);
  assert.match(release, /kind="audio"/);
  assert.match(profile, /onFiles=\{\(picked\) => void changePicture\(picked\)\}/);
  assert.match(revision, /onFiles=\{addCorrectedFiles\}/);
});

test('Web input passes real browser File objects to upload, including iCloud filenames', () => {
  const picker = read('src/components/FileSelectButton.web.tsx');
  const uploads = read('src/utils/uploads.ts');
  const service = read('src/services/creatorService.ts');
  assert.match(picker, /droppedUploadCandidates\(files, kind\)/);
  assert.match(uploads, /sourceFile: file/);
  assert.match(uploads, /createObjectURL\(file\)/);
  assert.match(uploads, /m4a/);
  assert.match(service, /file\.sourceFile/);
  assert.match(service, /blob = file\.sourceFile as Blob/);
});

test('Website drag and drop remains available alongside direct iPhone selection', () => {
  const zone = read('src/components/FileDropZone.web.tsx');
  assert.match(zone, /onDrop=\{onDrop\}/);
  assert.match(zone, /event\.dataTransfer\.files/);
  assert.match(zone, /onFiles\(Array\.from\(files\)\)/);
  assert.match(zone, /multiple/);
});

test('LRC lyrics import also uses a directly tappable browser file input', () => {
  const studio = read('src/components/LyricsStudio.tsx');
  assert.match(studio, /Platform\.OS === 'web'/);
  assert.match(studio, /aria-label=\{\x60Import/);
  assert.match(studio, /void importLrc\(locale, file\)/);
  assert.match(studio, /pickedFile \? await pickedFile\.text\(\) : await importLrcFile\(\)/);
});

test('iPhone M4A files stay audio even when Safari reports video/mp4', () => {
  const uploads = read('src/utils/uploads.ts');
  const kindDefinition = uploads.match(/function kindFor[\s\S]*?\n\}/)?.[0];
  assert.ok(kindDefinition, 'kindFor must exist');
  const kindFor = new Function(
    kindDefinition.replace(
      'function kindFor(mimeType: string, name: string, fallback: MediaKind): MediaKind',
      'function kindFor(mimeType, name, fallback)',
    ) + '\nreturn kindFor;',
  )();
  assert.equal(kindFor('video/mp4', 'recording.m4a', 'audio'), 'audio');
  assert.equal(kindFor('', 'icon.heic', 'image'), 'image');
  assert.equal(kindFor('audio/mp4', 'lesson.mp4', 'video'), 'video');

  const service = read('src/services/creatorService.ts');
  const mimeDefinition = service.match(/function contentTypeFor[\s\S]*?\n\}/)?.[0];
  assert.ok(mimeDefinition, 'contentTypeFor must exist');
  const contentTypeFor = new Function(
    'validMediaType', 'MIME_BY_EXTENSION',
    mimeDefinition.replace(
      'function contentTypeFor(file: UploadCandidate, blob: Blob): string',
      'function contentTypeFor(file, blob)',
    ) + '\nreturn contentTypeFor;',
  )(
    (type) => /^(audio|video|image)\//.test(type),
    { m4a: 'audio/mp4', mp4: 'video/mp4' },
  );
  assert.equal(
    contentTypeFor({ name: 'recording.m4a', mimeType: 'video/mp4', mediaType: 'audio' }, { type: 'video/mp4' }),
    'audio/mp4',
  );
});
