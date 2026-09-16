import type { LyricEditorTrack } from '@/types/lyrics';

function getBaseUrl(): string {
  const base = process.env.EXPO_PUBLIC_CHC_MEDIA_BASE_URL?.replace(/\/+$/, '');
  if (!base) throw new Error('Missing EXPO_PUBLIC_CHC_MEDIA_BASE_URL.');
  return base;
}

export function resolveTrackAudio(track: LyricEditorTrack): string | null {
  const asset = track.mediaAsset;
  if (!asset) return null;
  if (asset.provider === 'external') return asset.path;
  if (asset.provider !== 'cloudflare_r2' || asset.bucket !== 'chc-music') return null;

  const path = asset.path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  return `${getBaseUrl()}/music/${path}`;
}
