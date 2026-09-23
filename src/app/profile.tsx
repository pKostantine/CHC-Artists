import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Banner, Button, Card, Field, Label, Loading, Page, PageHeader, StatusPill, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { FileSelectButton } from '@/components/FileSelectButton';
import { creatorService } from '@/services/creatorService';
import { resolveImageUrl } from '@/services/mediaService';
import type { ArtistProfile, ArtistSocialLink, UploadCandidate } from '@/types/creator';

const PLATFORMS = [
  { id: 'website', label: 'Website', placeholder: 'https://yourwebsite.com' },
  { id: 'linktree', label: 'Linktree', placeholder: 'https://linktr.ee/yourname' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
  { id: 'soundcloud', label: 'SoundCloud', placeholder: 'https://soundcloud.com/you' },
  { id: 'spotify', label: 'Spotify', placeholder: 'https://open.spotify.com/artist/…' },
  { id: 'apple_music', label: 'Apple Music', placeholder: 'https://music.apple.com/artist/…' },
  { id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/you' },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/you' },
] as const;

const PLATFORM_IDS = new Set<string>(PLATFORMS.map((platform) => platform.id));
const LEGACY_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  x: 'X',
  bandcamp: 'Bandcamp',
};

interface ExtraLink {
  id: string;
  name: string;
  url: string;
}

let extraLinkSequence = 0;

function newExtraLink(): ExtraLink {
  extraLinkSequence += 1;
  return { id: `${Date.now()}-${extraLinkSequence}`, name: '', url: '' };
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function hostnameFor(value: string): string | null {
  try {
    return new URL(normalizeUrl(value)).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function standardLinkError(platform: string, value: string): string {
  if (!value.trim()) return '';
  const host = hostnameFor(value);
  if (!host) return 'Enter a valid web link.';

  switch (platform) {
    case 'website':
      return '';
    case 'linktree':
      return host === 'linktr.ee' || host === 'www.linktr.ee' ? '' : 'This must be a Linktree link (linktr.ee).';
    case 'youtube':
      return hostIs(host, 'youtube.com') || host === 'youtu.be' ? '' : 'This must be a YouTube link.';
    case 'soundcloud':
      return hostIs(host, 'soundcloud.com') ? '' : 'This must be a SoundCloud link.';
    case 'spotify':
      return hostIs(host, 'spotify.com') || host === 'spotify.link' ? '' : 'This must be a Spotify link.';
    case 'apple_music':
      return host === 'music.apple.com' ? '' : 'This must be an Apple Music link.';
    case 'facebook':
      return hostIs(host, 'facebook.com') || host === 'fb.com' || host === 'fb.me' ? '' : 'This must be a Facebook link.';
    case 'instagram':
      return hostIs(host, 'instagram.com') ? '' : 'This must be an Instagram link.';
    default:
      return '';
  }
}

function generalLinkError(value: string): string {
  if (!value.trim()) return 'Enter a URL.';
  return hostnameFor(value) ? '' : 'Enter a valid web link.';
}

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
  const [extraLinks, setExtraLinks] = useState<ExtraLink[]>([]);
  const [linkErrors, setLinkErrors] = useState<Record<string, string>>({});
  const [pinned, setPinned] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pictureProgress, setPictureProgress] = useState(0);
  const [pendingPictureUri, setPendingPictureUri] = useState<string | null>(null);

  const apply = useCallback((next: ArtistProfile) => {
    setProfile(next);
    setDisplayName(next.displayName);
    setBiography(next.biography ?? '');

    const standard: Record<string, string> = {};
    const extras: ExtraLink[] = [];
    for (const link of next.socialLinks) {
      if (PLATFORM_IDS.has(link.platform)) {
        standard[link.platform] = link.url;
        continue;
      }

      const customId = link.platform.startsWith('custom:')
        ? link.platform.slice('custom:'.length)
        : link.platform;
      extras.push({
        id: customId || `existing-${extras.length}`,
        name: link.label?.trim() || LEGACY_LABELS[link.platform] || link.platform,
        url: link.url,
      });
    }

    setLinks(standard);
    setExtraLinks(extras);
    setPinned(next.pinnedReleases.map((release) => release.id));
    if (!next.profileImagePending) setPendingPictureUri(null);
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

  // Expo Router can keep this screen mounted while the artist visits another
  // section. Refresh on every focus so a newly processed profile image and any
  // profile edits never come back as stale cached state.
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  // Profile pictures are processed asynchronously. Poll only while one is
  // pending so the finished image replaces the local preview automatically.
  useEffect(() => {
    if (!account || !profile?.profileImagePending) return;

    let cancelled = false;
    let running = false;
    const refreshPicture = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const next = await creatorService.artistProfile(account.id);
        if (!cancelled) apply(next);
      } catch {
        // A transient refresh failure should not turn a successful upload into
        // an error. The next poll can recover.
      } finally {
        running = false;
      }
    };

    const timer = setInterval(() => { void refreshPicture(); }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [account, profile?.profileImagePending, apply]);

  const preparedLinks = useMemo(() => {
    const nextErrors: Record<string, string> = {};
    const socialLinks: ArtistSocialLink[] = [];

    for (const platform of PLATFORMS) {
      const raw = links[platform.id] ?? '';
      if (!raw.trim()) continue;
      const fieldError = standardLinkError(platform.id, raw);
      if (fieldError) {
        nextErrors[`standard:${platform.id}`] = fieldError;
        continue;
      }
      socialLinks.push({ platform: platform.id, url: normalizeUrl(raw) });
    }

    for (const link of extraLinks) {
      const name = link.name.trim();
      const rawUrl = link.url.trim();
      if (!name && !rawUrl) continue;
      if (!name) nextErrors[`extra:${link.id}:name`] = 'Enter a name for this link.';
      const urlError = generalLinkError(rawUrl);
      if (urlError) nextErrors[`extra:${link.id}:url`] = urlError;
      if (name && !urlError) {
        socialLinks.push({
          platform: `custom:${link.id}`,
          label: name,
          url: normalizeUrl(rawUrl),
        });
      }
    }

    return { socialLinks, errors: nextErrors };
  }, [links, extraLinks]);

  async function save() {
    if (!account) return;

    setLinkErrors(preparedLinks.errors);
    if (Object.keys(preparedLinks.errors).length) {
      setError('Fix the links marked below before saving.');
      setNotice('');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      apply(await creatorService.updateArtistProfile(account.id, {
        displayName: displayName.trim() || null,
        biography,
        socialLinks: preparedLinks.socialLinks,
        pinnedReleaseIds: pinned,
      }));
      setNotice('Profile saved.');
    } catch (cause) {
      setError(creatorService.describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function changePicture(picked: UploadCandidate[]) {
    if (!account || !picked.length) return;
    const picture = picked[0];
    setUploadingImage(true);
    setPictureProgress(0);
    setPendingPictureUri(picture.uri);
    setError('');
    setNotice('');

    try {
      // Profile images have a special flow: upload the source first, then tell
      // the profile RPC which upload intent to process. The RPC records the
      // pending image and queues image processing atomically, avoiding the race
      // where processing could finish before the artist was marked as waiting.
      const intentId = await creatorService.upload(account.id, picture, setPictureProgress);
      const next = await creatorService.updateArtistProfile(account.id, {
        profileImageUploadIntentId: intentId,
      });
      apply(next);
      setNotice('Picture uploaded. CHC is processing it now.');
    } catch (cause) {
      setPendingPictureUri(null);
      setError(creatorService.describeError(cause));
    } finally {
      setUploadingImage(false);
      setPictureProgress(0);
    }
  }

  function togglePin(releaseId: string) {
    setPinned((current) =>
      current.includes(releaseId) ? current.filter((id) => id !== releaseId) : [...current, releaseId],
    );
  }

  function updateExtraLink(id: string, change: Partial<ExtraLink>) {
    setExtraLinks((current) => current.map((link) => link.id === id ? { ...link, ...change } : link));
    setLinkErrors((current) => {
      const next = { ...current };
      if ('name' in change) delete next[`extra:${id}:name`];
      if ('url' in change) delete next[`extra:${id}:url`];
      return next;
    });
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

  const imageUrl = profile.profileImage ? resolveImageUrl(profile.profileImage.bucket, profile.profileImage.path, profile.profileImage.version ?? profile.profileImage.assetId) : null;
  const shownImageUrl = pendingPictureUri || imageUrl;

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
            {shownImageUrl
              ? <Image
                  key={profile.profileImage ? `${profile.profileImage.assetId}-${profile.profileImage.version ?? ''}` : pendingPictureUri ?? 'pending'}
                  source={{ uri: shownImageUrl }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  accessibilityLabel="Artist picture"
                />
              : <Text style={styles.avatarFallback}>{profile.displayName.slice(0, 1).toUpperCase()}</Text>}
          </View>
          <View style={styles.pictureBody}>
            <FileSelectButton
              label={uploadingImage ? `Uploading ${Math.round(pictureProgress * 100)}%` : profile.profileImage ? 'Replace picture' : 'Choose picture'}
              kind="image"
              busy={uploadingImage}
              onFiles={(picked) => void changePicture(picked)}
              onError={setError}
            />
            {!!profile.profileImagePending && (
              <Text style={uiStyles.muted}>Your new picture is being processed. This preview will update automatically.</Text>
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
              </Pressable>
            );
          })
        ) : (
          <Text style={uiStyles.muted}>You have no releases yet.</Text>
        )}
      </Card>

      <Card title="Links" description="Where else listeners can find you. Leave a standard field blank to remove it.">
        {PLATFORMS.map((platform) => {
          const fieldError = linkErrors[`standard:${platform.id}`] ?? '';
          return (
            <View key={platform.id} style={styles.linkField}>
              <Field
                label={platform.label}
                value={links[platform.id] ?? ''}
                onChangeText={(url) => {
                  setLinks((current) => ({ ...current, [platform.id]: url }));
                  setLinkErrors((current) => {
                    const next = { ...current };
                    delete next[`standard:${platform.id}`];
                    return next;
                  });
                }}
                onBlur={() => {
                  const nextError = standardLinkError(platform.id, links[platform.id] ?? '');
                  setLinkErrors((current) => ({ ...current, [`standard:${platform.id}`]: nextError }));
                }}
                placeholder={platform.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              {!!fieldError && <Text style={uiStyles.errorDetail}>{fieldError}</Text>}
            </View>
          );
        })}

        {extraLinks.map((link, index) => (
          <View key={link.id} style={styles.extraLink}>
            <Text style={styles.extraLinkTitle}>Extra link {index + 1}</Text>
            <Field
              label="Name"
              value={link.name}
              onChangeText={(name) => updateExtraLink(link.id, { name })}
              placeholder="e.g. Coptic Hymns Archive"
            />
            {!!linkErrors[`extra:${link.id}:name`] && (
              <Text style={uiStyles.errorDetail}>{linkErrors[`extra:${link.id}:name`]}</Text>
            )}
            <Field
              label="URL"
              value={link.url}
              onChangeText={(url) => updateExtraLink(link.id, { url })}
              onBlur={() => {
                const nextError = generalLinkError(link.url);
                setLinkErrors((current) => ({ ...current, [`extra:${link.id}:url`]: nextError }));
              }}
              placeholder="https://example.com/your-page"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {!!linkErrors[`extra:${link.id}:url`] && (
              <Text style={uiStyles.errorDetail}>{linkErrors[`extra:${link.id}:url`]}</Text>
            )}
            <Button
              kind="ghost"
              label="Remove extra link"
              onPress={() => {
                setExtraLinks((current) => current.filter((item) => item.id !== link.id));
                setLinkErrors((current) => {
                  const next = { ...current };
                  delete next[`extra:${link.id}:name`];
                  delete next[`extra:${link.id}:url`];
                  return next;
                });
              }}
            />
          </View>
        ))}

        <Button
          kind="secondary"
          label="+ Add extra link"
          onPress={() => setExtraLinks((current) => [...current, newExtraLink()])}
        />
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
  linkField: { gap: 2 },
  extraLink: { gap: SPACING.sm, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.md, backgroundColor: COLORS.black },
  extraLinkTitle: { color: COLORS.white, fontWeight: '900', fontSize: 14 },
});
