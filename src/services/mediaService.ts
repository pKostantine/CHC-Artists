import type { LyricEditorTrack } from '@/types/lyrics';

const DEFAULT_MEDIA_BASE_URL = 'https://chc-media-resolver.hrmpdd8d6c.workers.dev';

function getBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_CHC_MEDIA_BASE_URL || DEFAULT_MEDIA_BASE_URL).replace(/\/+$/, '');
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
