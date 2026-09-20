import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Banner, Button, Card, Loading, Page, PageHeader, StatusPill, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import { creatorService } from '@/services/creatorService';
import { resolveImageUrl } from '@/services/mediaService';
import type { CreatorReleaseSummary } from '@/types/creator';

function dateLabel(value?: string | null): string {
  if (!value) return 'No date set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ReleaseRow({ release }: { release: CreatorReleaseSummary }) {
  const artworkUrl = release.cover
    ? resolveImageUrl(release.cover.bucket, release.cover.path, release.cover.version)
    : null;

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/release/[id]', params: { id: release.id } })}
      style={({ pressed }) => [styles.releaseRow, pressed && styles.pressed]}
    >
      <View style={styles.cover}>
        {artworkUrl ? (
          <Image source={{ uri: artworkUrl }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <Text style={styles.coverFallback}>CHC</Text>
        )}
      </View>

      <View style={styles.releaseBody}>
        <View style={styles.titleLine}>
          <Text style={styles.title}>{release.title}</Text>
          <StatusPill status={release.publicationStatus} />
        </View>
        <Text style={uiStyles.muted}>
          {release.releaseType.toUpperCase()} • {release.trackCount} track{release.trackCount === 1 ? '' : 's'}
        </Text>
        <Text style={release.releaseState === 'ready' ? styles.ready : styles.released}>
          {release.releaseState === 'ready'
            ? `Ready for release • Goes live ${dateLabel(release.scheduledReleaseAt)}`
            : `Released • ${release.displayDate || dateLabel(release.scheduledReleaseAt)}`}
        </Text>
      </View>

      <Text style={uiStyles.link}>Edit release ›</Text>
    </Pressable>
  );
}

export default function ReleasesScreen() {
  const { account } = useWorkspace();
  const [releases, setReleases] = useState<CreatorReleaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (soft = false) => {
    if (!account) return;
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setReleases(await creatorService.releases(account.id));
    } catch (cause) {
      setError(creatorService.describeError(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [account]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (loading && !releases.length) return <Loading label="Loading releases…" />;

  const ready = releases.filter((release) => release.releaseState === 'ready');
  const released = releases.filter((release) => release.releaseState === 'released');

  return (
    <Page>
      <PageHeader
        title="Releases"
        subtitle="Approved, fully processed music and everything you have already released."
        action={(
          <Button
            kind="secondary"
            label={refreshing ? 'Refreshing…' : 'Refresh'}
            busy={refreshing}
            onPress={() => void load(true)}
          />
        )}
      />

      {!!error && <Banner tone="error">{error}</Banner>}

      <Card
        title={`Ready for release (${ready.length})`}
        description="CHC has approved these releases and every required media file is processed. You can still edit them here."
      >
        {ready.length ? (
          <View style={styles.list}>
            {ready.map((release) => <ReleaseRow key={release.id} release={release} />)}
          </View>
        ) : (
          <Text style={uiStyles.muted}>Nothing is waiting for release right now.</Text>
        )}
      </Card>

      <Card
        title={`Released (${released.length})`}
        description="Music already published to CHC. Open any release to change its details, artwork, tracks, credits, or dates."
      >
        {released.length ? (
          <View style={styles.list}>
            {released.map((release) => <ReleaseRow key={release.id} release={release} />)}
          </View>
        ) : (
          <Text style={uiStyles.muted}>You have not released any music on CHC yet.</Text>
        )}
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACING.sm },
  releaseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderRadius: 0,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  cover: {
    width: 58,
    height: 58,
    borderRadius: RADII.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: { width: '100%', height: '100%' },
  coverFallback: { color: COLORS.goldBright, fontWeight: '900', fontSize: 12 },
  releaseBody: { flex: 1, minWidth: 180, gap: 3 },
  titleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  title: { color: COLORS.white, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  ready: { color: '#ffc36b', fontSize: 12, fontWeight: '800' },
  released: { color: '#b5ecc6', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.78 },
});
