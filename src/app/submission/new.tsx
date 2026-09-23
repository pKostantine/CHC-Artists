import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FileDropZone } from '@/components/FileDropZone';
import { FileSelectButton } from '@/components/FileSelectButton';
import { MediaPreview } from '@/components/MediaPreview';
import { ReleaseDateTimeField } from '@/components/ReleaseDateTimeField';
import { ReorderableList } from '@/components/ReorderableList';
import { TrackMetadataEditor } from '@/components/TrackMetadataEditor';
import { ContributorSearchField } from '@/components/ContributorSearchField';
import { Banner, Button, Card, Chips, Dropdown, Field, Label, Page, PageHeader, Segmented, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { creatorService } from '@/services/creatorService';
import type { CatalogOption, CreatorDraft, CreditOptions, SubmissionMode, UploadCandidate } from '@/types/creator';
import { confirmAction } from '@/utils/dialogs';
import { fileSize, uploadLabel } from '@/utils/format';
import { droppedUploadCandidates, uploadsBlocking } from '@/utils/uploads';
import { hasMusicTitle, MUSIC_TITLE_LOCALES, preferredLocalizedTitle, releaseTypeForTrackCount, sortMediaByFilenameOrder } from '@/utils/titles';

const MODES: { id: SubmissionMode; title: string }[] = [
  { id: 'music', title: 'Music release' },
  { id: 'learning_album', title: 'Learning album' },
  { id: 'learning_lesson_set', title: 'Lesson set' },
];

const MODE_HELP: Record<SubmissionMode, string> = {
  music: 'Enter the release title, choose the release details, then add audio. Track titles are guessed from filenames and remain editable. CHC determines Single, EP, or Album automatically.',
  learning_album: 'Enter the album title, choose a cantor or chorus, and add the recordings. Each recording gets its own editable multilingual title and a suggested order from its filename.',
  learning_lesson_set: 'Enter the lesson set title, choose a cantor, and add ordered lessons for the same hymn. Each lesson receives editable multilingual titles suggested from its filename.',
};

const MUSIC_TYPE_OPTIONS = [
  { id: 'hymn', title: 'Hymns' },
  { id: 'spiritual_song', title: 'Spiritual Songs' },
  { id: 'other', title: 'Other' },
];

const RECORDING_TYPE_OPTIONS = [
  { id: 'studio', title: 'Studio' },
  { id: 'live', title: 'Live' },
  { id: 'instrumental', title: 'Instrumental' },
  { id: 'other', title: 'Other' },
];

const MUSIC_TYPE_VALUES: Record<string, string> = {
  hymn: 'Hymns',
  spiritual_song: 'Spiritual Songs',
};

const RECORDING_TYPE_VALUES: Record<string, string> = {
  studio: 'Studio',
  live: 'Live',
  instrumental: 'Instrumental',
};

/**
 * One shared CHC artist picker for learning albums and lesson sets.
 * Cantors and choruses are artists, not separate identities or creation types.
 * Unselected names are resolved or created when the submission is sent.
 */
function LearningContributorPicker({ accountId, name, selectedArtistId, onNameChange, onSelect }: {
  accountId: string | undefined;
  name: string;
  selectedArtistId: string;
  onNameChange: (name: string) => void;
  onSelect: (artistId: string, name: string) => void;
}) {
  return (
    <ContributorSearchField
      label="Artist / Cantor / Chorus"
      accountId={accountId}
      kind="artist"
      value={name}
      selectedId={selectedArtistId}
      placeholder="Search an existing CHC artist by name"
      hint="Choose an existing profile to link it, including its photo. If no profile matches, keep your new name; CHC will create a reusable artist credit when you submit."
      onTextChange={onNameChange}
      onSelect={(person) => onSelect(person.id, person.title)}
    />
  );
}

function LearningHymnPicker({ accountId, options, value, onChange }: {
  accountId: string | undefined;
  options: CatalogOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [created, setCreated] = useState<CatalogOption | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choices = created && !options.some((item) => item.id === created.id)
    ? [...options, created]
    : options;

  async function addHymn() {
    if (!accountId || !newName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const next = await creatorService.createHymn(accountId, newName.trim());
      setCreated(next);
      onChange(next.id);
      setNewName('');
    } catch (cause) {
      setError(creatorService.describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.group}>
      <Dropdown
        label="Hymn"
        items={choices}
        value={value}
        onChange={onChange}
        placeholder={choices.length ? 'Select an existing hymn' : 'No learning hymns yet'}
      />
      <Text style={uiStyles.muted}>Can't find the hymn? Add its title. CHC will review it with your lesson set.</Text>
      <Field
        label="New hymn name"
        value={newName}
        onChangeText={(text) => { setNewName(text); setError(''); }}
        placeholder="Enter the hymn you are teaching"
      />
      <Button
        label="Add new hymn"
        onPress={() => void addHymn()}
        busy={busy}
        disabled={!accountId || !newName.trim()}
      />
      {!!error && <Banner tone="error">{error}</Banner>}
    </View>
  );
}

function FileRow({ file, index, previewing, onPreview, onRetry, onRemove, dragHandle }: {
  file: UploadCandidate;
  index?: number;
  previewing: boolean;
  onPreview: () => void;
  onRetry: () => void;
  onRemove: () => void;
  dragHandle?: ReactNode;
}) {
  const statusStyle = file.error ? uiStyles.error : file.uploaded ? uiStyles.success : uiStyles.muted;
  return (
    <View>
      <View style={[uiStyles.row, styles.fileRow]}>
        {dragHandle}
        <View style={styles.fileText}>
          <Text style={uiStyles.rowTitle} numberOfLines={1}>
            {index === undefined
              ? `Artwork: ${file.name}`
              : `${index + 1}. ${preferredLocalizedTitle(file.localizedTitle) || file.title || 'Untitled'}`}
          </Text>
          {index !== undefined && <Text style={uiStyles.muted} numberOfLines={1}>{file.name}</Text>}
          <Text style={statusStyle}>{fileSize(file.size)} • {uploadLabel(file)}</Text>
          {file.uploading && (
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(file.progress * 100)}%` }]} /></View>
          )}
          {!!file.error && <Text style={uiStyles.errorDetail}>{file.error}</Text>}
        </View>
        <View style={styles.fileActions}>
          {!!file.error && <Pressable onPress={onRetry} hitSlop={6}><Text style={uiStyles.link}>Retry</Text></Pressable>}
          <Pressable onPress={onPreview} hitSlop={6}><Text style={uiStyles.link}>{previewing ? 'Hide' : 'Preview'}</Text></Pressable>
          <Pressable onPress={onRemove} hitSlop={6}><Text style={uiStyles.remove}>Remove</Text></Pressable>
        </View>
      </View>
      {previewing && <MediaPreview file={file} onClose={onPreview} />}
    </View>
  );
}

export default function NewSubmission() {
  const { account, catalog, draft, setDraft, resetDraft, uploadDraftFile, refresh } = useWorkspace();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [credits, setCredits] = useState<CreditOptions | null>(null);
  const [draggingTracks, setDraggingTracks] = useState(false);
  const earliestReleaseChoice = useMemo(() => new Date(Date.now() + 48 * 60 * 60 * 1000), []);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    void creatorService
      .creditOptions(account.id)
      .then((options) => { if (!cancelled) setCredits(options); })
      .catch(() => { if (!cancelled) setCredits(null); });
    return () => { cancelled = true; };
  }, [account]);

  const patch = (change: Partial<CreatorDraft>) => {
    setSubmitError('');
    setDraft((current) => ({ ...current, ...change }));
  };

  const isMusic = draft.mode === 'music';
  const files = draft.artwork ? [draft.artwork, ...draft.media] : draft.media;
  const inferredReleaseType = releaseTypeForTrackCount(draft.media.length);
  const submissionTitle = preferredLocalizedTitle(draft.localizedTitle) || draft.title.trim();

  const problems: string[] = [];
  if (!account) problems.push('Your creator workspace is still loading.');
  if (!hasMusicTitle(draft.localizedTitle)) {
    const titleKind = isMusic ? 'release' : draft.mode === 'learning_album' ? 'album' : 'lesson set';
    problems.push(`Add the ${titleKind} title in at least one language.`);
  }
  if (isMusic && !draft.musicTypeOption) problems.push('Choose a music type.');
  if (isMusic && draft.musicTypeOption === 'other' && !draft.musicType.trim()) problems.push('Enter the other music type.');
  if (isMusic && !draft.recordingTypeOption) problems.push('Choose a recording type.');
  if (draft.releaseTimingMode === 'scheduled' && !draft.scheduledReleaseAt.trim()) problems.push('Choose a scheduled release date and time.');
  if (isMusic && draft.recordingTypeOption === 'other' && !draft.recordingType.trim()) problems.push('Enter the other recording type.');
  if (isMusic && credits && !credits.identityArtist) problems.push('Your artist profile is still being set up.');
  if (!isMusic && !draft.learningArtistName.trim() && !draft.cantorId) {
    problems.push('Enter an artist name or choose an existing CHC artist profile.');
  }
  if (draft.mode === 'learning_lesson_set' && !draft.hymnId) problems.push('Choose the hymn these lessons teach.');
  if (!draft.media.length) problems.push(`Add at least one ${draft.mode === 'learning_lesson_set' ? 'lesson' : 'audio'} file.`);
  draft.media.forEach((file, index) => {
    const itemKind = isMusic ? 'track' : draft.mode === 'learning_album' ? 'recording' : 'lesson';
    if (!hasMusicTitle(file.localizedTitle)) {
      problems.push(`Add a title in at least one language for ${itemKind} ${index + 1}.`);
    }
    if (isMusic && (file.contributors ?? []).some((credit) => !credit.name.trim())) {
      problems.push(`Fill in or remove the unnamed contributor on track ${index + 1}.`);
    }
  });
  if (draft.mode !== 'learning_lesson_set' && draft.media.some((f) => f.mediaType !== 'audio')) {
    problems.push('Only audio files can be added here. Remove the video files, or switch to Lesson set.');
  }
  const blocking = files.length ? uploadsBlocking(files) : null;
  if (blocking) problems.push(blocking);

  function addMedia(picked: UploadCandidate[]) {
    if (!picked.length) return;
    setSubmitError('');
    setDraft((current) => ({
      ...current,
      media: current.mediaOrderManuallySet
        ? [...current.media, ...picked]
        : sortMediaByFilenameOrder([...current.media, ...picked]),
      releaseType: releaseTypeForTrackCount(current.media.length + picked.length),
    }));
    picked.forEach(uploadDraftFile);
  }

  function receiveArtwork(picked: UploadCandidate[]) {
    if (!picked.length) return;
    setSubmitError('');
    setDraft((current) => ({ ...current, artwork: picked[0] }));
    uploadDraftFile(picked[0]);
  }

  function receiveDroppedFiles(raw: any[]) {
    setSubmitError('');
    const kind = draft.mode === 'learning_lesson_set' ? 'lesson' : 'audio';
    const picked = droppedUploadCandidates(raw, kind);
    if (!picked.length) {
      setSubmitError(draft.mode === 'learning_lesson_set'
        ? 'Choose supported audio or video lesson files.'
        : 'Choose supported audio files.');
      return;
    }
    addMedia(picked);
  }

  function copyCreditsToAll(sourceFileId: string) {
    setDraft((current) => {
      const source = current.media.find((file) => file.id === sourceFileId);
      if (!source) return current;
      const stamp = Date.now();
      return {
        ...current,
        media: current.media.map((file) => {
          if (file.id === sourceFileId) return file;
          return {
            ...file,
            mainArtistName: source.mainArtistName ?? '',
            mainArtistId: source.mainArtistId,
            contributors: (source.contributors ?? []).map((credit, index) => ({
              ...credit,
              id: `${file.id}-credit-${stamp}-${index}`,
            })),
          };
        }),
      };
    });
  }

  function moveTrack(fromIndex: number, toIndex: number) {
    setDraft((current) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.media.length || toIndex >= current.media.length) {
        return current;
      }
      const media = [...current.media];
      const [moved] = media.splice(fromIndex, 1);
      media.splice(toIndex, 0, moved);
      return { ...current, media, mediaOrderManuallySet: true };
    });
  }

  async function discard() {
    if (!(await confirmAction('Discard this draft?', 'Everything you entered and uploaded for this submission will be cleared.', 'Discard'))) return;
    resetDraft();
    router.replace('/');
  }

  async function submit() {
    if (problems.length || !account) {
      setSubmitError(problems[0] ?? 'Your creator workspace is still loading.');
      return;
    }
    setBusy(true);
    setSubmitError('');
    try {
      const result = await creatorService.createSubmission(account.id, draft);
      resetDraft();
      void refresh();
      router.replace({ pathname: '/submission/[id]', params: { id: result.submissionId, submitted: '1' } });
    } catch (e) {
      setSubmitError(creatorService.describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page scrollEnabled={!draggingTracks}>
      <PageHeader
        title="New submission"
        subtitle={MODE_HELP[draft.mode]}
        action={<Button kind="ghost" label="← All submissions" onPress={() => router.navigate('/')} />}
      />

      <Card title="What are you submitting?">
        <Segmented items={MODES} value={draft.mode} onChange={(mode) => patch({ mode: mode as SubmissionMode })} />
      </Card>

      <Card
        title={isMusic ? 'Release title' : draft.mode === 'learning_album' ? 'Album title' : 'Lesson set title'}
        description={isMusic
          ? 'Enter the title of the release itself. English, Arabic, and French are individually optional, but at least one is required. Track titles are handled separately from the uploaded filenames.'
          : 'Enter the title of this submission. English, Arabic, and French are individually optional, but at least one is required.'}
      >
        <View style={styles.localeGrid}>
          {MUSIC_TITLE_LOCALES.map(({ key, label }) => (
            <View key={key} style={styles.localeField}>
              <Field
                label={label}
                value={draft.localizedTitle[key]}
                onChangeText={(value) => {
                  const localizedTitle = { ...draft.localizedTitle, [key]: value };
                  patch({ localizedTitle, title: preferredLocalizedTitle(localizedTitle) });
                }}
                style={key === 'ar' ? styles.rtl : undefined}
              />
            </View>
          ))}
        </View>
      </Card>

      <Card title="Details">
        <Field
          label="Description"
          value={draft.description}
          onChangeText={(description) => patch({ description })}
          multiline
          placeholder="Optional notes about this recording"
          hint={isMusic ? 'Do not put lyrics here. After the submission is complete, add lyrics for each track in Lyrics Studio.' : undefined}
        />
        {isMusic ? (
          <>
            <Dropdown
              label="Music type"
              items={MUSIC_TYPE_OPTIONS}
              value={draft.musicTypeOption}
              onChange={(value) => {
                const musicTypeOption = value as CreatorDraft['musicTypeOption'];
                patch({
                  musicTypeOption,
                  musicType: musicTypeOption === 'other' ? '' : (MUSIC_TYPE_VALUES[musicTypeOption] ?? ''),
                });
              }}
              placeholder="Choose a music type"
            />
            {draft.musicTypeOption === 'other' && (
              <Field
                label="Other music type"
                value={draft.musicType}
                onChangeText={(musicType) => patch({ musicType })}
                placeholder="Enter the music type"
              />
            )}

            <Dropdown
              label="Recording type"
              items={RECORDING_TYPE_OPTIONS}
              value={draft.recordingTypeOption}
              onChange={(value) => {
                const recordingTypeOption = value as CreatorDraft['recordingTypeOption'];
                patch({
                  recordingTypeOption,
                  recordingType: recordingTypeOption === 'other' ? '' : (RECORDING_TYPE_VALUES[recordingTypeOption] ?? ''),
                });
              }}
              placeholder="Choose a recording type"
            />
            {draft.recordingTypeOption === 'other' && (
              <Field
                label="Other recording type"
                value={draft.recordingType}
                onChangeText={(recordingType) => patch({ recordingType })}
                placeholder="Enter the recording type"
              />
            )}
            <View style={styles.group}>
              <Label>Released as</Label>
              <Text style={styles.identity}>{credits?.identityArtist?.displayName ?? account?.displayName ?? '—'}</Text>
              <Text style={uiStyles.muted}>
                Your account releases under your own name. To credit someone else on a particular
                song, set that song&apos;s main artist below.
              </Text>
            </View>

            <View style={styles.group}>
              <Label>Release timing</Label>
              <Segmented
                items={[
                  { id: 'asap', title: 'As soon as possible' },
                  { id: 'scheduled', title: 'Select date & time' },
                ]}
                value={draft.releaseTimingMode}
                onChange={(value) => patch({ releaseTimingMode: value as CreatorDraft['releaseTimingMode'] })}
              />
              <Text style={uiStyles.muted}>
                As soon as possible goes live immediately when CHC approves it. Scheduled releases go live automatically at the selected time after approval.
              </Text>
              {draft.releaseTimingMode === 'scheduled' && (
                <ReleaseDateTimeField
                  label="CHC release date & time"
                  value={draft.scheduledReleaseAt}
                  onChange={(scheduledReleaseAt) => patch({ scheduledReleaseAt })}
                  minimumDate={earliestReleaseChoice}
                  hint="Uses your local time. Choose an exact time at least 48 hours from now. Once CHC approves it, you do not need an admin to press Publish at release time. If you require a release date that is closer than 48 hours, please email x@x.x."
                />
              )}
              <ReleaseDateTimeField
                label="Originally released (optional)"
                value={draft.originalReleaseDate}
                onChange={(originalReleaseDate) => patch({ originalReleaseDate })}
                mode="date"
                optional
                hint="If this already came out on SoundCloud, YouTube, Spotify or Apple Music, choose that date here — it is the date listeners will see."
              />
            </View>
          </>
        ) : (
          <>
            <LearningContributorPicker
              accountId={account?.id}
              name={draft.learningArtistName}
              selectedArtistId={draft.cantorId}
              onNameChange={(learningArtistName) => patch({ learningArtistName, cantorId: '' })}
              onSelect={(cantorId, learningArtistName) => patch({ cantorId, learningArtistName })}
            />
            <View style={styles.group}>
              <Label>Season (optional)</Label>
              {catalog.seasons.length
                ? <Dropdown
                    label="Liturgical season"
                    items={catalog.seasons.map((season) => ({
                      id: season.id,
                      title: season.titleArabic ? `${season.title} · ${season.titleArabic}` : season.title,
                    }))}
                    value={draft.seasonId}
                    onChange={(seasonId) => patch({ seasonId })}
                    placeholder="Choose a season or Other"
                  />
                : <Text style={uiStyles.muted}>No seasons are published yet.</Text>}
            </View>
            {draft.mode === 'learning_lesson_set' && (
              <LearningHymnPicker
                accountId={account?.id}
                options={catalog.hymns}
                value={draft.hymnId}
                onChange={(hymnId) => patch({ hymnId })}
              />
            )}
            <View style={styles.group}>
              <Label>Release timing</Label>
              <Segmented
                items={[{ id: 'asap', title: 'As soon as possible' }, { id: 'scheduled', title: 'Select date & time' }]}
                value={draft.releaseTimingMode}
                onChange={(value) => patch({ releaseTimingMode: value as CreatorDraft['releaseTimingMode'] })}
              />
              <Text style={uiStyles.muted}>
                Publish as soon as CHC approves the learning material, or schedule publication at a specific date and time.
              </Text>
              {draft.releaseTimingMode === 'scheduled' && (
                <ReleaseDateTimeField
                  label="CHC release date & time"
                  value={draft.scheduledReleaseAt}
                  onChange={(scheduledReleaseAt) => patch({ scheduledReleaseAt })}
                  minimumDate={earliestReleaseChoice}
                  hint="Uses your local time. Choose a time at least 48 hours ahead; after approval it publishes automatically."
                />
              )}
              <ReleaseDateTimeField
                label="Originally released (optional)"
                value={draft.originalReleaseDate}
                onChange={(originalReleaseDate) => patch({ originalReleaseDate })}
                mode="date"
                optional
                hint="If these recordings or lessons were released elsewhere first, enter their original release date."
              />
            </View>
          </>
        )}
      </Card>

      <Card title="Artwork & media" description="Files upload privately as soon as you choose them. Nothing is sent to CHC review until you press Submit.">
        <FileDropZone
          kind={draft.mode === 'learning_lesson_set' ? 'lesson' : 'audio'}
          onFiles={receiveDroppedFiles}
        />

        <View style={uiStyles.actions}>
          <FileSelectButton
            label={draft.artwork ? 'Replace artwork' : 'Choose artwork'}
            kind="image"
            onFiles={receiveArtwork}
            onError={setSubmitError}
          />
          <FileSelectButton
            label={draft.mode === 'learning_lesson_set' ? 'Add lesson files' : 'Add audio files'}
            kind={draft.mode === 'learning_lesson_set' ? 'lesson' : 'audio'}
            multiple
            onFiles={addMedia}
            onError={setSubmitError}
          />
        </View>

        {draft.artwork && (
          <FileRow
            file={draft.artwork}
            previewing={previewId === draft.artwork.id}
            onPreview={() => setPreviewId(previewId === draft.artwork!.id ? null : draft.artwork!.id)}
            onRetry={() => uploadDraftFile(draft.artwork!)}
            onRemove={() => setDraft((current) => ({ ...current, artwork: undefined }))}
          />
        )}

        <ReorderableList
          items={draft.media}
          getKey={(file) => file.id}
          onMove={moveTrack}
          onDragActiveChange={setDraggingTracks}
          renderItem={(file, index, dragHandle) => (
            <View style={styles.trackCard}>
              <FileRow
                file={file}
                index={index}
                previewing={previewId === file.id}
                onPreview={() => setPreviewId(previewId === file.id ? null : file.id)}
                onRetry={() => uploadDraftFile(file)}
                onRemove={() => setDraft((current) => ({ ...current, media: current.media.filter((x) => x.id !== file.id) }))}
                dragHandle={dragHandle}
              />
              <TrackMetadataEditor
                value={file}
                index={index}
                total={draft.media.length}
                kind={isMusic ? 'track' : draft.mode === 'learning_album' ? 'recording' : 'lesson'}
                showCredits={isMusic}
                identityName={credits?.identityArtist?.displayName ?? account?.displayName ?? ''}
                accountId={account?.id}
                onCopyCreditsToAll={isMusic ? () => copyCreditsToAll(file.id) : undefined}
                onChange={(change) => setDraft((current) => ({
                  ...current,
                  media: current.media.map((x) => (x.id === file.id ? { ...x, ...change } : x)),
                }))}
              />
            </View>
          )}
        />

        {!files.length && <Text style={uiStyles.muted}>No files yet.</Text>}
      </Card>

      <Card title="Review & submit">
        <Text style={styles.previewTitle}>{submissionTitle || 'Untitled submission'}</Text>
        <Text style={uiStyles.muted}>
          {MODES.find((m) => m.id === draft.mode)?.title}
          {isMusic ? ` • ${inferredReleaseType.toUpperCase()}` : ''} • {draft.media.length} file{draft.media.length === 1 ? '' : 's'}
          {draft.artwork ? ' • artwork' : ''}
        </Text>
        {draft.media.length > 0 && (
          <View style={styles.group}>
            <Label>{isMusic ? 'Track order and titles' : draft.mode === 'learning_album' ? 'Recording order and titles' : 'Lesson order and titles'}</Label>
            {draft.media.map((file, index) => (
              <Text key={file.id} style={uiStyles.muted}>
                {draft.mode === 'learning_lesson_set'
                  ? `Lesson ${index + 1}`
                  : `${index + 1}. ${preferredLocalizedTitle(file.localizedTitle) || 'Title required'}`}
              </Text>
            ))}
          </View>
        )}

        {problems.length > 0 ? (
          <View style={styles.requirements}>
            <Text style={styles.requirementsTitle}>Before you can submit:</Text>
            {problems.map((problem) => <Text key={problem} style={uiStyles.muted}>• {problem}</Text>)}
          </View>
        ) : (
          <Banner tone="success">Everything is ready. CHC aims to review submissions within 48 hours.</Banner>
        )}
        {!!submitError && <Banner tone="error">{submitError}</Banner>}

        <View style={uiStyles.actions}>
          <Button kind="primary" label={busy ? 'Submitting…' : 'Submit to CHC'} busy={busy} disabled={problems.length > 0} onPress={() => void submit()} style={styles.submit} />
          <Button kind="danger" label="Discard draft" disabled={busy} onPress={() => void discard()} />
        </View>
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  inlineCreate: { gap: SPACING.sm, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.black },
  addLink: { alignSelf: 'flex-start' },
  localeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  localeField: { flexGrow: 1, flexBasis: 220 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  fileRow: { alignItems: 'center' },
  fileText: { flex: 1, minWidth: 200, gap: 3 },
  trackCard: {
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceSoft,
  },
  lessonIdentity: { gap: 4, paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  lessonIdentityTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 16, fontWeight: '800' },
  fileActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: COLORS.border, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: 4, backgroundColor: COLORS.gold },
  previewTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24 },
  requirements: { gap: 4, padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.sm, backgroundColor: COLORS.black },
  requirementsTitle: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
  submit: { minWidth: 180 },
  identity: { color: COLORS.goldBright, fontSize: 18, fontWeight: '900' },
  credits: { paddingLeft: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.sm },
  creditsBody: { gap: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.black },
  trackMetadata: { gap: SPACING.md, marginLeft: SPACING.md, marginBottom: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSoft },
  contributor: { gap: SPACING.sm, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
});
