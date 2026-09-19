import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Label, Segmented, uiStyles } from '@/components/ui';
import { COLORS, RADII, SPACING } from '@/constants/theme';
import type { LocalizedMetadata, TrackContributor, TrackContributorRole } from '@/types/creator';
import { MUSIC_TITLE_LOCALES, preferredLocalizedTitle } from '@/utils/titles';

export interface EditableTrackMetadata {
  title?: string;
  localizedTitle?: LocalizedMetadata;
  mainArtistName?: string;
  contributors?: TrackContributor[];
}

const CONTRIBUTOR_ROLES: { id: TrackContributorRole; title: string }[] = [
  { id: 'featured', title: 'Featured performer / vocals' },
  { id: 'composer', title: 'Composer / music' },
  { id: 'arranger', title: 'Arranger' },
  { id: 'producer', title: 'Producer' },
  { id: 'lyricist', title: 'Lyricist' },
  { id: 'artwork', title: 'Track artwork' },
];

export function TrackCreditsEditor({
  value,
  identityName,
  onChange,
  onCopyToAll,
}: {
  value: EditableTrackMetadata;
  identityName: string;
  onChange: (change: Partial<EditableTrackMetadata>) => void;
  onCopyToAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const contributors = value.contributors ?? [];
  const mainName = value.mainArtistName?.trim() || identityName || 'Your artist profile';

  function addContributor() {
    onChange({
      contributors: [
        ...contributors,
        { id: `${Date.now()}-${contributors.length}`, name: '', role: 'featured' },
      ],
    });
  }

  function updateContributor(id: string, change: { name?: string; role?: TrackContributorRole }) {
    onChange({
      contributors: contributors.map((credit) => (
        credit.id === id ? { ...credit, ...change } : credit
      )),
    });
  }

  return (
    <View style={styles.credits}>
      <Pressable onPress={() => setOpen(!open)} hitSlop={6} style={styles.addLink}>
        <Text style={uiStyles.link}>
          {open
            ? 'Hide song credits'
            : `Song credits: ${mainName}${contributors.length ? ` • ${contributors.length} contributor${contributors.length === 1 ? '' : 's'}` : ''}`}
        </Text>
      </Pressable>

      {open && (
        <View style={styles.creditsBody}>
          <Field
            label="Main artist"
            value={value.mainArtistName ?? ''}
            onChangeText={(mainArtistName) => onChange({ mainArtistName })}
            placeholder={identityName || 'Artist name'}
            hint={identityName
              ? `Leave blank to use ${identityName}. Or type any artist name for this track.`
              : 'Type the main artist name for this track.'}
          />

          <View style={styles.group}>
            <Label>Additional contributors</Label>
            <Text style={uiStyles.muted}>
              Add everyone who should be credited on this track, then choose what they did.
            </Text>

            {contributors.map((credit, index) => (
              <View key={credit.id} style={styles.contributor}>
                <Field
                  label={`Contributor ${index + 1}`}
                  value={credit.name}
                  onChangeText={(name) => updateContributor(credit.id, { name })}
                  placeholder="Type a name"
                />
                <View style={styles.group}>
                  <Label>Role</Label>
                  <Segmented
                    items={CONTRIBUTOR_ROLES}
                    value={credit.role}
                    onChange={(role) => updateContributor(credit.id, { role: role as TrackContributorRole })}
                  />
                </View>
                <Button
                  kind="ghost"
                  label="Remove contributor"
                  onPress={() => onChange({ contributors: contributors.filter((x) => x.id !== credit.id) })}
                />
              </View>
            ))}

            <Button label="+ Add contributor" onPress={addContributor} />
          </View>

          {onCopyToAll && (
            <Button
              kind="secondary"
              label="Copy these credits to all tracks"
              onPress={onCopyToAll}
            />
          )}
        </View>
      )}
    </View>
  );
}

export function TrackMetadataEditor({
  value,
  index,
  total,
  identityName,
  onChange,
  onCopyCreditsToAll,
}: {
  value: EditableTrackMetadata;
  index: number;
  total: number;
  identityName: string;
  onChange: (change: Partial<EditableTrackMetadata>) => void;
  onCopyCreditsToAll?: () => void;
}) {
  const localized = value.localizedTitle ?? { en: '', ar: '', cop: '', fr: '' };

  return (
    <View style={styles.trackMetadata}>
      <View style={styles.group}>
        <Label>{`Track ${index + 1} title`}</Label>
        <Text style={uiStyles.muted}>
          English, Arabic, and French are optional individually; enter at least one.
        </Text>
        <View style={styles.localeGrid}>
          {MUSIC_TITLE_LOCALES.map(({ key, label }) => (
            <View key={key} style={styles.localeField}>
              <Field
                label={label}
                value={localized[key]}
                onChangeText={(text) => {
                  const localizedTitle = { ...localized, [key]: text };
                  onChange({ localizedTitle, title: preferredLocalizedTitle(localizedTitle) });
                }}
                style={key === 'ar' ? styles.rtl : undefined}
              />
            </View>
          ))}
        </View>
      </View>

      <TrackCreditsEditor
        value={value}
        identityName={identityName}
        onChange={onChange}
        onCopyToAll={index === 0 && total > 1 ? onCopyCreditsToAll : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  trackMetadata: { gap: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  credits: { paddingLeft: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.sm },
  creditsBody: { gap: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.black },
  contributor: { gap: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  group: { gap: SPACING.sm },
  addLink: { alignSelf: 'flex-start' },
  localeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  localeField: { flex: 1, minWidth: 220 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});
