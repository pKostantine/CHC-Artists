import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { MediaPreview } from '@/components/MediaPreview';
import { creatorService } from '@/services/creatorService';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { CreatorSubmission, SubmissionItem, UploadCandidate } from '@/types/creator';

/**
 * What a creator does after a reviewer asks for changes.
 *
 * submit_media_submission accepts `changes_requested` as a starting status, so
 * a submission can go back for review once new media is attached. The
 * submission's own title and description are deliberately not editable here:
 * media.submissions carries a select policy and no update policy, so every
 * change to it has to go through an RPC, and none exists for renaming one.
 */
export function ReviseSubmission({
  accountId,
  submission,
  onClose,
}: {
  accountId: string;
  submission: CreatorSubmission;
  onClose: (changed: boolean) => void;
}) {
  const [items, setItems] = useState<SubmissionItem[]>([]);
  const [added, setAdded] = useState<UploadCandidate[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void creatorService
      .items(submission.id)
      .then(setItems)
      .catch((error) => Alert.alert('Unable to load this submission', creatorService.describeError(error)));
  }, [submission.id]);

  const preview = added.find((file) => file.id === previewId) ?? null;

  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*', 'video/*'], copyToCacheDirectory: true, multiple: true });
    if (result.canceled) return;
    setAdded((current) => [
      ...current,
      ...result.assets.map((asset) => ({
        id: `${Date.now()}-${asset.name}`,
        name: asset.name,
        uri: asset.uri,
        mimeType: asset.mimeType || 'application/octet-stream',
        size: asset.size || 0,
        mediaType: (asset.mimeType || '').startsWith('video') ? ('video' as const) : ('audio' as const),
        progress: 0,
      })),
    ]);
  }

  async function resubmit() {
    setBusy(true);
    try {
      // New files continue the existing ordering rather than renumbering from zero.
      let order = items.length;
      for (const file of added) {
        const intent = await creatorService.upload(accountId, file, (progress) =>
          setAdded((current) => current.map((entry) => (entry.id === file.id ? { ...entry, progress } : entry))),
        );
        await creatorService.attachUpload(submission.id, intent, file.name, order);
        order += 1;
      }
      await creatorService.submit(submission.id);
      Alert.alert('Sent back for review', 'CHC has your updated submission.');
      onClose(true);
    } catch (error) {
      Alert.alert('Could not resubmit', creatorService.describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      <Pressable onPress={() => onClose(false)}><Text style={styles.back}>← Back to dashboard</Text></Pressable>
      <Text style={styles.hero}>{submission.title}</Text>
      <Text style={styles.muted}>{submission.submission_type.replaceAll('_', ' ')}</Text>

      {submission.review_notes ? (
        <View style={styles.notes}>
          <Text style={styles.notesTitle}>Changes requested</Text>
          <Text style={styles.notesBody}>{submission.review_notes}</Text>
        </View>
      ) : (
        <Text style={styles.muted}>The reviewer left no note with this request.</Text>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Already submitted</Text>
        {items.length ? (
          items.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.rowTitle}>{item.sort_order + 1}. {item.title || 'Untitled item'}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>No media is attached to this submission yet.</Text>
        )}
        <Text style={styles.muted}>
          The title and description cannot be edited once a submission has been sent. Add corrected media below and
          mention anything else in reply to the reviewer.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add corrected media</Text>
        <Pressable style={styles.secondary} onPress={() => void pick()}>
          <Text style={styles.secondaryText}>Choose audio or video</Text>
        </Pressable>
        {added.map((file) => (
          <View key={file.id}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{file.name}</Text>
                <Text style={styles.muted}>{(file.size / 1024 / 1024).toFixed(1)} MB • {Math.round(file.progress * 100)}%</Text>
              </View>
              <Pressable onPress={() => setPreviewId(previewId === file.id ? null : file.id)}>
                <Text style={styles.link}>{previewId === file.id ? 'Hide' : 'Preview'}</Text>
              </Pressable>
              <Pressable onPress={() => setAdded((current) => current.filter((entry) => entry.id !== file.id))}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
            {preview && preview.id === file.id ? <MediaPreview file={preview} onClose={() => setPreviewId(null)} /> : null}
          </View>
        ))}
      </View>

      <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => void resubmit()}>
        <Text style={styles.primaryText}>{busy ? 'Uploading & resubmitting…' : 'Resubmit for review'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1 },
  content: { padding: SPACING.xl, gap: SPACING.lg, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  back: { color: COLORS.goldBright, fontWeight: '700' },
  hero: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 34 },
  notes: { padding: SPACING.lg, gap: 6, borderRadius: RADII.md, borderWidth: 1, borderColor: '#7a5a1d', backgroundColor: '#241c09' },
  notesTitle: { color: '#ffc36b', fontWeight: '900' },
  notesBody: { color: COLORS.white, lineHeight: 21 },
  card: { padding: SPACING.lg, gap: SPACING.md, borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { color: COLORS.white, fontSize: 18, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  rowTitle: { color: COLORS.white, fontWeight: '800' },
  muted: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  link: { color: COLORS.goldBright, fontWeight: '700' },
  remove: { color: '#ff8b8b', fontWeight: '700' },
  secondary: { padding: 11, borderWidth: 1, borderColor: COLORS.gold, borderRadius: RADII.sm, alignItems: 'center' },
  secondaryText: { color: COLORS.goldBright, fontWeight: '800' },
  primary: { padding: 14, borderRadius: RADII.sm, backgroundColor: COLORS.gold, alignItems: 'center' },
  primaryText: { color: COLORS.black, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
