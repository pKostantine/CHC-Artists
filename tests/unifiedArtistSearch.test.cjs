const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');

test('learning search and music credits use the same artist profile ID', () => {
  const form = read('src/app/submission/new.tsx');
  const service = read('src/services/creatorService.ts');
  const field = read('src/components/ContributorSearchField.tsx');
  assert.match(form, /kind="artist"/);
  assert.match(form, /selectedArtistId=\{draft\.cantorId\}/);
  assert.match(service, /p_cantor_id: isMusic \? null : draft\.cantorId \|\| null/);
  assert.match(service, /learningArtistName: isMusic \? null : \(draft\.learningArtistName\.trim\(\) \|\| null\)/);
  assert.match(field, /resolveImageUrl\(person\.profileImage\.bucket/);
  assert.match(field, /onSelect\(person\)/);
});

test('unmatched names create a credit on submit, not via a separate button', () => {
  const form = read('src/app/submission/new.tsx');
  const initialDraft = read('src/context/WorkspaceContext.tsx');
  assert.match(form, /no profile matches/i);
  assert.match(form, /patch\(\{ learningArtistName, cantorId: '' \}\)/);
  assert.match(initialDraft, /learningArtistName: ''/);
  assert.doesNotMatch(form, /Add new cantor|Add new chorus|addPerson\(/);
});

test('all three submissions continue using a single unified profile search', () => {
  const form = read('src/app/submission/new.tsx');
  const editor = read('src/components/TrackMetadataEditor.tsx');
  assert.match(form, /<ContributorSearchField[\s\S]*?kind="artist"/);
  assert.match(editor, /<ContributorSearchField[\s\S]*?kind="artist"/);
  assert.doesNotMatch(form, /kind="cantor"/);
  assert.doesNotMatch(form, /dashboard\.cantors\.find/);
  assert.match(form, /Enter an artist name or choose an existing CHC artist profile/);
});
