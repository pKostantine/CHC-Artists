const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const read = (file) => fs.readFileSync(file, 'utf8');

const source = read('src/utils/titles.ts');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleObject = { exports: {} };
new Function('module', 'exports', transpiled)(moduleObject, moduleObject.exports);
const { guessLocalizedTitlesFromFilename, guessFilenameOrder, sortMediaByFilenameOrder } = moduleObject.exports;

test('music tracks, learning recordings and lessons share filename title suggestions', () => {
  assert.equal(guessLocalizedTitlesFromFilename('02 - First Lesson.m4a').en, 'First Lesson');
  assert.equal(guessLocalizedTitlesFromFilename('Lesson 03 - Introduction.mp4').en, 'Introduction');
  assert.equal(guessLocalizedTitlesFromFilename('Disc 2 - Track 05 - Vespers.wav').en, 'Vespers');
  assert.equal(guessLocalizedTitlesFromFilename('1. 01 Nisavev Teerou ♱ Liturgy.wav').en, 'Nisavev Teerou');
  assert.equal(guessLocalizedTitlesFromFilename('04 - السلام لك يا مريم.m4a').ar, 'السلام لك يا مريم');
  assert.equal(guessLocalizedTitlesFromFilename('01.m4a').en, '');
});

test('numeric filename prefixes suggest disc and episode order', () => {
  assert.deepEqual(guessFilenameOrder('01 - Intro.mp3'), { disc: 1, position: 1 });
  assert.deepEqual(guessFilenameOrder('Lesson 03 - Outro.mp4'), { disc: 1, position: 3 });
  assert.deepEqual(guessFilenameOrder('Disc 2 - Track 05 - Vespers.wav'), { disc: 2, position: 5 });
  assert.deepEqual(guessFilenameOrder('1. 04 - Evening.mp3'), { disc: 1, position: 4 });
  assert.equal(guessFilenameOrder('Introduction.m4a'), null);
});

test('multi-file additions auto-sort numbered filenames regardless of picker order', () => {
  const picked = ['Lesson 03 - Conclusion.mp4', 'Lesson 01 - Intro.mp4', 'Lesson 02 - Middle.mp4']
    .map((name) => ({ name }));
  assert.deepEqual(sortMediaByFilenameOrder(picked).map((item) => item.name), [
    'Lesson 01 - Intro.mp4',
    'Lesson 02 - Middle.mp4',
    'Lesson 03 - Conclusion.mp4',
  ]);
});

test('multiple discs sort by disc, followed by track; ties keep picker order', () => {
  const picked = ['Disc 2 - Track 01.m4a', 'Disc 1 - Track 02.m4a',
    'Disc 1 - Track 01a.m4a', 'Disc 1 - Track 01b.m4a'].map((name) => ({ name }));
  assert.deepEqual(sortMediaByFilenameOrder(picked).map((x) => x.name), [
    'Disc 1 - Track 01a.m4a',
    'Disc 1 - Track 01b.m4a',
    'Disc 1 - Track 02.m4a',
    'Disc 2 - Track 01.m4a',
  ]);
});

test('never reshuffle unnumbered or ambiguous single-number selections', () => {
  const picked = ['Vespers.m4a', '01 - First.m4a', 'Matins.m4a'].map((name) => ({ name }));
  assert.deepEqual(sortMediaByFilenameOrder(picked), picked);
});

test('editing learning title fields and manual ordering preserve the user choices', () => {
  const form = read('src/app/submission/new.tsx');
  const editor = read('src/components/TrackMetadataEditor.tsx');
  const draft = read('src/context/WorkspaceContext.tsx');
  assert.match(form, /<TrackMetadataEditor[\s\S]*?showCredits=\{isMusic\}/);
  assert.match(form, /kind=\{isMusic \? 'track' : draft\.mode === 'learning_album' \? 'recording' : 'lesson'\}/);
  assert.match(form, /draft\.media\.forEach\(\(file, index\) =>/);
  assert.match(form, /!hasMusicTitle\(file\.localizedTitle\)/);
  assert.match(form, /current\.mediaOrderManuallySet[\s\S]*?sortMediaByFilenameOrder/);
  assert.match(form, /mediaOrderManuallySet: true/);
  assert.match(editor, /kind === 'track' \? 'Track' : kind === 'recording' \? 'Recording' : 'Lesson'/);
  assert.match(editor, /\{showCredits && \(/);
  assert.match(draft, /mediaOrderManuallySet: false/);
});

test('every uploaded learning item sends the chosen title and localized fields', () => {
  const service = read('src/services/creatorService.ts');
  assert.match(service, /title: preferredLocalizedTitle\(file\.localizedTitle\)/);
  assert.match(service, /localizedTitles: file\.localizedTitle \?\? \{\}/);
  assert.doesNotMatch(service, /title: isMusic \? preferredLocalizedTitle\(file\.localizedTitle\) : file\.name/);
});
