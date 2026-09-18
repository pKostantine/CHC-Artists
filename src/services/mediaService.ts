import type { LyricEditorTrack } from '@/types/lyrics';

const DEFAULT_MEDIA_BASE_URL = 'https://chc-media-resolver.hrmpdd8d6c.workers.dev';

function getBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_CHC_MEDIA_BASE_URL || DEFAULT_MEDIA_BASE_URL).replace(/\/+$/, '');
}

/**
 * A public delivery URL for an object the resolver serves. Buckets other than
 * the three public ones have no public route, so they resolve to nothing.
 */
export function resolveImageUrl(bucket: string, path: string): string | null {
  const segment = bucket === 'chc-images' ? 'images'
    : bucket === 'chc-music' ? 'music'
    : bucket === 'chc-learning' ? 'learning'
    : null;
  if (!segment) return null;

  const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${getBaseUrl()}/${segment}/${encoded}`;
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
