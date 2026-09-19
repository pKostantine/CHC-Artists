import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FileDropZone } from '@/components/FileDropZone';
import { MediaPreview } from '@/components/MediaPreview';
import { ReleaseDateTimeField } from '@/components/ReleaseDateTimeField';
import { TrackMetadataEditor } from '@/components/TrackMetadataEditor';
import { Banner, Button, Card, Chips, Dropdown, Field, Label, Page, PageHeader, Segmented, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { creatorService } from '@/services/creatorService';
import type { CatalogOption, CreatorDraft, CreditOptions, SubmissionMode, UploadCandidate } from '@/types/creator';
import { confirmAction } from '@/utils/dialogs';
import { fileSize, uploadLabel } from '@/utils/format';
import { droppedUploadCandidates, pickUploadCandidates, uploadsBlocking } from '@/utils/uploads';
import { hasMusicTitle, MUSIC_TITLE_LOCALES, preferredLocalizedTitle, releaseTypeForTrackCount } from '@/utils/titles';

const MODES: { id: SubmissionMode; title: string }[] = [
  { id: 'music', title: 'Music release' },
  { id: 'learning_album', title: 'Learning album' },
  { id: 'learning_lesson_set', title: 'Lesson set' },
];

const MODE_HELP: Record<SubmissionMode, string> = {
  music: 'Enter the release title, choose the release details, then add audio. Track titles are guessed from filenames and remain editable. CHC determines Single, EP, or Album automatically.',
  learning_album: 'Enter the album title first, then choose a cantor or chorus and add the recordings.',
  learning_lesson_set: 'Enter the lesson set title first, then choose a cantor and add the lessons.',
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

function LearningContributorPicker({ allowChorus, options, value, onChange }: {
  allowChorus: boolean;
  options: CatalogOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { addPerson } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [newKind, setNewKind] = useState<'cantor' | 'chorus'>('cantor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const available = (allowChorus ? options : options.filter((option) => option.kind !== 'chorus'))
    .map((option) => ({
      id: option.id,
      title: option.kind === 'chorus' ? `${option.title} (Chorus)` : option.title,
    }));
  const label = allowChorus ? 'Cantor / Chorus' : 'Cantor';

  async function create() {
    setBusy(true);
    setError('');
    try {
      const kind = allowChorus ? newKind : 'cantor';
      const row = await addPerson(kind, name);
      onChange(row.id);
      setName('');
      setNewKind('cantor');
      setAdding(false);
    } catch (e) {
      setError(creatorService.describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.group}>
      <Label>{label}</Label>
      <Text style={uiStyles.muted}>
        Choose from CHC&apos;s existing list. New {allowChorus ? 'cantors or choruses' : 'cantors'} are saved to the database immediately.
      </Text>
      {available.length ? (
        <Chips items={available} value={value} onChange={onChange} />
      ) : (
        <Text style={uiStyles.muted}>No available {allowChorus ? 'cantors or choruses' : 'cantors'} yet.</Text>
      )}

      {adding || !available.length ? (
        <View style={styles.inlineCreate}>
          {allowChorus && (
            <View style={styles.group}>
              <Label>Contributor type</Label>
              <Segmented
                items={[{ id: 'cantor', title: 'Cantor' }, { id: 'chorus', title: 'Chorus' }]}
                value={newKind}
                onChange={(value) => setNewKind(value as 'cantor' | 'chorus')}
              />
            </View>
          )}
          <Field
            label={`New ${allowChorus ? newKind : 'cantor'} name`}
            value={name}
            onChangeText={(text) => { setName(text); setError(''); }}
            placeholder={allowChorus && newKind === 'chorus' ? 'e.g. St. Mark Chorus' : 'e.g. Mo’allem Ibrahim Ayad'}
            hint="This is added to CHC as soon as you press Add."
            onSubmitEditing={() => { if (name.trim()) void create(); }}
          />
          <View style={uiStyles.actions}>
            <Button
              kind="primary"
              label={`Add ${allowChorus ? newKind : 'cantor'}`}
              busy={busy}
              disabled={!name.trim()}
              onPress={() => void create()}
            />
            {available.length > 0 && (
              <Button
                kind="ghost"
                label="Cancel"
                onPress={() => { setAdding(false); setName(''); setNewKind('cantor'); setError(''); }}
              />
            )}
          </View>
          {!!error && <Banner tone="error">{error}</Banner>}
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} hitSlop={6} style={styles.addLink}>
          <Text style={uiStyles.link}>+ Add {allowChorus ? 'cantor / chorus' : 'cantor'}</Text>
        </Pressable>
      )}
    </View>
  );
}

function TrackDragHandle({ onMove }: { onMove: (delta: -1 | 1) => void }) {
  const lastStep = useRef(0);
  const [dragging, setDragging] = useState(false);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      lastStep.current = 0;
      setDragging(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const step = gesture.dy >= 0 ? Math.floor(gesture.dy / 56) : Math.ceil(gesture.dy / 56);
      while (lastStep.current < step) {
        onMove(1);
        lastStep.current += 1;
      }
      while (lastStep.current > step) {
        onMove(-1);
        lastStep.current -= 1;
      }
    },
    onPanResponderRelease: () => {
      lastStep.current = 0;
      setDragging(false);
    },
    onPanResponderTerminate: () => {
      lastStep.current = 0;
      setDragging(false);
    },
  }), [onMove]);

  return (
    <View {...responder.panHandlers} style={[styles.dragHandle, dragging && styles.dragHandleActive]}>
      <Text style={styles.dragHandleText}>☰ Drag</Text>
    </View>
  );
}

function FileRow({ file, index, total, previewing, onPreview, onRetry, onRemove, onMove }: {
  file: UploadCandidate;
  index?: number;
  total?: number;
  previewing: boolean;
  onPreview: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onMove?: (delta: -1 | 1) => void;
}) {
  const statusStyle = file.error ? uiStyles.error : file.uploaded ? uiStyles.success : uiStyles.muted;
  return (
    <View>
      <View style={uiStyles.row}>
        <View style={styles.fileText}>
          <Text style={uiStyles.rowTitle} numberOfLines={1}>{index === undefined ? `Artwork: ${file.name}` : `${index + 1}. ${file.name}`}</Text>
          <Text style={statusStyle}>{fileSize(file.size)} • {uploadLabel(file)}</Text>
          {file.uploading && (
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(file.progress * 100)}%` }]} /></View>
          )}
          {!!file.error && <Text style={uiStyles.errorDetail}>{file.error}</Text>}
        </View>
        <View style={styles.fileActions}>
          {onMove && index !== undefined && total !== undefined && (
            <>
              <TrackDragHandle onMove={onMove} />
              <Pressable accessibilityLabel="Move up" disabled={index === 0} onPress={() => onMove(-1)} hitSlop={6}>
                <Text style={[styles.order, index === 0 && styles.dim]}>↑</Text>
              </Pressable>
              <Pressable accessibilityLabel="Move down" disabled={index === total - 1} onPress={() => onMove(1)} hitSlop={6}>
                <Text style={[styles.order, index === total - 1 && styles.dim]}>↓</Text>
              </Pressable>
            </>
          )}
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
  const { account, dashboard, catalog, draft, setDraft, resetDraft, uploadDraftFile, refresh } = useWorkspace();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [credits, setCredits] = useState<CreditOptions | null>(null);
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
  if (isMusic && draft.recordingTypeOption === 'other' && !draft.recordingType.trim()) problems.push('Enter the other recording type.');
  if (isMusic && credits && !credits.identityArtist) problems.push('Your artist profile is still being set up.');
  if (draft.mode === 'learning_album' && !draft.cantorId) problems.push('Choose or add a cantor / chorus.');
  if (draft.mode === 'learning_lesson_set' && !draft.cantorId) problems.push('Choose or add a cantor.');
  if (draft.mode === 'learning_lesson_set' && dashboard.cantors.find((option) => option.id === draft.cantorId)?.kind === 'chorus') {
    problems.push('Lesson sets must be taught by a cantor, not a chorus.');
  }
  if (draft.mode === 'learning_lesson_set' && !draft.hymnId) problems.push('Choose the hymn these lessons teach.');
  if (!draft.media.length) problems.push(`Add at least one ${draft.mode === 'learning_lesson_set' ? 'lesson' : 'audio'} file.`);
  if (isMusic) {
    draft.media.forEach((file, index) => {
      if (!hasMusicTitle(file.localizedTitle)) problems.push(`Add a title in at least one language for track ${index + 1}.`);
      if ((file.contributors ?? []).some((credit) => !credit.name.trim())) {
        problems.push(`Fill in or remove the unnamed contributor on track ${index + 1}.`);
      }
    });
  }
  if (draft.mode !== 'learning_lesson_set' && draft.media.some((f) => f.mediaType !== 'audio')) {
    problems.push('Only audio files can be added here. Remove the video files, or switch to Lesson set.');
  }
  const blocking = files.length ? uploadsBlocking(files) : null;
  if (blocking) problems.push(blocking);

  function addMedia(picked: UploadCandidate[]) {
    if (!picked.length) return;
    setDraft((current) => ({
      ...current,
      media: [...current.media, ...picked],
      releaseType: releaseTypeForTrackCount(current.media.length + picked.length),
    }));
    picked.forEach(uploadDraftFile);
  }

  async function pick(kind: 'artwork' | 'media') {
    setSubmitError('');
    const picked = await pickUploadCandidates(
      kind === 'artwork' ? 'image' : draft.mode === 'learning_lesson_set' ? 'lesson' : 'audio',
      kind === 'media',
    );
    if (!picked.length) return;
    if (kind === 'artwork') {
      setDraft((current) => ({ ...current, artwork: picked[0] }));
      picked.forEach(uploadDraftFile);
    } else {
      addMedia(picked);
    }
  }

  function receiveDroppedFiles(raw: any[]) {
    setSubmitError('');
    const kind = draft.mode === 'learning_lesson_set' ? 'lesson' : 'audio';
    const picked = droppedUploadCandidates(raw, kind);
    if (!picked.length) {
      setSubmitError(draft.mode === 'learning_lesson_set'
        ? 'Drop audio or video lesson files here.'
        : 'Drop supported audio files here.');
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
            contributors: (source.contributors ?? []).map((credit, index) => ({
              ...credit,
              id: `${file.id}-credit-${stamp}-${index}`,
            })),
          };
        }),
      };
    });
  }

  function move(fileId: string, delta: -1 | 1) {
    setDraft((current) => {
      const media = [...current.media];
      const index = media.findIndex((file) => file.id === fileId);
      if (index < 0) return current;
      const next = index + delta;
      if (next < 0 || next >= media.length) return current;
      [media[index], media[next]] = [media[next], media[index]];
      return { ...current, media };
    });
  }

  async function discard() {
    if (!(await confirmAction('Discard this draft?', 'Everything you entered and uploaded for this submission will be cleared.', 'Discard'))) return;
    resetDraft();
    router.replace('/submission');
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
    <Page>
      <PageHeader
        title="New submission"
        subtitle={MODE_HELP[draft.mode]}
        action={<Button kind="ghost" label="← All submissions" onPress={() => router.navigate('/submission')} />}
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
              <Label>Release date</Label>
              <ReleaseDateTimeField
                label="CHC release date & time"
                value={draft.scheduledReleaseAt}
                onChange={(scheduledReleaseAt) => patch({ scheduledReleaseAt })}
                minimumDate={earliestReleaseChoice}
                hint="Uses your local time. Choose an exact time at least 48 hours from now so CHC has time to review it. If you require a release date that is closer than 48 hours, please email x@x.x."
              />
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
              allowChorus={draft.mode === 'learning_album'}
              options={dashboard.cantors}
              value={draft.cantorId}
              onChange={(cantorId) => patch({ cantorId })}
            />
            <View style={styles.group}>
              <Label>Season (optional)</Label>
              {catalog.seasons.length
                ? <Chips items={catalog.seasons} value={draft.seasonId} onChange={(seasonId) => patch({ seasonId })} />
                : <Text style={uiStyles.muted}>No seasons are published yet.</Text>}
            </View>
            {draft.mode === 'learning_lesson_set' && (
              <View style={styles.group}>
                <Label>Hymn</Label>
                {catalog.hymns.length
                  ? <Chips items={catalog.hymns} value={draft.hymnId} onChange={(hymnId) => patch({ hymnId })} />
                  : <Text style={uiStyles.muted}>No hymns are published yet, so lesson sets cannot be submitted.</Text>}
              </View>
            )}
          </>
        )}
      </Card>

      <Card title="Artwork & media" description="Files upload privately as soon as you choose them. Nothing is sent to CHC review until you press Submit.">
        <FileDropZone
          kind={draft.mode === 'learning_lesson_set' ? 'lesson' : 'audio'}
          onFiles={receiveDroppedFiles}
        />

        <View style={uiStyles.actions}>
          <Button label={draft.artwork ? 'Replace artwork' : 'Choose artwork'} onPress={() => void pick('artwork')} />
          <Button label={draft.mode === 'learning_lesson_set' ? 'Add lesson files' : 'Add audio files'} onPress={() => void pick('media')} />
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

        {draft.media.map((file, index) => (
          <View key={file.id}>
            <FileRow
              file={file}
              index={index}
              total={draft.media.length}
              previewing={previewId === file.id}
              onPreview={() => setPreviewId(previewId === file.id ? null : file.id)}
              onRetry={() => uploadDraftFile(file)}
              onRemove={() => setDraft((current) => ({ ...current, media: current.media.filter((x) => x.id !== file.id) }))}
              onMove={(delta) => move(file.id, delta)}
            />
            {isMusic && (
              <TrackMetadataEditor
                value={file}
                index={index}
                total={draft.media.length}
                identityName={credits?.identityArtist?.displayName ?? account?.displayName ?? ''}
                onCopyCreditsToAll={() => copyCreditsToAll(file.id)}
                onChange={(change) => setDraft((current) => ({
                  ...current,
                  media: current.media.map((x) => (x.id === file.id ? { ...x, ...change } : x)),
                }))}
              />
            )}
          </View>
        ))}

        {!files.length && <Text style={uiStyles.muted}>No files yet.</Text>}
      </Card>

      <Card title="Review & submit">
        <Text style={styles.previewTitle}>{submissionTitle || 'Untitled submission'}</Text>
        <Text style={uiStyles.muted}>
          {MODES.find((m) => m.id === draft.mode)?.title}
          {isMusic ? ` • ${inferredReleaseType.toUpperCase()}` : ''} • {draft.media.length} file{draft.media.length === 1 ? '' : 's'}
          {draft.artwork ? ' • artwork' : ''}
        </Text>

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
  fileText: { flex: 1, minWidth: 200, gap: 3 },
  fileActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: COLORS.border, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: 4, backgroundColor: COLORS.gold },
  order: { color: COLORS.goldBright, fontSize: 20 },
  dim: { opacity: 0.25 },
  previewTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24 },
  requirements: { gap: 4, padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.sm, backgroundColor: COLORS.black },
  requirementsTitle: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
  submit: { minWidth: 180 },
  identity: { color: COLORS.goldBright, fontSize: 18, fontWeight: '900' },
  credits: { paddingLeft: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.sm },
  creditsBody: { gap: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.black },
  trackMetadata: { gap: SPACING.md, marginLeft: SPACING.md, marginBottom: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSoft },
  contributor: { gap: SPACING.sm, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  dragHandle: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: RADII.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.black },
  dragHandleActive: { borderColor: COLORS.gold, backgroundColor: COLORS.surfaceSoft },
  dragHandleText: { color: COLORS.goldBright, fontWeight: '900', fontSize: 12 },
});
