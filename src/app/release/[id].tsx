import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, Chips, Field, Label, Loading, Page, PageHeader, StatusPill, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { creatorService } from '@/services/creatorService';
import type { CreatorRelease, CreditOptions, UploadCandidate } from '@/types/creator';
import { confirmAction } from '@/utils/dialogs';
import { fileSize, uploadLabel } from '@/utils/format';
import { pickUploadCandidates, runUpload, uploadsBlocking } from '@/utils/uploads';

/** A track as the editor holds it: either an existing one or a pending upload. */
interface EditableTrack {
  key: string;
  id?: string;
  title: string;
  mainArtistId: string;
  featuredArtistIds: string[];
  upload?: UploadCandidate;
  publicationStatus?: string;
}

export default function EditRelease() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const releaseId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { account, refresh } = useWorkspace();

  const [release, setRelease] = useState<CreatorRelease | null>(null);
  const [credits, setCredits] = useState<CreditOptions | null>(null);
  const [tracks, setTracks] = useState<EditableTrack[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [originalDate, setOriginalDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deletingTrackKey, setDeletingTrackKey] = useState<string | null>(null);
  const [deletingRelease, setDeletingRelease] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const apply = useCallback((next: CreatorRelease) => {
    setRelease(next);
    setTitle(next.title);
    setDescription(next.description ?? '');
    setScheduledAt(next.scheduledReleaseAt ? next.scheduledReleaseAt.slice(0, 10) : '');
    setOriginalDate(next.originalReleaseDate ?? '');
    setTracks(next.tracks.map((track) => ({
      key: track.id,
      id: track.id,
      title: track.title,
      mainArtistId: track.mainArtist?.id ?? '',
      featuredArtistIds: track.featuredArtists.map((artist) => artist.id),
      publicationStatus: track.publicationStatus,
    })));
  }, []);

  const load = useCallback(async () => {
    if (!releaseId || !account) return;
    setLoading(true);
    setError('');
    try {
      const [loaded, options] = await Promise.all([
        creatorService.release(releaseId),
        creatorService.creditOptions(account.id),
      ]);
      apply(loaded);
      setCredits(options);
    } catch (cause) {
      setError(creatorService.describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [releaseId, account, apply]);

  useEffect(() => { void load(); }, [load]);

  async function addTracks() {
    if (!account) return;
    const picked = await pickUploadCandidates('audio', true);
    if (!picked.length) return;

    setTracks((current) => [
      ...current,
      ...picked.map((file) => ({
        key: file.id,
        title: file.name.replace(/\.[a-z0-9]+$/i, ''),
        mainArtistId: '',
        featuredArtistIds: [],
        upload: file,
      })),
    ]);

    for (const file of picked) {
      void runUpload(account.id, file, (id, change) => {
        setTracks((current) => current.map((track) =>
          track.upload?.id === id ? { ...track, upload: { ...track.upload, ...change } as UploadCandidate } : track,
        ));
      });
    }
  }

  function patchTrack(key: string, change: Partial<EditableTrack>) {
    setTracks((current) => current.map((track) => (track.key === key ? { ...track, ...change } : track)));
  }

  function moveTrack(index: number, delta: -1 | 1) {
    setTracks((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function removeTrack(track: EditableTrack) {
    if (!track.id) {
      setTracks((current) => current.filter((item) => item.key !== track.key));
      return;
    }
    if (!releaseId) return;
    if (tracks.filter((item) => item.id).length <= 1) {
      setError('You cannot delete the last saved track. Delete the whole release instead, or save another track first.');
      return;
    }
    if (!(await confirmAction(
      'Delete this track permanently?',
      `"${track.title}" will be removed from this release and deleted from CHC. This cannot be undone.`,
      'Delete track',
    ))) return;

    setDeletingTrackKey(track.key);
    setError('');
    setNotice('');
    try {
      const result = await creatorService.deleteReleaseTrack(releaseId, track.id);
      setTracks((current) => current.filter((item) => item.key !== track.key));
      setRelease((current) => current ? {
        ...current,
        releaseType: result.releaseType,
        tracks: current.tracks.filter((item) => item.id !== track.id),
      } : current);
      void refresh();
      setNotice('Track deleted.');
    } catch (cause) {
      setError(creatorService.describeError(cause));
    } finally {
      setDeletingTrackKey(null);
    }
  }

  async function deleteRelease() {
    if (!releaseId || !release) return;
    if (!(await confirmAction(
      'Delete this release permanently?',
      `"${release.title}" and its tracks will be removed from the CHC music catalog. This cannot be undone.`,
      'Delete release',
    ))) return;

    setDeletingRelease(true);
    setError('');
    setNotice('');
    try {
      await creatorService.deleteRelease(releaseId);
      await refresh();
      router.replace('/profile');
    } catch (cause) {
      setError(creatorService.describeError(cause));
      setDeletingRelease(false);
    }
  }

  const pendingUploads = tracks.map((track) => track.upload).filter(Boolean) as UploadCandidate[];
  const blocking = pendingUploads.length ? uploadsBlocking(pendingUploads) : null;

  async function save() {
    if (!releaseId) return;
    if (blocking) { setError(blocking); return; }
    if (!tracks.length) { setError('A release needs at least one track.'); return; }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await creatorService.updateRelease(releaseId, {
        title: title.trim() || null,
        description,
        scheduledReleaseAt: scheduledAt || null,
        originalReleaseDate: originalDate || null,
        clearOriginalReleaseDate: !originalDate,
        tracks: tracks.map((track) => ({
          id: track.id,
          uploadIntentId: track.upload?.uploadIntentId,
          title: track.title,
          mainArtistId: track.mainArtistId || null,
          featuredArtistIds: track.featuredArtistIds,
        })),
      });
      apply(next);
      void refresh();
      setNotice('Saved. Your changes are back with CHC for review.');
    } catch (cause) {
      setError(creatorService.describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading release…" />;

  if (!release) {
    return (
      <Page>
        <Pressable onPress={() => router.back()} hitSlop={8}><Text style={uiStyles.link}>‹ Back</Text></Pressable>
        <Card title="Could not load this release" description={error || 'Release not found.'} />
      </Page>
    );
  }

  const artists = credits?.creditableArtists ?? [];
  const identityId = credits?.identityArtist?.id ?? '';

  return (
    <Page>
      <Pressable onPress={() => router.back()} hitSlop={8}><Text style={uiStyles.link}>‹ Back</Text></Pressable>

      <PageHeader
        title={release.title}
        subtitle={`${release.releaseType.toUpperCase()} • released as ${release.primaryArtist?.displayName ?? '—'}`}
        action={<Button
          kind="primary"
          label={busy ? 'Saving…' : 'Save changes'}
          busy={busy}
          disabled={Boolean(deletingTrackKey) || deletingRelease}
          onPress={() => void save()}
        />}
      />

      <View style={styles.statusRow}>
        <StatusPill status={release.publicationStatus} />
        {!!release.displayDate && <Text style={uiStyles.muted}>Listeners see {release.displayDate}</Text>}
      </View>

      {!!notice && <Banner tone="success">{notice}</Banner>}
      {!!error && <Banner tone="error">{error}</Banner>}

      <Banner tone="info">
        Editing a release sends it back to CHC for review. Anything already published stays live until
        the new version is approved.
      </Banner>

      <Card title="Details">
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Description" value={description} onChangeText={setDescription} multiline />
        <Field
          label="Goes live on CHC"
          value={scheduledAt}
          onChangeText={setScheduledAt}
          placeholder="YYYY-MM-DD"
          hint="Changing this needs at least 48 hours' notice. If you require a release date that is closer than 48 hours, please email x@x.x."
        />
        <Field
          label="Originally released (optional)"
          value={originalDate}
          onChangeText={setOriginalDate}
          placeholder="YYYY-MM-DD"
          hint="The date listeners see if this came out elsewhere first. Clear it to fall back to the CHC date."
        />
      </Card>

      <Card
        title={`Tracks (${tracks.length})`}
        description="Reorder, rename, re-credit, or add more. Adding a track to an album is how a collection grows."
      >
        {tracks.map((track, index) => (
          <View key={track.key} style={styles.track}>
            <View style={uiStyles.row}>
              <View style={styles.trackBody}>
                <Field
                  label={`Track ${index + 1}`}
                  value={track.title}
                  onChangeText={(value) => patchTrack(track.key, { title: value })}
                />
                {track.upload && (
                  <Text style={track.upload.error ? uiStyles.error : uiStyles.muted}>
                    {fileSize(track.upload.size)} • {uploadLabel(track.upload)}
                  </Text>
                )}
                {!track.upload && !!track.publicationStatus && (
                  <Text style={uiStyles.muted}>Already on this release</Text>
                )}
              </View>
              <View style={styles.trackActions}>
                <Pressable accessibilityLabel="Move up" disabled={index === 0} onPress={() => moveTrack(index, -1)} hitSlop={6}>
                  <Text style={[styles.order, index === 0 && styles.dim]}>↑</Text>
                </Pressable>
                <Pressable accessibilityLabel="Move down" disabled={index === tracks.length - 1} onPress={() => moveTrack(index, 1)} hitSlop={6}>
                  <Text style={[styles.order, index === tracks.length - 1 && styles.dim]}>↓</Text>
                </Pressable>
                <Pressable
                  disabled={busy || deletingRelease || deletingTrackKey === track.key}
                  onPress={() => void removeTrack(track)}
                  hitSlop={6}
                >
                  <Text style={uiStyles.remove}>
                    {deletingTrackKey === track.key ? 'Deleting…' : track.id ? 'Delete track' : 'Remove'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.creditsBody}>
              <View style={styles.group}>
                <Label>Main artist</Label>
                <Chips
                  items={artists.map((artist) => ({
                    id: artist.id,
                    title: artist.id === identityId ? `${artist.displayName} (you)` : artist.displayName,
                  }))}
                  value={track.mainArtistId || identityId}
                  onChange={(id) => patchTrack(track.key, { mainArtistId: id })}
                />
              </View>
              <View style={styles.group}>
                <Label>Featured</Label>
                <View style={styles.featureRow}>
                  {artists
                    .filter((artist) => artist.id !== (track.mainArtistId || identityId))
                    .map((artist) => {
                      const on = track.featuredArtistIds.includes(artist.id);
                      return (
                        <Pressable
                          key={artist.id}
                          onPress={() => patchTrack(track.key, {
                            featuredArtistIds: on
                              ? track.featuredArtistIds.filter((x) => x !== artist.id)
                              : [...track.featuredArtistIds, artist.id],
                          })}
                          accessibilityState={{ selected: on }}
                          style={[styles.featureChip, on && styles.featureChipOn]}
                        >
                          <Text style={[styles.featureText, on && styles.featureTextOn]}>{artist.displayName}</Text>
                        </Pressable>
                      );
                    })}
                </View>
              </View>
            </View>
          </View>
        ))}

        <View style={uiStyles.actions}>
          <Button label="Add tracks" onPress={() => void addTracks()} />
        </View>
      </Card>

      <Card
        title="Danger zone"
        description="Deleting a release permanently removes it from the CHC music catalog. Submission history is retained for audit purposes."
      >
        <View style={uiStyles.actions}>
          <Button
            kind="danger"
            label={deletingRelease ? 'Deleting release…' : 'Delete release'}
            busy={deletingRelease}
            disabled={busy || Boolean(deletingTrackKey)}
            onPress={() => void deleteRelease()}
          />
        </View>
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
  group: { gap: 8 },
  track: { gap: SPACING.sm, paddingBottom: SPACING.md },
  trackBody: { flex: 1, minWidth: 200, gap: 4 },
  trackActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  creditsBody: { gap: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.black },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featureChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.border },
  featureChipOn: { borderColor: COLORS.gold, backgroundColor: COLORS.surfaceSoft },
  featureText: { color: COLORS.muted, fontWeight: '700', fontSize: 13 },
  featureTextOn: { color: COLORS.goldBright },
  order: { color: COLORS.goldBright, fontSize: 20 },
  dim: { opacity: 0.25 },
});
