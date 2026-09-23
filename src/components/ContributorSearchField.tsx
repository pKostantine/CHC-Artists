import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { creatorService } from '@/services/creatorService';
import { resolveImageUrl } from '@/services/mediaService';
import { Field, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING } from '@/constants/theme';
import type { ContributorSuggestion } from '@/types/creator';

interface Props {
  accountId: string | undefined;
  label: string;
  value: string;
  selectedId?: string;
  kind: 'artist' | 'cantor' | 'all';
  allowKinds?: ('artist' | 'cantor' | 'chorus')[];
  placeholder?: string;
  hint?: string;
  onTextChange: (text: string) => void;
  onSelect: (person: ContributorSuggestion) => void;
}

/** Search by name or a near match before creating another artist/cantor. */
export function ContributorSearchField({
  accountId, label, value, selectedId, kind, allowKinds,
  placeholder, hint, onTextChange, onSelect,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [matches, setMatches] = useState<ContributorSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!expanded || !accountId || value.trim().length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setError('');
    const timer = setTimeout(() => {
      void creatorService.searchContributors(accountId, value.trim(), kind)
        .then((results) => {
          if (cancelled) return;
          setMatches(allowKinds ? results.filter((person) => allowKinds.includes(person.kind)) : results);
        })
        .catch((cause) => {
          if (cancelled) return;
          setError(creatorService.describeError(cause));
          setMatches([]);
        })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 240);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [accountId, allowKinds?.join(','), expanded, kind, value]);

  return (
    <View style={styles.container}>
      <Field
        label={label}
        value={value}
        placeholder={placeholder}
        hint={hint}
        onFocus={() => setExpanded(true)}
        onChangeText={(text) => { onTextChange(text); setExpanded(true); }}
        autoCorrect={false}
      />
      {!!selectedId && (
        <View style={styles.linked}>
          <Text style={styles.linkedText}>✓ Linked to an existing CHC profile</Text>
          <Pressable accessibilityRole="button" onPress={() => { onTextChange(value); setExpanded(true); }}>
            <Text style={uiStyles.link}>Change</Text>
          </Pressable>
        </View>
      )}
      {expanded && !selectedId && value.trim().length >= 2 && (
        <View style={styles.results}>
          {searching && <Text style={uiStyles.muted}>Finding similar CHC profiles…</Text>}
          {!!error && <Text style={uiStyles.error}>{error}</Text>}
          {!searching && !error && !matches.length && (
            <Text style={uiStyles.muted}>No matching profiles. You can use this name to create a new credit.</Text>
          )}
          {matches.map((person) => {
            const image = person.profileImage
              ? resolveImageUrl(person.profileImage.bucket, person.profileImage.path, person.profileImage.version)
              : null;
            return (
              <Pressable
                key={`${person.kind}:${person.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Use existing ${person.kind} ${person.title}`}
                onPress={() => { onSelect(person); setExpanded(false); }}
                style={styles.result}
              >
                {image ? (
                  <Image source={{ uri: image }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatar, styles.fallback]}>
                    <Text style={styles.initials}>{person.title.trim().charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.nameGroup}>
                  <Text style={styles.name} numberOfLines={1}>{person.title}</Text>
                  <Text style={uiStyles.muted}>{person.kind === 'chorus' ? 'Chorus' : person.kind === 'cantor' ? 'Cantor' : 'Artist'} • Existing CHC profile</Text>
                </View>
                <Text style={uiStyles.link}>Link</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.xs },
  results: { gap: SPACING.xs, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADII.md, padding: SPACING.sm },
  result: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', minHeight: 50, paddingVertical: SPACING.xs },
  avatar: { height: 40, width: 40, borderRadius: 20, overflow: 'hidden' },
  fallback: { backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  initials: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  nameGroup: { flex: 1, minWidth: 0 },
  name: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  linked: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', justifyContent: 'space-between' },
  linkedText: { color: '#8fe0a8', fontSize: 12, fontWeight: '700' },
});
