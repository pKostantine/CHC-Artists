import * as DocumentPicker from 'expo-document-picker';
import { creatorService } from '@/services/creatorService';
import type { CreatorDraft, MediaKind, UploadCandidate } from '@/types/creator';
import { guessLocalizedTitlesFromFilename, preferredLocalizedTitle } from '@/utils/titles';

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

function freshCandidate(input: {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  kind: keyof typeof PICKER_TYPES;
  sourceFile?: any;
}): UploadCandidate {
  const fallback: MediaKind = input.kind === 'image' ? 'image' : input.kind === 'audio' ? 'audio' : 'video';
  const guessedTitles = input.kind === 'image'
    ? { en: '', ar: '', cop: '', fr: '' }
    : guessLocalizedTitlesFromFilename(input.name);
  return {
    id: input.id,
    name: input.name,
    uri: input.uri,
    mimeType: input.mimeType,
    size: input.size,
    sourceFile: input.sourceFile,
    mediaType: kindFor(input.mimeType, input.name, fallback),
    progress: 0,
    uploading: false,
    uploaded: false,
    title: preferredLocalizedTitle(guessedTitles),
    localizedTitle: guessedTitles,
    mainArtistName: '',
    contributors: [],
  };
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
  return result.assets.map((asset, index) => freshCandidate({
    id: `${stamp}-${index}-${asset.name}`,
    name: asset.name,
    uri: asset.uri,
    mimeType: asset.mimeType || '',
    size: asset.size || 0,
    kind,
    sourceFile: (asset as any).file,
  }));
}

function dropMatches(kind: keyof typeof PICKER_TYPES, mimeType: string, name: string): boolean {
  const audio = mimeType.startsWith('audio/') || /\.(mp3|m4a|wav|flac|aac|ogg|webm)$/i.test(name);
  const video = mimeType.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(name);
  const image = mimeType.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name);
  if (kind === 'audio') return audio;
  if (kind === 'video') return video;
  if (kind === 'image') return image;
  return audio || video;
}

/** Converts browser drag-and-drop File objects into the same upload candidates as the picker. */
export function droppedUploadCandidates(files: any[], kind: keyof typeof PICKER_TYPES): UploadCandidate[] {
  const webUrl = (globalThis as any).URL;
  if (!webUrl?.createObjectURL) return [];

  const stamp = Date.now();
  return files
    .filter((file) => dropMatches(kind, String(file?.type || ''), String(file?.name || '')))
    .map((file, index) => freshCandidate({
      id: `${stamp}-drop-${index}-${file.name}`,
      name: String(file.name),
      uri: webUrl.createObjectURL(file),
      mimeType: String(file.type || ''),
      size: Number(file.size || 0),
      kind,
      sourceFile: file,
    }));
}

/** Uploads one file privately, reporting every state change through `patch`. */
export async function runUpload(
  accountId: string,
  file: UploadCandidate,
  mode: CreatorDraft['mode'],
  patch: (id: string, change: Partial<UploadCandidate>) => void,
): Promise<void> {
  patch(file.id, { uploading: true, uploaded: false, uploadIntentId: undefined, error: undefined, progress: 0 });
  try {
    const uploadIntentId = await creatorService.upload(accountId, file, (progress) => {
      patch(file.id, { progress: Math.min(progress * 0.96, 0.96), uploading: true });
    });
    patch(file.id, { uploadIntentId, progress: 0.97, uploading: true });
    // Start delivery processing as soon as the upload lands in R2. By the time
    // the artist finishes titles/credits and submits, compatible media is often
    // already processed. Submission creation calls the same enqueue RPC again,
    // which is idempotent and simply reuses this job.
    await creatorService.enqueueUploadProcessing(uploadIntentId, file.mediaType, mode);
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
