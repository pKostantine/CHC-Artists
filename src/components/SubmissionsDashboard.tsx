import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Banner, Button, Card, Loading, Page, PageHeader, StatusPill, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING } from '@/constants/theme';
import { useWorkspace } from '@/context/WorkspaceContext';
import type { PublicationStatus } from '@/types/creator';
import { shortDate, submissionTypeLabel } from '@/utils/format';

const IN_REVIEW: PublicationStatus[] = ['pending_review', 'processing'];

export default function SubmissionsDashboardScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const { dashboard, loading, error, refresh, draft } = useWorkspace();
  const { submissions } = dashboard;

  // Pick up reviewer decisions when the creator comes back to this page.
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  // Fully approved/processed music moves to the Releases section. Published
  // work lives there too. Submissions is only the working/review inbox.
  const activeSubmissions = submissions.filter((submission) =>
    submission.submissionType !== 'music_release'
    || (submission.status !== 'approved' && submission.status !== 'published'),
  );
  const needsAction = activeSubmissions.filter((s) => s.status === 'changes_requested');
  const draftInProgress = Boolean(draft.title || draft.media.length || draft.artwork);
  const stats = [
    { label: 'Needs changes', value: needsAction.length },
    { label: 'In review', value: activeSubmissions.filter((s) => IN_REVIEW.includes(s.status)).length },
    { label: 'Other submissions', value: activeSubmissions.filter((s) => !IN_REVIEW.includes(s.status) && s.status !== 'changes_requested').length },
  ];

  return (
    <Page>
      <PageHeader
        title="Submissions"
        subtitle="Create new work and follow it through review. Fully approved music moves to Releases."
        action={<Button kind="primary" label={draftInProgress ? 'Continue draft' : 'New submission'} onPress={() => router.push('/submission/new')} />}
      />

      {!!error && (
        <Banner tone="error">{error}</Banner>
      )}

      {needsAction.length > 0 && (
        <Banner tone="warning">
          {needsAction.length === 1 ? '1 submission needs' : `${needsAction.length} submissions need`} changes before CHC can approve it.
        </Banner>
      )}

      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statNum}>{stat.value}</Text>
            <Text numberOfLines={2} style={styles.statLabel}>
              {compact && stat.label === 'Other submissions' ? 'Other' : stat.label}
            </Text>
          </View>
        ))}
      </View>

      <Card title="Your submissions">
        {loading && !activeSubmissions.length ? (
          <Loading label="Loading submissions…" />
        ) : activeSubmissions.length ? (
          activeSubmissions.map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/submission/[id]', params: { id: s.id } })}
              style={({ pressed }) => [uiStyles.row, pressed && styles.pressed]}
            >
              <View style={styles.rowText}>
                <Text style={uiStyles.rowTitle}>{s.title}</Text>
                <Text style={uiStyles.muted}>
                  {submissionTypeLabel(s.submissionType)} • {s.itemCount} file{s.itemCount === 1 ? '' : 's'} • Updated {shortDate(s.updatedAt)}
                </Text>
                {s.status === 'changes_requested' && !!s.reviewNotes && (
                  <Text style={styles.warning} numberOfLines={2}>Changes requested: {s.reviewNotes}</Text>
                )}
              </View>
              <StatusPill status={s.status} />
              <Text style={uiStyles.link}>{s.status === 'changes_requested' ? 'Address changes ›' : 'View ›'}</Text>
            </Pressable>
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={uiStyles.rowTitle}>No submissions yet</Text>
            <Text style={uiStyles.muted}>No submissions need your attention right now. Approved music appears in Releases.</Text>
          </View>
        )}
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border },
  stat: { flex: 1, minWidth: 0, minHeight: 72, paddingHorizontal: 10, paddingVertical: 12, justifyContent: 'center', borderRightWidth: 1, borderRightColor: COLORS.border },
  statNum: { color: COLORS.white, fontSize: 21, lineHeight: 24, fontWeight: '800' },
  statLabel: { color: COLORS.muted, fontSize: 11, lineHeight: 14, marginTop: 3 },
  rowText: { flex: 1, minWidth: 200, gap: 3 },
  warning: { color: '#ffc36b', marginTop: 4 },
  pressed: { opacity: 0.75 },
  empty: { gap: 5, paddingVertical: 2 },
});
