import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MediaPreview } from '@/components/MediaPreview';
import { Banner, Button, Card, Loading, Page, PageHeader, StatusPill, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { creatorService } from '@/services/creatorService';
import type { SubmissionItem, UploadCandidate } from '@/types/creator';
import { fileSize, shortDate, statusDescription, statusLabel, submissionTypeLabel, uploadLabel } from '@/utils/format';
import { pickUploadCandidates, runUpload, uploadsBlocking } from '@/utils/uploads';

function itemState(item: SubmissionItem): string {
  if (item.mediaAssetId) return 'Processed';

  // A queued job that has already been attempted is a retry, not a fresh wait,
  // and saying so is the difference between "slow" and "going wrong".
  if (item.processingStatus === 'queued' && (item.processingAttemptCount ?? 0) > 0) {
    return `Retrying (attempt ${(item.processingAttemptCount ?? 0) + 1} of ${item.processingMaxAttempts ?? '?'})`;
  }

  if (item.processingStatus) return `Processing: ${statusLabel(item.processingStatus)}`;
  if (item.uploadStatus) return statusLabel(item.uploadStatus);
  return '—';
}

function itemRoleLabel(item: SubmissionItem): string {
  if (item.role === 'artwork') return 'Artwork';
  if (item.role === 'lesson') return 'Lesson media';
  if (item.role === 'track') return 'Track';
  return item.mediaType ? statusLabel(item.mediaType) : 'File';
}

export default function SubmissionDetail() {
  const { id, submitted } = useLocalSearchParams<{ id: string; submitted?: string }>();
  const { account, dashboard, loading, refresh } = useWorkspace();
  const submission = dashboard.submissions.find((s) => s.id === id) ?? null;

  const [items, setItems] = useState<SubmissionItem[] | null>(null);
  const [itemsError, setItemsError] = useState('');
  const [added, setAdded] = useState<UploadCandidate[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(submitted ? 'Submitted. Your submission is now in CHC review.' : '');

  const loadItems = useCallback(async () => {
    if (!id) return;
    try {
      setItems(await creatorService.items(id));
      setItemsError('');
    } catch (e) {
      setItemsError(creatorService.describeError(e));
    }
  }, [id]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const patchAdded = useCallback((fileId: string, change: Partial<UploadCandidate>) => {
    setAdded((current) => current.map((file) => (file.id === fileId ? { ...file, ...change } : file)));
  }, []);

  if (!submission) {
    if (loading) return <Page><Loading label="Loading submission…" /></Page>;
    return (
      <Page>
        <PageHeader title="Submission not found" subtitle="It may belong to a different creator workspace." />
        <Card><Button kind="primary" label="Back to submissions" onPress={() => router.replace('/')} /></Card>
      </Page>
    );
  }

  const revising = submission.status === 'changes_requested';
  const blocking = added.length ? uploadsBlocking(added) : 'Add at least one corrected file.';
  const uploadMode = submission.submissionType === 'music_release'
    ? 'music'
    : submission.submissionType === 'learning_album'
      ? 'learning_album'
      : 'learning_lesson_set';

  async function pick() {
    if (!account || !submission) return;
    setError('');
    const picked = await pickUploadCandidates(submission.submissionType === 'learning_lesson_set' ? 'lesson' : 'audio', true);
    if (!picked.length) return;
    setAdded((current) => [...current, ...picked]);
    picked.forEach((file) => void runUpload(account.id, file, uploadMode, patchAdded));
  }

  async function resubmit() {
    if (!submission || blocking) return;
    setBusy(true);
    setError('');
    try {
      // New files continue the existing ordering rather than renumbering from zero.
      let order = items?.length ?? 0;
      for (const file of added) {
        await creatorService.attachUpload(
          submission.id,
          file.uploadIntentId!,
          file.name,
          order,
          submission.submissionType === 'music_release' ? 'track' : 'lesson',
        );
        // Once attached, a retry must not attach it again.
        setAdded((current) => current.filter((x) => x.id !== file.id));
        order += 1;
      }
      await creatorService.submit(submission.id);
      setNotice('Sent back for review. CHC has your updated submission.');
      await Promise.all([refresh(), loadItems()]);
    } catch (e) {
      setError(creatorService.describeError(e));
      void loadItems();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title={submission.title}
        subtitle={`${submissionTypeLabel(submission.submissionType)} • Created ${shortDate(submission.createdAt)}`}
        action={<Button kind="ghost" label="← All submissions" onPress={() => router.navigate('/')} />}
      />

      {!!notice && <Banner tone="success">{notice}</Banner>}

      {submission.submissionType === 'music_release' && (
        <Card
          title="Lyrics"
          description="Lyrics are added after the music submission is created, not in the release description."
        >
          <Text style={uiStyles.muted}>
            Open Lyrics Studio to add Coptic, Arabic, English, or French lyrics to each submitted track. You can start before publication; synchronized timing becomes available once the processed audio is attached.
          </Text>
          <Button kind="secondary" label="Open Lyrics Studio" onPress={() => router.push('/lyrics')} />
        </Card>
      )}

      <Card>
        <View style={styles.statusRow}>
          <StatusPill status={submission.status} />
          <Text style={uiStyles.muted}>{statusDescription(submission.status)}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={uiStyles.muted}>Submitted: {shortDate(submission.submittedAt)}</Text>
          {submission.status === 'pending_review' && <Text style={uiStyles.muted}>Review due: {shortDate(submission.reviewDueAt)}</Text>}
          {!!submission.publishedAt && <Text style={uiStyles.muted}>Published: {shortDate(submission.publishedAt)}</Text>}
        </View>
        {!!submission.description && <Text style={styles.body}>{submission.description}</Text>}
      </Card>

      {revising && (
        <View style={styles.notes}>
          <Text style={styles.notesTitle}>Changes requested</Text>
          <Text style={styles.notesBody}>{submission.reviewNotes || 'The reviewer did not leave a note with this request.'}</Text>
        </View>
      )}

      <Card title="Files">
        {itemsError ? (
          <Banner tone="error">{itemsError}</Banner>
        ) : items === null ? (
          <Loading label="Loading files…" />
        ) : items.length ? (
          items.map((item) => (
            <View key={item.id} style={uiStyles.row}>
              <View style={styles.fileText}>
                <Text style={uiStyles.rowTitle}>{item.sortOrder + 1}. {item.title || 'Untitled file'}</Text>
                <Text style={uiStyles.muted}>
                  {itemRoleLabel(item)} • {fileSize(item.contentLength ?? 0)} • {itemState(item)}
                </Text>
                {item.processingStatus === 'failed' && item.processingError ? (
                  <Text style={styles.itemError}>{item.processingError}</Text>
                ) : null}
              </View>
            </View>
          ))
        ) : (
          <Text style={uiStyles.muted}>No files are attached.</Text>
        )}
      </Card>

      {revising && (
        <Card
          title="Add corrected files"
          description="Title and description cannot be changed after sending. Upload corrected media here, then send the submission back for review."
        >
          <View style={uiStyles.actions}>
            <Button label={submission.submissionType === 'learning_lesson_set' ? 'Add lesson files' : 'Add audio files'} onPress={() => void pick()} />
          </View>

          {added.map((file) => (
            <View key={file.id}>
              <View style={uiStyles.row}>
                <View style={styles.fileText}>
                  <Text style={uiStyles.rowTitle} numberOfLines={1}>{file.name}</Text>
                  <Text style={file.error ? uiStyles.error : file.uploaded ? uiStyles.success : uiStyles.muted}>
                    {fileSize(file.size)} • {uploadLabel(file)}
                  </Text>
                  {!!file.error && <Text style={uiStyles.errorDetail}>{file.error}</Text>}
                </View>
                <View style={styles.fileActions}>
                  {!!file.error && account && (
                    <Pressable onPress={() => void runUpload(account.id, file, uploadMode, patchAdded)}><Text style={uiStyles.link}>Retry</Text></Pressable>
                  )}
                  <Pressable onPress={() => setPreviewId(previewId === file.id ? null : file.id)}>
                    <Text style={uiStyles.link}>{previewId === file.id ? 'Hide' : 'Preview'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setAdded((current) => current.filter((x) => x.id !== file.id))}>
                    <Text style={uiStyles.remove}>Remove</Text>
                  </Pressable>
                </View>
              </View>
              {previewId === file.id && <MediaPreview file={file} onClose={() => setPreviewId(null)} />}
            </View>
          ))}

          {!!blocking && added.length > 0 && <Text style={uiStyles.muted}>{blocking}</Text>}
          {!!error && <Banner tone="error">{error}</Banner>}
          <Button kind="primary" label={busy ? 'Resubmitting…' : 'Resubmit for review'} busy={busy} disabled={Boolean(blocking)} onPress={() => void resubmit()} />
        </Card>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.lg },
  body: { color: COLORS.white, lineHeight: 21 },
  notes: { padding: SPACING.lg, gap: 6, borderRadius: RADII.md, borderWidth: 1, borderColor: '#7a5a1d', backgroundColor: '#241c09' },
  notesTitle: { color: '#ffc36b', fontWeight: '900' },
  notesBody: { color: COLORS.white, lineHeight: 21 },
  fileText: { flex: 1, minWidth: 200, gap: 3 },
  itemError: { color: COLORS.danger, fontSize: 12, lineHeight: 17 },
  fileActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
