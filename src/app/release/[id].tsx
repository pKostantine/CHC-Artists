import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ReleaseDateTimeField } from '@/components/ReleaseDateTimeField';
import { TrackMetadataEditor } from '@/components/TrackMetadataEditor';
import { Banner, Button, Card, Dropdown, Field, Loading, Page, PageHeader, StatusPill, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { creatorService } from '@/services/creatorService';
import { resolveImageUrl } from '@/services/mediaService';
import type { CreatorRelease, CreditOptions, LocalizedMetadata, TrackContributor, UploadCandidate } from '@/types/creator';
import { confirmAction } from '@/utils/dialogs';
import { fileSize, uploadLabel } from '@/utils/format';
import { hasMusicTitle, MUSIC_TITLE_LOCALES, preferredLocalizedTitle } from '@/utils/titles';
import { pickUploadCandidates, runUpload, uploadsBlocking } from '@/utils/uploads';

interface EditableTrack {
  key: string;
  id?: string;
  title: string;
  localizedTitle: LocalizedMetadata;
  mainArtistName: string;
  contributors: TrackContributor[];
  upload?: UploadCandidate;
  publicationStatus?: string;
}

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

function musicTypeOption(value?: string | null): string {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'hymn' || normalized === 'hymns') return 'hymn';
  if (normalized === 'spiritual song' || normalized === 'spiritual songs') return 'spiritual_song';
  return normalized ? 'other' : '';
}

function recordingTypeOption(value?: string | null): string {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'studio') return 'studio';
  if (normalized === 'live') return 'live';
  if (normalized === 'instrumental') return 'instrumental';
  return normalized ? 'other' : '';
}

function localDateTimeValue(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ');
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16).replace('T', ' ');
}

function localizedTitlesFor(release: CreatorRelease): LocalizedMetadata {
  const localized: LocalizedMetadata = { en: '', ar: '', cop: '', fr: '' };
  for (const entry of release.localizations) {
    if (entry.locale in localized) localized[entry.locale as keyof LocalizedMetadata] = entry.title;
  }
  if (!localized.en && !localized.ar && !localized.fr) localized.en = release.title;
  return localized;
}

export default function EditRelease() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const releaseId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { account, refresh } = useWorkspace();

  const [release, setRelease] = useState<CreatorRelease | null>(null);
  const [credits, setCredits] = useState<CreditOptions | null>(null);
  const [tracks, setTracks] = useState<EditableTrack[]>([]);
  const [localizedTitle, setLocalizedTitle] = useState<LocalizedMetadata>({ en: '', ar: '', cop: '', fr: '' });
  const [description, setDescription] = useState('');
  const [musicType, setMusicType] = useState('');
  const [musicTypeChoice, setMusicTypeChoice] = useState('');
  const [recordingType, setRecordingType] = useState('');
  const [recordingTypeChoice, setRecordingTypeChoice] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [initialScheduledAt, setInitialScheduledAt] = useState('');
  const [originalDate, setOriginalDate] = useState('');
  const [coverUpload, setCoverUpload] = useState<UploadCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deletingTrackKey, setDeletingTrackKey] = useState<string | null>(null);
  const [deletingRelease, setDeletingRelease] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const apply = useCallback((next: CreatorRelease) => {
    const nextScheduled = localDateTimeValue(next.scheduledReleaseAt);
    setRelease(next);
    setLocalizedTitle(localizedTitlesFor(next));
    setDescription(next.description ?? '');
    setMusicType(next.musicType ?? '');
    setMusicTypeChoice(musicTypeOption(next.musicType));
    setRecordingType(next.recordingType ?? '');
    setRecordingTypeChoice(recordingTypeOption(next.recordingType));
    setScheduledAt(nextScheduled);
    setInitialScheduledAt(nextScheduled);
    setOriginalDate(next.originalReleaseDate ?? '');
    setCoverUpload(null);
    setTracks(next.tracks.map((track) => ({
      key: track.id,
      id: track.id,
      title: track.title,
      localizedTitle: track.localizedTitle ?? { en: track.title, ar: '', cop: '', fr: '' },
      mainArtistName: track.mainArtistName ?? '',
      contributors: track.contributors ?? [],
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
        title: preferredLocalizedTitle(file.localizedTitle) || file.name.replace(/\.[a-z0-9]+$/i, ''),
        localizedTitle: file.localizedTitle ?? { en: '', ar: '', cop: '', fr: '' },
        mainArtistName: file.mainArtistName ?? '',
        contributors: file.contributors ?? [],
        upload: file,
      })),
    ]);

    for (const file of picked) {
      void runUpload(account.id, file, 'music', (id, change) => {
        setTracks((current) => current.map((track) =>
          track.upload?.id === id ? { ...track, upload: { ...track.upload, ...change } as UploadCandidate } : track,
        ));
      });
    }
  }

  async function changeArtwork() {
    if (!account) return;
    const picked = await pickUploadCandidates('image', false);
    if (!picked.length) return;
    const file = picked[0];
    setCoverUpload(file);
    void runUpload(account.id, file, 'music', (id, change) => {
      setCoverUpload((current) => current?.id === id ? { ...current, ...change } : current);
    });
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

  function copyCreditsToAll(sourceKey: string) {
    setTracks((current) => {
      const source = current.find((track) => track.key === sourceKey);
      if (!source) return current;
      const stamp = Date.now();
      return current.map((track) => (
        track.key === sourceKey
          ? track
          : {
              ...track,
              mainArtistName: source.mainArtistName,
              contributors: source.contributors.map((credit, index) => ({
                ...credit,
                id: `${stamp}-${index}-${track.key}`,
              })),
            }
      ));
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
      router.replace('/releases');
    } catch (cause) {
      setError(creatorService.describeError(cause));
      setDeletingRelease(false);
    }
  }

  const uploadFiles = useMemo(() => {
    const trackUploads = tracks.map((track) => track.upload).filter(Boolean) as UploadCandidate[];
    return coverUpload ? [...trackUploads, coverUpload] : trackUploads;
  }, [tracks, coverUpload]);
  const blocking = uploadFiles.length ? uploadsBlocking(uploadFiles) : null;

  async function save() {
    if (!releaseId) return;
    if (blocking) { setError(blocking); return; }
    if (!tracks.length) { setError('A release needs at least one track.'); return; }
    if (!hasMusicTitle(localizedTitle)) { setError('Add a release title in English, Arabic, or French.'); return; }
    if (!musicTypeChoice || !musicType.trim()) { setError('Choose a music type.'); return; }
    if (!recordingTypeChoice || !recordingType.trim()) { setError('Choose a recording type.'); return; }
    const invalidTrackIndex = tracks.findIndex((track) => !hasMusicTitle(track.localizedTitle));
    if (invalidTrackIndex >= 0) {
      setError(`Add a title in at least one language for track ${invalidTrackIndex + 1}.`);
      return;
    }
    const unnamedContributorIndex = tracks.findIndex((track) =>
      track.contributors.some((credit) => !credit.name.trim()),
    );
    if (unnamedContributorIndex >= 0) {
      setError(`Fill in or remove the unnamed contributor on track ${unnamedContributorIndex + 1}.`);
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const canonicalTitle = preferredLocalizedTitle(localizedTitle);
      const next = await creatorService.updateRelease(releaseId, {
        title: canonicalTitle,
        description,
        // Do not re-validate an unchanged scheduled date merely because the
        // artist edited another field. A changed date still obeys the 48-hour rule.
        scheduledReleaseAt: scheduledAt !== initialScheduledAt ? scheduledAt || null : null,
        originalReleaseDate: originalDate || null,
        clearOriginalReleaseDate: !originalDate,
        localizedTitles: {
          en: localizedTitle.en,
          ar: localizedTitle.ar,
          fr: localizedTitle.fr,
        },
        musicType,
        recordingType,
        coverUploadIntentId: coverUpload?.uploadIntentId ?? null,
        tracks: tracks.map((track) => ({
          id: track.id,
          uploadIntentId: track.upload?.uploadIntentId,
          title: preferredLocalizedTitle(track.localizedTitle) || track.title,
          localizedTitle: track.localizedTitle,
          mainArtistName: track.mainArtistName,
          contributors: track.contributors,
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
        <Pressable onPress={() => router.replace('/releases')} hitSlop={8}><Text style={uiStyles.link}>‹ Releases</Text></Pressable>
        <Card title="Could not load this release" description={error || 'Release not found.'} />
      </Page>
    );
  }

  const identityName = credits?.identityArtist?.displayName ?? account?.displayName ?? release.primaryArtist?.displayName ?? '';
  const currentCover = release.cover
    ? resolveImageUrl(release.cover.bucket, release.cover.path, release.cover.version ?? release.cover.assetId)
    : null;
  const shownCover = coverUpload?.uri || currentCover;
  const minimumReleaseDate = release.earliestReleaseAt ? new Date(release.earliestReleaseAt) : undefined;

  return (
    <Page>
      <Pressable onPress={() => router.replace('/releases')} hitSlop={8}><Text style={uiStyles.link}>‹ Releases</Text></Pressable>

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
        Editing a release sends the new version back to CHC for review. Anything already published stays live until the edit is approved.
      </Banner>

      <Card
        title="Release title"
        description="Edit the listener-facing title in any of the supported languages. At least one is required."
      >
        <View style={styles.localeGrid}>
          {MUSIC_TITLE_LOCALES.map(({ key, label }) => (
            <View key={key} style={styles.localeField}>
              <Field
                label={label}
                value={localizedTitle[key]}
                onChangeText={(value) => setLocalizedTitle((current) => ({ ...current, [key]: value }))}
                style={key === 'ar' ? styles.rtl : undefined}
              />
            </View>
          ))}
        </View>
      </Card>

      <Card title="Artwork" description="Replace the cover art for this release. The new image is processed when you save.">
        <View style={styles.artworkRow}>
          <View style={styles.coverPreview}>
            {shownCover ? (
              <Image source={{ uri: shownCover }} style={styles.coverImage} resizeMode="cover" />
            ) : (
              <Text style={styles.coverFallback}>No artwork</Text>
            )}
          </View>
          <View style={styles.artworkActions}>
            <Button
              label={coverUpload ? 'Choose another image' : 'Replace artwork'}
              onPress={() => void changeArtwork()}
              disabled={busy}
            />
            {!!coverUpload && (
              <>
                <Text style={coverUpload.error ? uiStyles.error : uiStyles.muted}>
                  {fileSize(coverUpload.size)} • {uploadLabel(coverUpload)}
                </Text>
                <Button kind="ghost" label="Keep current artwork" onPress={() => setCoverUpload(null)} />
              </>
            )}
          </View>
        </View>
      </Card>

      <Card title="Release details">
        <Field label="Description" value={description} onChangeText={setDescription} multiline />

        <Dropdown
          label="Music type"
          items={MUSIC_TYPE_OPTIONS}
          value={musicTypeChoice}
          onChange={(choice) => {
            setMusicTypeChoice(choice);
            if (choice === 'hymn') setMusicType('Hymns');
            else if (choice === 'spiritual_song') setMusicType('Spiritual Songs');
            else if (choice !== 'other') setMusicType('');
            else if (musicTypeOption(musicType) !== 'other') setMusicType('');
          }}
          placeholder="Choose a music type"
        />
        {musicTypeChoice === 'other' && (
          <Field label="Other music type" value={musicType} onChangeText={setMusicType} placeholder="Enter the music type" />
        )}

        <Dropdown
          label="Recording type"
          items={RECORDING_TYPE_OPTIONS}
          value={recordingTypeChoice}
          onChange={(choice) => {
            setRecordingTypeChoice(choice);
            if (choice === 'studio') setRecordingType('Studio');
            else if (choice === 'live') setRecordingType('Live');
            else if (choice === 'instrumental') setRecordingType('Instrumental');
            else if (choice !== 'other') setRecordingType('');
            else if (recordingTypeOption(recordingType) !== 'other') setRecordingType('');
          }}
          placeholder="Choose a recording type"
        />
        {recordingTypeChoice === 'other' && (
          <Field label="Other recording type" value={recordingType} onChangeText={setRecordingType} placeholder="Enter the recording type" />
        )}

        <ReleaseDateTimeField
          label="Goes live on CHC"
          value={scheduledAt}
          onChange={setScheduledAt}
          minimumDate={minimumReleaseDate}
          hint="Changing this needs at least 48 hours' notice. If you require a release date that is closer than 48 hours, please email x@x.x."
        />
        <ReleaseDateTimeField
          label="Originally released (optional)"
          value={originalDate}
          onChange={setOriginalDate}
          mode="date"
          optional
          hint="The date listeners see if this came out elsewhere first. Clear it to fall back to the CHC date."
        />
      </Card>

      <Card
        title={`Tracks (${tracks.length})`}
        description="Reorder, rename, re-credit, add, or permanently delete tracks."
      >
        {tracks.map((track, index) => (
          <View key={track.key} style={styles.track}>
            <View style={uiStyles.row}>
              <View style={styles.trackBody}>
                {track.upload ? (
                  <Text style={track.upload.error ? uiStyles.error : uiStyles.muted}>
                    {fileSize(track.upload.size)} • {uploadLabel(track.upload)}
                  </Text>
                ) : (
                  <Text style={uiStyles.muted}>Track {index + 1} • already on this release</Text>
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

            <TrackMetadataEditor
              value={track}
              index={index}
              total={tracks.length}
              identityName={identityName}
              onCopyCreditsToAll={() => copyCreditsToAll(track.key)}
              onChange={(change) => patchTrack(track.key, change)}
            />
          </View>
        ))}

        <View style={uiStyles.actions}>
          <Button label="Add tracks" onPress={() => void addTracks()} disabled={busy || deletingRelease} />
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
  localeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  localeField: { flex: 1, minWidth: 220 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  artworkRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.lg },
  coverPreview: {
    width: 180,
    height: 180,
    borderRadius: RADII.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: { width: '100%', height: '100%' },
  coverFallback: { color: COLORS.muted, fontWeight: '800' },
  artworkActions: { flex: 1, minWidth: 220, gap: SPACING.sm },
  track: { gap: SPACING.sm, paddingBottom: SPACING.md },
  trackBody: { flex: 1, minWidth: 200, gap: 4 },
  trackActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  order: { color: COLORS.goldBright, fontSize: 20 },
  dim: { opacity: 0.25 },
});
