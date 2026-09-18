import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MediaPreview } from '@/components/MediaPreview';
import { Banner, Button, Card, Chips, Field, Label, Page, PageHeader, Segmented, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { creatorService } from '@/services/creatorService';
import type { CatalogOption, CreatorDraft, CreditOptions, SubmissionMode, UploadCandidate } from '@/types/creator';
import { confirmAction } from '@/utils/dialogs';
import { fileSize, uploadLabel } from '@/utils/format';
import { pickUploadCandidates, uploadsBlocking } from '@/utils/uploads';

const MODES: { id: SubmissionMode; title: string }[] = [
  { id: 'music', title: 'Music release' },
  { id: 'learning_album', title: 'Learning album' },
  { id: 'learning_lesson_set', title: 'Lesson set' },
];

const MODE_HELP: Record<SubmissionMode, string> = {
  music: 'A single, EP, or album credited to one of your artists. Add audio tracks in order.',
  learning_album: 'Full hymn recordings by a cantor for Learn & Study. Add audio recordings in order.',
  learning_lesson_set: 'Teaching lessons for one hymn. Add video or audio lessons in order.',
};

const LOCALES = [
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'Arabic' },
  { key: 'cop', label: 'Coptic' },
  { key: 'fr', label: 'French' },
] as const;

function PersonPicker({ kind, options, value, onChange }: {
  kind: 'artist' | 'cantor';
  options: CatalogOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { addPerson } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true);
    setError('');
    try {
      const row = await addPerson(kind, name);
      onChange(row.id);
      setName('');
      setAdding(false);
    } catch (e) {
      setError(creatorService.describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.group}>
      <Label>{kind === 'artist' ? 'Artist' : 'Cantor'}</Label>
      {options.length ? (
        <Chips items={options} value={value} onChange={onChange} />
      ) : (
        <Text style={uiStyles.muted}>You have no {kind}s yet. Create one to continue.</Text>
      )}
      {adding || !options.length ? (
        <View style={styles.inlineCreate}>
          <Field
            label={`New ${kind} name`}
            value={name}
            onChangeText={(text) => { setName(text); setError(''); }}
            placeholder={kind === 'artist' ? 'e.g. St. Mark Choir' : 'e.g. Mo’allem Ibrahim Ayad'}
            onSubmitEditing={() => { if (name.trim()) void create(); }}
          />
          <View style={uiStyles.actions}>
            <Button kind="primary" label={`Create ${kind}`} busy={busy} disabled={!name.trim()} onPress={() => void create()} />
            {options.length > 0 && <Button kind="ghost" label="Cancel" onPress={() => { setAdding(false); setName(''); setError(''); }} />}
          </View>
          {!!error && <Banner tone="error">{error}</Banner>}
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} hitSlop={6} style={styles.addLink}>
          <Text style={uiStyles.link}>+ New {kind}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Per-song credits. The main artist is the account's own identity unless the
 * artist says otherwise, which is the case that matters for a cantor's
 * recording posted by someone else.
 */
function TrackCredits({ file, options, onChange }: {
  file: UploadCandidate;
  options: CreditOptions | null;
  onChange: (change: Partial<UploadCandidate>) => void;
}) {
  const [open, setOpen] = useState(false);

  const identity = options?.identityArtist ?? null;
  const artists = options?.creditableArtists ?? [];
  const mainId = file.mainArtistId || identity?.id || '';
  const featured = file.featuredArtistIds ?? [];

  const mainName = artists.find((a) => a.id === mainId)?.displayName ?? identity?.displayName ?? '—';
  const featuredNames = featured
    .map((id) => artists.find((a) => a.id === id)?.displayName)
    .filter(Boolean)
    .join(', ');

  function toggleFeatured(id: string) {
    onChange({
      featuredArtistIds: featured.includes(id) ? featured.filter((x) => x !== id) : [...featured, id],
    });
  }

  return (
    <View style={styles.credits}>
      <Pressable onPress={() => setOpen(!open)} hitSlop={6} style={styles.addLink}>
        <Text style={uiStyles.link}>
          {open ? 'Hide credits' : `Credits: ${mainName}${featuredNames ? ` feat. ${featuredNames}` : ''}`}
        </Text>
      </Pressable>

      {open && (
        <View style={styles.creditsBody}>
          <View style={styles.group}>
            <Label>Main artist</Label>
            <Chips
              items={artists.map((a) => ({
                id: a.id,
                title: a.id === identity?.id ? `${a.displayName} (you)` : a.displayName,
              }))}
              value={mainId}
              onChange={(id) => onChange({ mainArtistId: id === identity?.id ? undefined : id })}
            />
          </View>

          <View style={styles.group}>
            <Label>Featured on this song</Label>
            {artists.filter((a) => a.id !== mainId).length ? (
              <View style={styles.featureRow}>
                {artists.filter((a) => a.id !== mainId).map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => toggleFeatured(a.id)}
                    accessibilityState={{ selected: featured.includes(a.id) }}
                    style={[styles.featureChip, featured.includes(a.id) && styles.featureChipOn]}
                  >
                    <Text style={[styles.featureText, featured.includes(a.id) && styles.featureTextOn]}>
                      {a.displayName}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={uiStyles.muted}>No one else to credit yet.</Text>
            )}
          </View>
        </View>
      )}
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

  const problems: string[] = [];
  if (!account) problems.push('Your creator workspace is still loading.');
  if (!draft.title.trim()) problems.push('Add a title.');
  if (isMusic && credits && !credits.identityArtist) problems.push('Your artist profile is still being set up.');
  if (!isMusic && !draft.cantorId) problems.push('Choose or create a cantor.');
  if (draft.mode === 'learning_lesson_set' && !draft.hymnId) problems.push('Choose the hymn these lessons teach.');
  if (!draft.media.length) problems.push(`Add at least one ${draft.mode === 'learning_lesson_set' ? 'lesson' : 'audio'} file.`);
  if (draft.mode !== 'learning_lesson_set' && draft.media.some((f) => f.mediaType !== 'audio')) {
    problems.push('Only audio files can be added here. Remove the video files, or switch to Lesson set.');
  }
  const blocking = files.length ? uploadsBlocking(files) : null;
  if (blocking) problems.push(blocking);

  async function pick(kind: 'artwork' | 'media') {
    setSubmitError('');
    const picked = await pickUploadCandidates(
      kind === 'artwork' ? 'image' : draft.mode === 'learning_lesson_set' ? 'lesson' : 'audio',
      kind === 'media',
    );
    if (!picked.length) return;
    if (kind === 'artwork') {
      setDraft((current) => ({ ...current, artwork: picked[0] }));
    } else {
      setDraft((current) => ({ ...current, media: [...current.media, ...picked] }));
    }
    picked.forEach(uploadDraftFile);
  }

  function move(index: number, delta: -1 | 1) {
    setDraft((current) => {
      const media = [...current.media];
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

      <Card title="Details">
        <Field label="Title" value={draft.title} onChangeText={(title) => patch({ title })} placeholder="Shown to reviewers and, once published, to listeners" />
        <Field label="Description" value={draft.description} onChangeText={(description) => patch({ description })} multiline placeholder="Optional notes about this recording" />
        {isMusic ? (
          <>
            <View style={styles.group}>
              <Label>Release type</Label>
              <Segmented
                items={[{ id: 'single', title: 'Single' }, { id: 'ep', title: 'EP' }, { id: 'album', title: 'Album' }]}
                value={draft.releaseType}
                onChange={(releaseType) => patch({ releaseType: releaseType as CreatorDraft['releaseType'] })}
              />
            </View>
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
              <Field
                label="Goes live on CHC"
                value={draft.scheduledReleaseAt}
                onChangeText={(scheduledReleaseAt) => patch({ scheduledReleaseAt })}
                placeholder="YYYY-MM-DD"
                hint="At least 48 hours from now, so CHC has time to review it."
              />
              <Field
                label="Originally released (optional)"
                value={draft.originalReleaseDate}
                onChangeText={(originalReleaseDate) => patch({ originalReleaseDate })}
                placeholder="YYYY-MM-DD"
                hint="If this already came out on SoundCloud, YouTube, Spotify or Apple Music, put that date here — it is the date listeners will see."
              />
            </View>
          </>
        ) : (
          <>
            <PersonPicker kind="cantor" options={dashboard.cantors} value={draft.cantorId} onChange={(cantorId) => patch({ cantorId })} />
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

      <Card title="Localized titles" description="Optional. Add the title in each language it should appear in.">
        <View style={styles.localeGrid}>
          {LOCALES.map(({ key, label }) => (
            <View key={key} style={styles.localeField}>
              <Field
                label={label}
                value={draft.localizedTitle[key]}
                onChangeText={(value) => patch({ localizedTitle: { ...draft.localizedTitle, [key]: value } })}
                style={key === 'ar' ? styles.rtl : undefined}
              />
            </View>
          ))}
        </View>
      </Card>

      <Card title="Artwork & media" description="Files upload privately as soon as you choose them. Nothing is sent to CHC review until you press Submit.">
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
              onMove={(delta) => move(index, delta)}
            />
            {isMusic && (
              <TrackCredits
                file={file}
                options={credits}
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
        <Text style={styles.previewTitle}>{draft.title || 'Untitled submission'}</Text>
        <Text style={uiStyles.muted}>
          {MODES.find((m) => m.id === draft.mode)?.title}
          {isMusic ? ` • ${draft.releaseType.toUpperCase()}` : ''} • {draft.media.length} file{draft.media.length === 1 ? '' : 's'}
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
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featureChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.border },
  featureChipOn: { borderColor: COLORS.gold, backgroundColor: COLORS.surfaceSoft },
  featureText: { color: COLORS.muted, fontWeight: '700', fontSize: 13 },
  featureTextOn: { color: COLORS.goldBright },
});
