import * as DocumentPicker from 'expo-document-picker';
import { creatorService } from '@/services/creatorService';
import type { MediaKind, UploadCandidate } from '@/types/creator';

const PICKER_TYPES: Record<'audio' | 'video' | 'image' | 'lesson', string[]> = {
  audio: ['audio/*'],
  video: ['video/*'],
  image: ['image/*'],
  lesson: ['video/*', 'audio/*'],
};

function kindFor(mimeType: string, name: string, fallback: MediaKind): MediaKind {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  if (/\.(mp4|mov|m4v)$/i.test(name)) return 'video';
  if (/\.(mp3|m4a|wav|flac|aac|ogg)$/i.test(name)) return 'audio';
  return fallback;
}

/** Opens the system picker and returns fresh, not-yet-uploaded candidates. */
export async function pickUploadCandidates(kind: keyof typeof PICKER_TYPES, multiple: boolean): Promise<UploadCandidate[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: PICKER_TYPES[kind],
    copyToCacheDirectory: true,
    multiple,
  });
  if (result.canceled) return [];

  const stamp = Date.now();
  const fallback: MediaKind = kind === 'image' ? 'image' : kind === 'audio' ? 'audio' : 'video';
  return result.assets.map((asset, index) => ({
    id: `${stamp}-${index}-${asset.name}`,
    name: asset.name,
    uri: asset.uri,
    mimeType: asset.mimeType || '',
    size: asset.size || 0,
    mediaType: kindFor(asset.mimeType || '', asset.name, fallback),
    progress: 0,
    uploading: false,
    uploaded: false,
  }));
}

/** Uploads one file privately, reporting every state change through `patch`. */
export async function runUpload(
  accountId: string,
  file: UploadCandidate,
  patch: (id: string, change: Partial<UploadCandidate>) => void,
): Promise<void> {
  patch(file.id, { uploading: true, uploaded: false, uploadIntentId: undefined, error: undefined, progress: 0 });
  try {
    const uploadIntentId = await creatorService.upload(accountId, file, (progress) => {
      patch(file.id, { progress, uploading: progress < 1 });
    });
    patch(file.id, { uploadIntentId, uploaded: true, uploading: false, progress: 1, error: undefined });
  } catch (error) {
    patch(file.id, {
      uploading: false,
      uploaded: false,
      uploadIntentId: undefined,
      progress: 0,
      error: creatorService.describeError(error),
    });
  }
}

export function uploadsBlocking(files: UploadCandidate[]): string | null {
  if (files.some((file) => file.uploading)) return 'Wait for the selected files to finish uploading.';
  if (files.some((file) => file.error)) return 'Retry or remove the files that failed to upload.';
  if (files.some((file) => !file.uploaded || !file.uploadIntentId)) return 'Upload all selected files before submitting.';
  return null;
}
