const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (name) => fs.readFileSync(name, 'utf8');

test('learning albums have cantor and chorus suggestions without a Contributor type selector', () => {
  const submission = read('src/app/submission/new.tsx');
  assert.doesNotMatch(submission, /<Label>Contributor type<\/Label>/);
  assert.match(submission, /allowChorus=\{draft\.mode === 'learning_album'\}/);
  assert.match(submission, /<ContributorSearchField/);
  assert.match(submission, /<Button label="Add new chorus"/);
  assert.match(submission, /accountId=\{account\?\.id\}/);
});

test('all three modes can link existing identities by ID and search profile photos', () => {
  const editor = read('src/components/TrackMetadataEditor.tsx');
  const picker = read('src/components/ContributorSearchField.tsx');
  const service = read('src/services/creatorService.ts');
  const releaseEditor = read('src/app/release/[id].tsx');
  assert.match(editor, /mainArtistId: person\.id/);
  assert.match(editor, /artistId: person\.id/);
  assert.match(service, /mainArtistId: isMusic \? \(file\.mainArtistId \|\| null\)/);
  assert.match(service, /artistId: credit\.artistId \|\| null/);
  assert.match(releaseEditor, /accountId=\{account\?\.id\}/);
  assert.match(picker, /searchContributors\(accountId, value\.trim\(\), kind\)/);
  assert.match(picker, /resolveImageUrl\(person\.profileImage\.bucket/);
  assert.match(picker, /No matching profiles/);
});

test('learning albums and lesson sets share bilingual seasons and release-date controls', () => {
  const form = read('src/app/submission/new.tsx');
  const service = read('src/services/creatorService.ts');
  assert.match(form, /titleArabic \? /);
  assert.match(form, /Liturgical season/);
  assert.match(form, /Originally released \(optional\)/);
  assert.match(form, /draft\.releaseTimingMode === 'scheduled'/);
  assert.match(service, /p_release_timing_mode: draft\.releaseTimingMode/);
  assert.match(service, /p_original_release_date: nullIfBlank\(draft\.originalReleaseDate\)/);
});

test('new lesson-set hymns can be entered when the learning hymn catalog is empty', () => {
  const form = read('src/app/submission/new.tsx');
  const service = read('src/services/creatorService.ts');
  assert.match(form, /function LearningHymnPicker/);
  assert.match(form, /No learning hymns yet/);
  assert.match(form, /Add new hymn/);
  assert.match(form, /creatorService\.createHymn\(accountId, newName\.trim\(\)\)/);
  assert.match(service, /create_creator_hymn/);
});

test('credit IDs are retained when copying credits across tracks or updating releases', () => {
  const form = read('src/app/submission/new.tsx');
  const release = read('src/app/release/[id].tsx');
  assert.match(form, /mainArtistId: source\.mainArtistId/);
  assert.match(release, /mainArtistId: source\.mainArtistId/);
  assert.match(release, /mainArtistId: track\.mainArtistId/);
  assert.match(release, /artistId: credit\.artistId \?\?/);
});
