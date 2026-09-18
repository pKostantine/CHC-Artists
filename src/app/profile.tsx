import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Card, Field, Label, Loading, Page, PageHeader, StatusPill, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { creatorService } from '@/services/creatorService';
import { resolveImageUrl } from '@/services/mediaService';
import type { ArtistProfile, ArtistSocialLink } from '@/types/creator';
import { pickUploadCandidates, runUpload } from '@/utils/uploads';

/** The platforms the database accepts, in the order they are usually wanted. */
const PLATFORMS: { id: string; label: string; placeholder: string }[] = [
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
  { id: 'spotify', label: 'Spotify', placeholder: 'https://open.spotify.com/artist/…' },
  { id: 'apple_music', label: 'Apple Music', placeholder: 'https://music.apple.com/artist/…' },
  { id: 'soundcloud', label: 'SoundCloud', placeholder: 'https://soundcloud.com/you' },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/you' },
  { id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/you' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@you' },
  { id: 'x', label: 'X', placeholder: 'https://x.com/you' },
  { id: 'bandcamp', label: 'Bandcamp', placeholder: 'https://you.bandcamp.com' },
  { id: 'website', label: 'Website', placeholder: 'https://example.com' },
];

export default function ArtistProfileScreen() {
  const { account } = useWorkspace();
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [biography, setBiography] = useState('');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [pinned, setPinned] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  const apply = useCallback((next: ArtistProfile) => {
    setProfile(next);
    setDisplayName(next.displayName);
    setBiography(next.biography ?? '');
    setLinks(Object.fromEntries(next.socialLinks.map((link) => [link.platform, link.url])));
    setPinned(next.pinnedReleases.map((release) => release.id));
  }, []);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError('');
    try {
      apply(await creatorService.artistProfile(account.id));
    } catch (cause) {
      setError(creatorService.describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [account, apply]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!account) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const socialLinks: ArtistSocialLink[] = Object.entries(links)
        .filter(([, url]) => url.trim())
        .map(([platform, url]) => ({ platform, url: url.trim() }));

      apply(await creatorService.updateArtistProfile(account.id, {
        displayName: displayName.trim() || null,
        biography,
        socialLinks,
        pinnedReleaseIds: pinned,
      }));
      setNotice('Profile saved.');
    } catch (cause) {
      setError(creatorService.describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function changePicture() {
    if (!account) return;
    const picked = await pickUploadCandidates('image', false);
    if (!picked.length) return;

    setUploadingImage(true);
    setError('');
    setNotice('');
    try {
      let intentId: string | undefined;
      await runUpload(account.id, picked[0], (_id, change) => {
        if (change.uploadIntentId) intentId = change.uploadIntentId;
        if (change.error) setError(change.error);
      });

      if (!intentId) throw new Error('The picture did not finish uploading.');

      apply(await creatorService.updateArtistProfile(account.id, { profileImageUploadIntentId: intentId }));
      setNotice('Picture uploaded. It appears once processing finishes.');
    } catch (cause) {
      setError(creatorService.describeError(cause));
    } finally {
      setUploadingImage(false);
    }
  }

  function togglePin(releaseId: string) {
    setPinned((current) =>
      current.includes(releaseId) ? current.filter((id) => id !== releaseId) : [...current, releaseId],
    );
  }

  if (loading) return <Loading label="Loading your profile…" />;

  if (!profile) {
    return (
      <Page>
        <PageHeader title="Artist profile" />
        <Card title="Could not load your profile" description={error || 'No artist profile is set up for this account yet.'} />
      </Page>
    );
  }

  const imageUrl = profile.profileImage ? resolveImageUrl(profile.profileImage.bucket, profile.profileImage.path) : null;

  return (
    <Page>
      <PageHeader
        title="Artist profile"
        subtitle="This is how listeners see you on CHC Music."
        action={<Button kind="primary" label={busy ? 'Saving…' : 'Save profile'} busy={busy} onPress={() => void save()} />}
      />

      {!!notice && <Banner tone="success">{notice}</Banner>}
      {!!error && <Banner tone="error">{error}</Banner>}

      <Card title="Picture">
        <View style={styles.pictureRow}>
          <View style={styles.avatar}>
            {imageUrl
              ? <Image source={{ uri: imageUrl }} style={styles.avatarImage} resizeMode="cover" accessibilityLabel="Artist picture" />
              : <Text style={styles.avatarFallback}>{profile.displayName.slice(0, 1).toUpperCase()}</Text>}
          </View>
          <View style={styles.pictureBody}>
            <Button
              label={uploadingImage ? 'Uploading…' : profile.profileImage ? 'Replace picture' : 'Choose picture'}
              busy={uploadingImage}
              onPress={() => void changePicture()}
            />
            {!!profile.profileImagePending && (
              <Text style={uiStyles.muted}>Your new picture is being processed and will appear shortly.</Text>
            )}
          </View>
        </View>
      </Card>

      <Card title="Name & bio">
        <Field
          label="Artist name"
          value={displayName}
          onChangeText={setDisplayName}
          hint="Renaming your artist renames your workspace too — an account is one artist on CHC."
        />
        <Field label="Biography" value={biography} onChangeText={setBiography} multiline placeholder="Tell listeners who you are." />
        <View style={styles.statusRow}>
          <Label>Profile status</Label>
          <StatusPill status={profile.publicationStatus} />
        </View>
      </Card>

      <Card title="Links" description="Where else listeners can find you. Leave a field blank to remove it.">
        {PLATFORMS.map((platform) => (
          <Field
            key={platform.id}
            label={platform.label}
            value={links[platform.id] ?? ''}
            onChangeText={(url) => setLinks((current) => ({ ...current, [platform.id]: url }))}
            placeholder={platform.placeholder}
            autoCapitalize="none"
          />
        ))}
      </Card>

      <Card
        title="Pinned releases"
        description="Pinned releases sit at the top of your artist page, in the order you pick them."
      >
        {profile.releases.length ? (
          profile.releases.map((release) => {
            const index = pinned.indexOf(release.id);
            return (
              <Pressable
                key={release.id}
                onPress={() => togglePin(release.id)}
                accessibilityState={{ selected: index >= 0 }}
                style={[uiStyles.row, index >= 0 && styles.pinnedRow]}
              >
                <View style={styles.pinBody}>
                  <Text style={uiStyles.rowTitle}>{release.title}</Text>
                  <Text style={uiStyles.muted}>
                    {release.releaseType.toUpperCase()}
                    {release.displayDate ? ` • ${release.displayDate}` : ''}
                  </Text>
                </View>
                <StatusPill status={release.publicationStatus} />
                <Text style={[styles.pinMark, index >= 0 && styles.pinMarkOn]}>
                  {index >= 0 ? `Pinned ${index + 1}` : 'Pin'}
                </Text>
                <Pressable
                  onPress={() => router.navigate({ pathname: '/release/[id]', params: { id: release.id } })}
                  hitSlop={6}
                >
                  <Text style={uiStyles.link}>Edit</Text>
                </Pressable>
              </Pressable>
            );
          })
        ) : (
          <Text style={uiStyles.muted}>You have no releases yet.</Text>
        )}
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  pictureRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center', flexWrap: 'wrap' },
  pictureBody: { gap: SPACING.sm, flex: 1, minWidth: 200 },
  avatar: { width: 108, height: 108, borderRadius: 54, backgroundColor: COLORS.surfaceSoft, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: { color: COLORS.goldBright, fontSize: 40, fontWeight: '900' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  pinnedRow: { borderRadius: RADII.sm, borderColor: COLORS.gold },
  pinBody: { flex: 1, minWidth: 160, gap: 3 },
  pinMark: { color: COLORS.muted, fontWeight: '800', fontSize: 12 },
  pinMarkOn: { color: COLORS.goldBright },
});
