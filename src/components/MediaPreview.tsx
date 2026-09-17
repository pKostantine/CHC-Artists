import { createElement, useEffect } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { COLORS, RADII, SPACING } from '@/constants/theme';
import type { UploadCandidate } from '@/types/creator';

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Plays back a file the creator has chosen but not yet submitted, straight
 * from the local URI the picker handed us -- nothing is uploaded to be
 * previewed. One of these is mounted at a time, so there is one audio player
 * rather than one per row.
 *
 * Video previews are web-only: the deployed CHC Artists is the website, and
 * showing video anywhere else would mean pulling in a native video
 * dependency this app does not otherwise need.
 */
export function MediaPreview({ file, onClose }: { file: UploadCandidate; onClose: () => void }) {
  const isAudio = file.mediaType === 'audio';
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    player.pause();
    player.replace(isAudio ? file.uri : null);
    return () => player.pause();
  }, [file.uri, isAudio, player]);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={1}>{file.name}</Text>
        <Pressable onPress={onClose} hitSlop={8}><Text style={styles.close}>Close preview</Text></Pressable>
      </View>

      {file.mediaType === 'image' ? (
        <Image source={{ uri: file.uri }} style={styles.image} resizeMode="contain" />
      ) : isAudio ? (
        <View style={styles.transport}>
          <Pressable
            style={styles.playButton}
            onPress={() => (status.playing ? player.pause() : player.play())}
          >
            <Text style={styles.playText}>{status.playing ? 'Pause' : 'Play'}</Text>
          </Pressable>
          <Text style={styles.time}>{clock(status.currentTime)} / {clock(status.duration)}</Text>
        </View>
      ) : Platform.OS === 'web' ? (
        createElement('video', {
          src: file.uri,
          controls: true,
          style: { width: '100%', maxHeight: 360, borderRadius: RADII.sm, backgroundColor: COLORS.black },
        })
      ) : (
        <Text style={styles.muted}>Video preview is available on the CHC Artists website.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.sm,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceSoft,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  name: { color: COLORS.white, fontWeight: '800', flex: 1 },
  close: { color: COLORS.goldBright, fontWeight: '700', fontSize: 12 },
  image: { width: '100%', height: 240, borderRadius: RADII.sm, backgroundColor: COLORS.black },
  transport: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  playButton: {
    minWidth: 96,
    paddingVertical: 10,
    borderRadius: RADII.sm,
    alignItems: 'center',
    backgroundColor: COLORS.gold,
  },
  playText: { color: COLORS.black, fontWeight: '900' },
  time: { color: COLORS.muted, fontVariant: ['tabular-nums'] },
  muted: { color: COLORS.muted, fontSize: 12 },
});
