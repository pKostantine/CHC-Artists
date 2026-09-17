import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { creatorService } from '@/services/creatorService';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { CatalogOption, CreatorAccount, CreatorDraft, CreatorSubmission, UploadCandidate } from '@/types/creator';
import { LyricsStudio } from '@/components/LyricsStudio';
import { MediaPreview } from '@/components/MediaPreview';
import { ReviseSubmission } from '@/components/ReviseSubmission';

const emptyDraft = (): CreatorDraft => ({
  mode: 'music',
  title: '',
  description: '',
  releaseType: 'single',
  artistId: '',
  cantorId: '',
  seasonId: '',
  hymnId: '',
  localizedTitle: { en: '', ar: '', cop: '', fr: '' },
  media: [],
});

function statusLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function uploadLabel(file: UploadCandidate) {
  if (file.error) return 'Upload failed';
  if (file.uploaded && file.uploadIntentId) return 'Uploaded';
  if (file.uploading) return `Uploading ${Math.max(1, Math.round(file.progress * 100))}%`;
  return 'Ready to upload';
}

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholderTextColor={COLORS.muted}
      />
    </View>
  );
}

function Chips({ items, value, onChange }: { items: { id: string; title: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      {items.map((x) => (
        <Pressable key={x.id} onPress={() => onChange(x.id)} style={[styles.chip, value === x.id && styles.chipActive]}>
          <Text style={[styles.chipText, value === x.id && styles.chipTextActive]}>{x.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function CreatorDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [accounts, setAccounts] = useState<CreatorAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [submissions, setSubmissions] = useState<CreatorSubmission[]>([]);
  const [artists, setArtists] = useState<CatalogOption[]>([]);
  const [cantors, setCantors] = useState<CatalogOption[]>([]);
  const [seasons, setSeasons] = useState<CatalogOption[]>([]);
  const [hymns, setHymns] = useState<CatalogOption[]>([]);
  const [tab, setTab] = useState<'home' | 'create' | 'lyrics'>('home');
  const [draft, setDraft] = useState(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [revising, setRevising] = useState<CreatorSubmission | null>(null);
  const [submissionError, setSubmissionError] = useState('');

  const account = accounts.find((x) => x.id === accountId);
  const editable = useMemo(
    () => submissions.filter((x) => ['draft', 'uploading', 'ready_to_submit', 'changes_requested'].includes(x.status)),
    [submissions],
  );

  const selectedFiles = draft.artwork ? [draft.artwork, ...draft.media] : draft.media;
  const uploadInProgress = selectedFiles.some((file) => file.uploading);
  const uploadFailed = selectedFiles.some((file) => Boolean(file.error));
  const uploadPending = selectedFiles.some((file) => !file.uploaded || !file.uploadIntentId);
  const submitProblems: string[] = [];
  if (!accountId) submitProblems.push('A creator workspace is required.');
  if (!draft.title.trim()) submitProblems.push('Add a title.');
  if (!draft.media.length) submitProblems.push('Add at least one media file.');
  if (draft.mode === 'music' && !draft.artistId) submitProblems.push('Choose an artist.');
  if (draft.mode !== 'music' && !draft.cantorId) submitProblems.push('Choose a cantor.');
  if (draft.mode === 'learning_lesson_set' && !draft.hymnId) submitProblems.push('Choose a hymn.');
  if (uploadInProgress) submitProblems.push('Wait for the selected files to finish uploading.');
  else if (uploadFailed) submitProblems.push('Retry the failed upload before submitting.');
  else if (uploadPending && selectedFiles.length) submitProblems.push('Upload all selected files before submitting.');

  useEffect(() => {
    void (async () => {
      try {
        await creatorService.ensureWorkspace();
        const rows = await creatorService.accounts();
        setAccounts(rows);
        if (rows[0]) setAccountId(rows[0].id);
      } catch (e) {
        Alert.alert('Unable to load creator access', creatorService.describeError(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!accountId) return;
    void Promise.all([
      creatorService.submissions(accountId),
      creatorService.artists(accountId),
      creatorService.cantors(accountId),
      creatorService.seasons(),
      creatorService.hymns(),
    ]).then(([s, a, c, se, h]) => {
      setSubmissions(s);
      setArtists(a);
      setCantors(c);
      setSeasons(se);
      setHymns(h);
    }).catch((e) => Alert.alert('Unable to load creator data', creatorService.describeError(e)));
  }, [accountId]);

  function patchUpload(id: string, patch: Partial<UploadCandidate>) {
    setDraft((current) => ({
      ...current,
      artwork: current.artwork?.id === id ? { ...current.artwork, ...patch } : current.artwork,
      media: current.media.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  }

  async function startUpload(file: UploadCandidate) {
    if (!accountId) {
      patchUpload(file.id, { uploading: false, uploaded: false, error: 'Creator workspace is still loading. Try again in a moment.' });
      return;
    }

    patchUpload(file.id, { uploading: true, uploaded: false, uploadIntentId: undefined, error: undefined, progress: 0 });
    try {
      const uploadIntentId = await creatorService.upload(accountId, file, (progress) => {
        patchUpload(file.id, { progress, uploading: progress < 1 });
      });
      patchUpload(file.id, { uploadIntentId, uploaded: true, uploading: false, progress: 1, error: undefined });
    } catch (e) {
      patchUpload(file.id, {
        uploading: false,
        uploaded: false,
        uploadIntentId: undefined,
        progress: 0,
        error: creatorService.describeError(e),
      });
    }
  }

  async function pick(mediaType: 'audio' | 'video' | 'image') {
    setSubmissionError('');
    const result = await DocumentPicker.getDocumentAsync({
      type: mediaType === 'audio' ? 'audio/*' : mediaType === 'video' ? 'video/*' : 'image/*',
      copyToCacheDirectory: true,
      multiple: mediaType !== 'image',
    });
    if (result.canceled) return;

    const stamp = Date.now();
    const files: UploadCandidate[] = result.assets.map((x, index) => ({
      id: `${stamp}-${index}-${x.name}`,
      name: x.name,
      uri: x.uri,
      mimeType: x.mimeType || '',
      size: x.size || 0,
      mediaType,
      progress: 0,
      uploading: false,
      uploaded: false,
    }));

    if (mediaType === 'image') {
      setDraft((current) => ({ ...current, artwork: files[0] }));
    } else {
      setDraft((current) => ({ ...current, media: [...current.media, ...files] }));
    }

    for (const file of files) void startUpload(file);
  }

  function move(index: number, delta: number) {
    setDraft((current) => {
      const media = [...current.media];
      const next = index + delta;
      if (next < 0 || next >= media.length) return current;
      [media[index], media[next]] = [media[next], media[index]];
      return { ...current, media };
    });
  }

  async function createPerson(kind: 'artist' | 'cantor') {
    if (!newName.trim() || !accountId) return;
    setBusy(true);
    try {
      const row = kind === 'artist'
        ? await creatorService.createArtist(accountId, newName)
        : await creatorService.createCantor(accountId, newName);
      if (kind === 'artist') setArtists((x) => [...x, row]);
      else setCantors((x) => [...x, row]);
      setNewName('');
    } catch (e) {
      Alert.alert('Could not create', creatorService.describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitDraft() {
    setSubmissionError('');
    if (submitProblems.length) {
      setSubmissionError(submitProblems[0]);
      return;
    }

    const files = draft.artwork ? [draft.artwork, ...draft.media] : draft.media;
    if (files.some((file) => !file.uploaded || !file.uploadIntentId)) {
      setSubmissionError('Every selected file must finish uploading before the submission can be sent.');
      return;
    }

    setBusy(true);
    try {
      const type = draft.mode === 'music' ? 'music_release' : draft.mode;
      const submissionId = await creatorService.createSubmission(accountId, type, draft.title, draft.description);

      if (draft.mode === 'music') {
        await creatorService.createRelease(
          accountId,
          draft.artistId,
          draft.releaseType,
          draft.title,
          draft.description,
          draft.localizedTitle,
        );
      } else {
        await creatorService.createLearningShell(
          draft.mode === 'learning_album' ? 'album' : 'lesson_set',
          accountId,
          draft.cantorId,
          draft.seasonId,
          draft.hymnId,
          draft.title,
          draft.description,
          submissionId,
          draft.localizedTitle,
        );
      }

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        await creatorService.attachUpload(submissionId, file.uploadIntentId!, file.name, i);
      }

      await creatorService.submit(submissionId);
      setDraft(emptyDraft());
      setSubmissions(await creatorService.submissions(accountId));
      setTab('home');
      Alert.alert('Submitted', 'Your submission is now in CHC review.');
    } catch (e) {
      const detail = creatorService.describeError(e);
      setSubmissionError(detail);
      Alert.alert('Submission stopped', detail);
    } finally {
      setBusy(false);
    }
  }

  if (revising) {
    return (
      <ReviseSubmission
        accountId={accountId}
        submission={revising}
        onClose={(changed) => {
          setRevising(null);
          if (changed) void creatorService.submissions(accountId).then(setSubmissions);
        }}
      />
    );
  }

  if (tab === 'lyrics') return <LyricsStudio onSignOut={() => setTab('home')} />;

  return (
    <View style={styles.root}>
      <View style={styles.sidebar}>
        <Text style={styles.brand}>CHC ARTISTS</Text>
        <Text style={styles.account}>{account?.display_name || 'Creator Dashboard'}</Text>
        <Pressable style={styles.nav} onPress={() => setTab('home')}><Text style={styles.navText}>Dashboard</Text></Pressable>
        <Pressable style={styles.nav} onPress={() => setTab('create')}><Text style={styles.navText}>Create submission</Text></Pressable>
        <Pressable style={styles.nav} onPress={() => setTab('lyrics')}><Text style={styles.navText}>Lyrics Studio</Text></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onSignOut}><Text style={styles.muted}>Sign out</Text></Pressable>
      </View>

      <ScrollView style={styles.main} contentContainerStyle={styles.content}>
        {accounts.length > 1 && (
          <Chips items={accounts.map((x) => ({ id: x.id, title: x.display_name }))} value={accountId} onChange={setAccountId} />
        )}

        {tab === 'home' ? (
          <>
            <Text style={styles.hero}>Creator dashboard</Text>
            <Text style={styles.subhero}>Manage Music and Learn & Study submissions from draft through publication.</Text>
            <View style={styles.stats}>
              <View style={styles.stat}><Text style={styles.statNum}>{editable.length}</Text><Text style={styles.muted}>Editable</Text></View>
              <View style={styles.stat}><Text style={styles.statNum}>{submissions.filter((x) => x.status === 'pending_review').length}</Text><Text style={styles.muted}>In review</Text></View>
              <View style={styles.stat}><Text style={styles.statNum}>{submissions.filter((x) => x.status === 'published').length}</Text><Text style={styles.muted}>Published</Text></View>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Submissions</Text>
              {submissions.length ? submissions.map((s) => (
                <View key={s.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{s.title}</Text>
                    <Text style={styles.muted}>{s.submission_type.replaceAll('_', ' ')} • Updated {new Date(s.updated_at).toLocaleDateString()}</Text>
                    {s.status === 'changes_requested' && s.review_notes ? <Text style={styles.warning}>Changes requested: {s.review_notes}</Text> : null}
                  </View>
                  {s.status === 'changes_requested' ? <Pressable onPress={() => setRevising(s)}><Text style={styles.link}>Address changes</Text></Pressable> : null}
                  <View style={styles.status}><Text style={styles.statusText}>{statusLabel(s.status)}</Text></View>
                </View>
              )) : <Text style={styles.muted}>No submissions yet.</Text>}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.hero}>New submission</Text>
            <Chips
              items={[{ id: 'music', title: 'Music release' }, { id: 'learning_album', title: 'Learning album' }, { id: 'learning_lesson_set', title: 'Lesson set' }]}
              value={draft.mode}
              onChange={(mode) => {
                setSubmissionError('');
                setDraft((current) => ({ ...current, mode: mode as CreatorDraft['mode'] }));
              }}
            />

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Metadata</Text>
              <Field label="Title" value={draft.title} onChange={(title) => { setSubmissionError(''); setDraft((current) => ({ ...current, title })); }} />
              <Field label="Description" value={draft.description} onChange={(description) => setDraft((current) => ({ ...current, description }))} multiline />
              {draft.mode === 'music' && (
                <>
                  <Text style={styles.label}>Release type</Text>
                  <Chips items={[{ id: 'single', title: 'Single' }, { id: 'ep', title: 'EP' }, { id: 'album', title: 'Album' }]} value={draft.releaseType} onChange={(releaseType) => setDraft((current) => ({ ...current, releaseType: releaseType as CreatorDraft['releaseType'] }))} />
                  <Text style={styles.label}>Artist</Text>
                  <Chips items={artists} value={draft.artistId} onChange={(artistId) => { setSubmissionError(''); setDraft((current) => ({ ...current, artistId })); }} />
                </>
              )}
              {draft.mode !== 'music' && (
                <>
                  <Text style={styles.label}>Cantor</Text>
                  <Chips items={cantors} value={draft.cantorId} onChange={(cantorId) => { setSubmissionError(''); setDraft((current) => ({ ...current, cantorId })); }} />
                  <Text style={styles.label}>Season</Text>
                  <Chips items={seasons} value={draft.seasonId} onChange={(seasonId) => setDraft((current) => ({ ...current, seasonId }))} />
                  {draft.mode === 'learning_lesson_set' && (
                    <>
                      <Text style={styles.label}>Hymn</Text>
                      <Chips items={hymns} value={draft.hymnId} onChange={(hymnId) => { setSubmissionError(''); setDraft((current) => ({ ...current, hymnId })); }} />
                    </>
                  )}
                </>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Localized titles</Text>
              {(['en', 'ar', 'cop', 'fr'] as const).map((locale) => (
                <Field
                  key={locale}
                  label={{ en: 'English', ar: 'Arabic', cop: 'Coptic', fr: 'French' }[locale]}
                  value={draft.localizedTitle[locale]}
                  onChange={(value) => setDraft((current) => ({ ...current, localizedTitle: { ...current.localizedTitle, [locale]: value } }))}
                />
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>People</Text>
              <Field label={`New ${draft.mode === 'music' ? 'artist' : 'cantor'} name`} value={newName} onChange={setNewName} />
              <Pressable style={styles.secondary} disabled={busy} onPress={() => void createPerson(draft.mode === 'music' ? 'artist' : 'cantor')}>
                <Text style={styles.secondaryText}>Create {draft.mode === 'music' ? 'artist' : 'cantor'}</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Artwork & media</Text>
              <Text style={styles.muted}>Files upload privately as soon as you choose them. They are not submitted to CHC review until you press Submit to CHC.</Text>
              <View style={styles.actions}>
                <Pressable style={styles.secondary} onPress={() => void pick('image')}><Text style={styles.secondaryText}>{draft.artwork ? 'Replace artwork' : 'Choose artwork'}</Text></Pressable>
                <Pressable style={styles.secondary} onPress={() => void pick(draft.mode === 'learning_lesson_set' ? 'video' : 'audio')}><Text style={styles.secondaryText}>Add {draft.mode === 'learning_lesson_set' ? 'video/audio' : 'audio'} files</Text></Pressable>
              </View>

              {draft.artwork && (
                <View>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>Artwork: {draft.artwork.name}</Text>
                      <Text style={draft.artwork.error ? styles.uploadError : draft.artwork.uploaded ? styles.success : styles.muted}>{uploadLabel(draft.artwork)}</Text>
                      {!!draft.artwork.error && <Text style={styles.uploadErrorDetail}>{draft.artwork.error}</Text>}
                    </View>
                    {draft.artwork.error && <Pressable onPress={() => void startUpload(draft.artwork!)}><Text style={styles.link}>Retry</Text></Pressable>}
                    <Pressable onPress={() => setPreviewId(previewId === draft.artwork!.id ? null : draft.artwork!.id)}><Text style={styles.link}>{previewId === draft.artwork.id ? 'Hide' : 'Preview'}</Text></Pressable>
                  </View>
                  {previewId === draft.artwork.id ? <MediaPreview file={draft.artwork} onClose={() => setPreviewId(null)} /> : null}
                </View>
              )}

              {draft.media.map((m, i) => (
                <View key={m.id}>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{i + 1}. {m.name}</Text>
                      <Text style={m.error ? styles.uploadError : m.uploaded ? styles.success : styles.muted}>
                        {(m.size / 1024 / 1024).toFixed(1)} MB • {uploadLabel(m)}
                      </Text>
                      {!!m.error && <Text style={styles.uploadErrorDetail}>{m.error}</Text>}
                    </View>
                    <Pressable onPress={() => move(i, -1)}><Text style={styles.order}>↑</Text></Pressable>
                    <Pressable onPress={() => move(i, 1)}><Text style={styles.order}>↓</Text></Pressable>
                    {m.error && <Pressable onPress={() => void startUpload(m)}><Text style={styles.link}>Retry</Text></Pressable>}
                    <Pressable onPress={() => setPreviewId(previewId === m.id ? null : m.id)}><Text style={styles.link}>{previewId === m.id ? 'Hide' : 'Preview'}</Text></Pressable>
                    <Pressable onPress={() => setDraft((current) => ({ ...current, media: current.media.filter((x) => x.id !== m.id) }))}><Text style={styles.remove}>Remove</Text></Pressable>
                  </View>
                  {previewId === m.id ? <MediaPreview file={m} onClose={() => setPreviewId(null)} /> : null}
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Submission preview</Text>
              <Text style={styles.previewTitle}>{draft.title || 'Untitled submission'}</Text>
              <Text style={styles.muted}>{draft.mode.replaceAll('_', ' ')} • {draft.media.length} media item{draft.media.length === 1 ? '' : 's'}</Text>
              <Text style={styles.muted}>Uploads remain private until CHC review and publication.</Text>

              {submitProblems.length > 0 && (
                <View style={styles.requirements}>
                  <Text style={styles.requirementsTitle}>Before you can submit:</Text>
                  {submitProblems.map((problem) => <Text key={problem} style={styles.requirement}>• {problem}</Text>)}
                </View>
              )}
              {!!submissionError && <Text style={styles.uploadError}>{submissionError}</Text>}

              <Pressable
                style={[styles.primary, (busy || submitProblems.length > 0) && styles.disabled]}
                disabled={busy || submitProblems.length > 0}
                onPress={() => void submitDraft()}
              >
                <Text style={styles.primaryText}>{busy ? 'Submitting…' : 'Submit to CHC'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.black },
  sidebar: { width: 220, padding: SPACING.lg, gap: SPACING.md, backgroundColor: '#0b0c0e', borderRightWidth: 1, borderRightColor: COLORS.border },
  brand: { color: COLORS.gold, fontWeight: '900', letterSpacing: 2 },
  account: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 20 },
  nav: { paddingVertical: 10 },
  navText: { color: COLORS.white, fontWeight: '700' },
  main: { flex: 1 },
  content: { padding: SPACING.xl, gap: SPACING.lg, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  hero: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 38 },
  subhero: { color: COLORS.muted, fontSize: 16 },
  stats: { flexDirection: 'row', gap: SPACING.md, flexWrap: 'wrap' },
  stat: { minWidth: 150, padding: SPACING.lg, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  statNum: { color: COLORS.goldBright, fontSize: 30, fontWeight: '900' },
  card: { padding: SPACING.lg, gap: SPACING.md, borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { color: COLORS.white, fontSize: 18, fontWeight: '900' },
  field: { gap: 6 },
  label: { color: COLORS.muted, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  input: { color: COLORS.white, backgroundColor: COLORS.black, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.sm, padding: 12 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  chipText: { color: COLORS.white, fontWeight: '700' },
  chipTextActive: { color: COLORS.black },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  rowTitle: { color: COLORS.white, fontWeight: '800' },
  muted: { color: COLORS.muted, fontSize: 12 },
  warning: { color: '#ffc36b', marginTop: 5 },
  status: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#19202a' },
  statusText: { color: COLORS.goldBright, fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  secondary: { padding: 11, borderWidth: 1, borderColor: COLORS.gold, borderRadius: RADII.sm, alignItems: 'center' },
  secondaryText: { color: COLORS.goldBright, fontWeight: '800' },
  primary: { padding: 14, borderRadius: RADII.sm, backgroundColor: COLORS.gold, alignItems: 'center' },
  primaryText: { color: COLORS.black, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  order: { color: COLORS.goldBright, fontSize: 20 },
  remove: { color: '#ff8b8b', fontWeight: '700' },
  link: { color: COLORS.goldBright, fontWeight: '700' },
  previewTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24 },
  success: { color: '#8fe0a8', fontSize: 12, fontWeight: '800' },
  uploadError: { color: '#ff8b8b', fontSize: 12, fontWeight: '800' },
  uploadErrorDetail: { color: '#ffb0b0', fontSize: 11, marginTop: 4 },
  requirements: { gap: 4, padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.sm, backgroundColor: COLORS.black },
  requirementsTitle: { color: COLORS.white, fontWeight: '800', fontSize: 12 },
  requirement: { color: COLORS.muted, fontSize: 12 },
});
