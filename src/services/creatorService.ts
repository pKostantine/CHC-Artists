import { Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';
import { supabase } from '@/services/supabase';
import { preferredLocalizedTitle, releaseTypeForTrackCount } from '@/utils/titles';
import type {
  CatalogOption,
  CatalogOptions,
  CreatorAccount,
  CreatorDashboardData,
  CreatorDraft,
  ArtistProfile,
  ArtistSocialLink,
  CreatorRelease,
  CreatorReleaseSummary,
  CreditOptions,
  SubmissionItem,
  SubmissionItemRole,
  UploadCandidate,
} from '@/types/creator';

const UPLOAD_BASE = process.env.EXPO_PUBLIC_CHC_UPLOAD_URL || 'https://chc-upload-authorizer.hrmpdd8d6c.workers.dev';

function nullIfBlank(value: string | null | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

/**
 * Accepts what the date fields actually contain — "2026-10-01" or
 * "2026-10-01 18:30" — and hands the database a real timestamp. Anything it
 * cannot read becomes null rather than an invalid date.
 */
function toIsoOrNull(value: string | null | undefined): string | null {
  const trimmed = nullIfBlank(value);
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00` : trimmed.replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const MIME_BY_EXTENSION: Record<string, string> = {
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('Your session expired. Sign in again.');
  return data.session.access_token;
}

/** PostgREST errors are plain objects, not Error instances. */
function describeError(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  if (/submission_items_upload_intent_id_unique/.test(raw)) {
    return 'One of these files is already part of another submission. Remove it and upload it again.';
  }
  if (/Failed to fetch|Network request failed/i.test(raw)) {
    return 'Could not reach CHC. Check your connection and try again.';
  }
  return raw;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(describeError(error));
  return data as T;
}

function validMediaType(value?: string | null): value is string {
  return Boolean(value && /^(audio|video|image)\/[a-z0-9.+-]+$/i.test(value));
}

function contentTypeFor(file: UploadCandidate, blob: Blob): string {
  if (validMediaType(blob.type)) return blob.type.toLowerCase();
  if (validMediaType(file.mimeType)) return file.mimeType.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const fallback = MIME_BY_EXTENSION[extension];
  if (fallback) return fallback;
  throw new Error(`Could not determine a supported media type for ${file.name}.`);
}

const MULTIPART_THRESHOLD_BYTES = 48 * 1024 * 1024;
const LEGACY_SAFE_SINGLE_PUT_BYTES = 99_000_000;

interface MultipartPart {
  partNumber: number;
  etag: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function putBlob(
  url: string,
  access: string,
  blob: Blob,
  contentType: string,
  onProgress?: (loaded: number) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Authorization', `Bearer ${access}`);
    xhr.setRequestHeader('Content-Type', contentType);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded);
      };
    }

    xhr.onerror = () => reject(Object.assign(
      new Error('Network error while uploading.'),
      { status: 0 },
    ));

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText || '');
        return;
      }

      const detail = xhr.responseText?.trim();
      reject(Object.assign(
        new Error(`Upload failed (${xhr.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`),
        { status: xhr.status },
      ));
    };

    xhr.send(blob);
  });
}

async function uploadMultipart(
  uploadIntentId: string,
  access: string,
  blob: Blob,
  onProgress: (value: number) => void,
): Promise<void> {
  const create = await fetch(`${UPLOAD_BASE}/uploads/${uploadIntentId}/multipart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!create.ok) {
    if (create.status === 404 || create.status === 405) {
      throw Object.assign(new Error('CHC multipart upload service is not available yet.'), { code: 'multipart_unavailable' });
    }
    throw await responseFailure(create, 'Could not start multipart upload');
  }

  const setup = await create.json() as {
    uploadId?: string;
    partSize?: number;
    maxParallel?: number;
  };
  if (!setup.uploadId) throw new Error('Multipart upload did not return an upload ID.');

  const uploadId = setup.uploadId;
  const partSize = Math.max(5 * 1024 * 1024, Number(setup.partSize) || 32 * 1024 * 1024);
  const partCount = Math.ceil(blob.size / partSize);
  const parallel = Math.max(1, Math.min(6, Number(setup.maxParallel) || 4));
  const loadedByPart = Array.from({ length: partCount }, () => 0);
  const completedParts: MultipartPart[] = Array.from({ length: partCount });

  function reportPartProgress(index: number, loaded: number) {
    loadedByPart[index] = Math.max(loadedByPart[index], Math.min(loaded, partSize));
    const uploaded = loadedByPart.reduce((sum, value) => sum + value, 0);
    onProgress(0.12 + Math.min(1, uploaded / blob.size) * 0.82);
  }

  async function uploadOne(index: number): Promise<void> {
    const start = index * partSize;
    const end = Math.min(blob.size, start + partSize);
    const chunk = blob.slice(start, end);
    const partNumber = index + 1;
    const endpoint = `${UPLOAD_BASE}/uploads/${uploadIntentId}/multipart/${encodeURIComponent(uploadId)}/parts/${partNumber}`;

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const responseText = await putBlob(
          endpoint,
          access,
          chunk,
          'application/octet-stream',
          (loaded) => reportPartProgress(index, loaded),
        );
        const body = JSON.parse(responseText || '{}') as MultipartPart;
        if (!body.etag || body.partNumber !== partNumber) {
          throw new Error(`CHC returned an invalid response for part ${partNumber}.`);
        }
        loadedByPart[index] = chunk.size;
        completedParts[index] = body;
        reportPartProgress(index, chunk.size);
        return;
      } catch (error) {
        lastError = error;
        const status = typeof error === 'object' && error && 'status' in error
          ? Number((error as { status?: number }).status)
          : 0;
        const retryable = status === 0 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
        if (!retryable || attempt === 3) break;
        await sleep(400 * 2 ** attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Part ${partNumber} failed to upload.`);
  }

  let nextPart = 0;
  async function worker() {
    while (true) {
      const index = nextPart;
      nextPart += 1;
      if (index >= partCount) return;
      await uploadOne(index);
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(parallel, partCount) }, () => worker()));
    onProgress(0.96);

    const complete = await fetch(
      `${UPLOAD_BASE}/uploads/${uploadIntentId}/multipart/${encodeURIComponent(uploadId)}/complete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ parts: completedParts }),
      },
    );
    if (!complete.ok) throw await responseFailure(complete, 'Could not finish multipart upload');
    onProgress(1);
  } catch (error) {
    await fetch(
      `${UPLOAD_BASE}/uploads/${uploadIntentId}/multipart/${encodeURIComponent(uploadId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${access}` },
      },
    ).catch(() => undefined);
    throw error;
  }
}

/** The upload worker answers with {"error": code, "message": text}. */
async function responseFailure(response: Response, label: string): Promise<Error> {
  let detail = '';
  try {
    const text = (await response.text()).trim();
    try {
      const body = JSON.parse(text) as { message?: string; error?: string };
      detail = body.message || body.error || text;
    } catch {
      detail = text;
    }
  } catch {
    // The HTTP status still gives a useful error if the response has no body.
  }
  return new Error(`${label} (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
}

export const creatorService = {
  async ensureWorkspace(): Promise<void> {
    await rpc('ensure_creator_workspace', { p_display_name: null });
  },

  accounts(): Promise<CreatorAccount[]> {
    return rpc<CreatorAccount[]>('get_creator_workspaces');
  },

  dashboard(accountId: string): Promise<CreatorDashboardData> {
    return rpc<CreatorDashboardData>('get_creator_dashboard', { p_creator_account_id: accountId });
  },

  catalogOptions(): Promise<CatalogOptions> {
    return rpc<CatalogOptions>('get_creator_catalog_options');
  },

  createArtist(accountId: string, displayName: string): Promise<CatalogOption> {
    return rpc<CatalogOption>('create_creator_artist', { p_creator_account_id: accountId, p_display_name: displayName });
  },

  createCantor(accountId: string, displayName: string, contributorType: 'cantor' | 'chorus' = 'cantor'): Promise<CatalogOption> {
    return rpc<CatalogOption>('create_creator_cantor', {
      p_creator_account_id: accountId,
      p_display_name: displayName,
      p_contributor_type: contributorType,
    });
  },

  items(submissionId: string): Promise<SubmissionItem[]> {
    return rpc<SubmissionItem[]>('get_creator_submission_items', { p_submission_id: submissionId });
  },

  /** Creates the submission, its catalog record, and its items, then submits it — all in one transaction. */
  createSubmission(accountId: string, draft: CreatorDraft): Promise<{ submissionId: string; status: string }> {
    const isMusic = draft.mode === 'music';
    const releaseTitle = preferredLocalizedTitle(draft.localizedTitle) || draft.title.trim();
    const inferredReleaseType = releaseTypeForTrackCount(draft.media.length);
    const items = [
      ...(draft.artwork ? [{ uploadIntentId: draft.artwork.uploadIntentId, title: draft.artwork.name, role: 'artwork' }] : []),
      ...draft.media.map((file) => ({
        uploadIntentId: file.uploadIntentId,
        title: isMusic ? preferredLocalizedTitle(file.localizedTitle) : file.name,
        role: 'media',
        localizedTitles: isMusic ? (file.localizedTitle ?? {}) : {},
        // Names are resolved to reusable catalogue artists by the backend.
        mainArtistName: isMusic ? (file.mainArtistName?.trim() || null) : null,
        contributors: isMusic
          ? (file.contributors ?? []).map((credit) => ({ name: credit.name.trim(), role: credit.role }))
          : [],
      })),
    ];
    return rpc('create_creator_submission_v2', {
      p_creator_account_id: accountId,
      p_mode: draft.mode,
      p_title: releaseTitle,
      p_description: draft.description || null,
      p_release_type: isMusic ? inferredReleaseType : null,
      p_music_type: isMusic ? draft.musicType.trim() || null : null,
      p_recording_type: isMusic ? draft.recordingType.trim() || null : null,
      p_artist_id: isMusic ? draft.artistId || null : null,
      p_cantor_id: isMusic ? null : draft.cantorId || null,
      p_season_id: isMusic ? null : draft.seasonId || null,
      p_hymn_id: draft.mode === 'learning_lesson_set' ? draft.hymnId || null : null,
      p_localized_titles: draft.localizedTitle,
      p_items: items,
      p_scheduled_release_at: isMusic ? toIsoOrNull(draft.scheduledReleaseAt) : null,
      p_original_release_date: isMusic ? nullIfBlank(draft.originalReleaseDate) : null,
    });
  },

  async enqueueUploadProcessing(uploadIntentId: string, mediaType: UploadCandidate['mediaType'], mode: CreatorDraft['mode']): Promise<void> {
    const jobType = mediaType === 'image'
      ? 'image_delivery'
      : mediaType === 'video'
        ? 'video_delivery'
        : 'audio_delivery';
    const outputBucket = mediaType === 'image'
      ? 'chc-images'
      : mediaType === 'video'
        ? 'chc-learning'
        : mode === 'music'
          ? 'chc-music'
          : 'chc-learning';

    await rpc('enqueue_media_processing_job', {
      p_upload_intent_id: uploadIntentId,
      p_job_type: jobType,
      p_output_bucket: outputBucket,
    });
  },

  creditOptions(accountId: string): Promise<CreditOptions> {
    return rpc<CreditOptions>('get_creator_credit_options', { p_creator_account_id: accountId });
  },

  artistProfile(accountId: string): Promise<ArtistProfile> {
    return rpc<ArtistProfile>('get_creator_artist_profile', { p_creator_account_id: accountId });
  },

  updateArtistProfile(accountId: string, patch: {
    displayName?: string | null;
    sortName?: string | null;
    biography?: string | null;
    socialLinks?: ArtistSocialLink[] | null;
    pinnedReleaseIds?: string[] | null;
    profileImageUploadIntentId?: string | null;
  }): Promise<ArtistProfile> {
    return rpc<ArtistProfile>('update_creator_artist_profile', {
      p_creator_account_id: accountId,
      p_display_name: patch.displayName ?? null,
      p_sort_name: patch.sortName ?? null,
      p_biography: patch.biography ?? null,
      p_social_links: patch.socialLinks ?? null,
      p_pinned_release_ids: patch.pinnedReleaseIds ?? null,
      p_profile_image_upload_intent_id: patch.profileImageUploadIntentId ?? null,
    });
  },

  releases(accountId: string): Promise<CreatorReleaseSummary[]> {
    return rpc<CreatorReleaseSummary[]>('get_creator_releases', { p_creator_account_id: accountId });
  },

  release(releaseId: string): Promise<CreatorRelease> {
    return rpc<CreatorRelease>('get_creator_release', { p_release_id: releaseId });
  },

  deleteReleaseTrack(releaseId: string, trackId: string): Promise<{
    releaseId: string;
    trackId: string;
    trackDeleted: boolean;
    remainingTrackCount: number;
    releaseType: 'single' | 'ep' | 'album';
  }> {
    return rpc('delete_creator_music_release_track', {
      p_release_id: releaseId,
      p_track_id: trackId,
    });
  },

  deleteRelease(releaseId: string): Promise<{
    releaseId: string;
    deleted: boolean;
    deletedTrackCount: number;
  }> {
    return rpc('delete_creator_music_release', {
      p_release_id: releaseId,
    });
  },

  async updateRelease(releaseId: string, patch: {
    title?: string | null;
    description?: string | null;
    scheduledReleaseAt?: string | null;
    originalReleaseDate?: string | null;
    clearOriginalReleaseDate?: boolean;
    localizedTitles?: Record<string, string> | null;
    musicType?: string | null;
    recordingType?: string | null;
    tracks?: {
      id?: string;
      uploadIntentId?: string;
      title?: string;
      mainArtistId?: string | null;
      featuredArtistIds?: string[];
    }[] | null;
    coverUploadIntentId?: string | null;
  }): Promise<CreatorRelease> {
    await rpc<CreatorRelease>('update_creator_release', {
      p_release_id: releaseId,
      p_title: patch.title ?? null,
      p_description: patch.description ?? null,
      p_scheduled_release_at: patch.scheduledReleaseAt ? toIsoOrNull(patch.scheduledReleaseAt) : null,
      p_original_release_date: nullIfBlank(patch.originalReleaseDate ?? ''),
      p_clear_original_release_date: Boolean(patch.clearOriginalReleaseDate),
      // The dedicated metadata RPC below owns the editable title-language set,
      // including removing a title that the artist cleared.
      p_localized_titles: null,
      p_tracks: patch.tracks ?? null,
      p_cover_upload_intent_id: patch.coverUploadIntentId ?? null,
    });

    if (patch.localizedTitles !== undefined || patch.musicType !== undefined || patch.recordingType !== undefined) {
      await rpc<void>('update_creator_release_metadata', {
        p_release_id: releaseId,
        p_music_type: patch.musicType ?? null,
        p_recording_type: patch.recordingType ?? null,
        p_localized_titles: patch.localizedTitles ?? null,
      });
    }

    return rpc<CreatorRelease>('get_creator_release', { p_release_id: releaseId });
  },

  async attachUpload(submissionId: string, uploadIntentId: string, title: string, order: number, role: SubmissionItemRole | null = null): Promise<void> {
    await rpc('add_media_submission_item', {
      p_submission_id: submissionId,
      p_upload_intent_id: uploadIntentId,
      p_media_asset_id: null,
      p_title: title,
      p_sort_order: order,
      p_required: true,
      // Null lets the database infer it: an image is artwork, anything else
      // follows the submission type.
      p_role: role,
    });
  },

  async submit(id: string): Promise<void> {
    await rpc('submit_media_submission', { p_submission_id: id });
  },

  async upload(accountId: string, file: UploadCandidate, onProgress: (value: number) => void): Promise<string> {
    const access = await token();
    onProgress(0.02);

    // Web drag/drop and DocumentPicker give us a real File object. Keep it as a
    // Blob so large files can be sliced into multipart chunks without first
    // copying the whole thing into JS memory. Native file URIs fall back to
    // reading a Blob from the local picker URI.
    let blob: Blob;
    if (file.sourceFile && typeof file.sourceFile.slice === 'function' && Number(file.sourceFile.size) > 0) {
      blob = file.sourceFile as Blob;
    } else if (Platform.OS !== 'web') {
      const nativeFile = new ExpoFile(file.uri);
      if (!nativeFile.exists || !nativeFile.size) throw new Error(`${file.name} is empty or could not be read.`);
      // Expo File implements Blob, so multipart slice() reads only the requested
      // range instead of materializing a multi-hundred-megabyte file in JS.
      blob = nativeFile as unknown as Blob;
    } else {
      const source = await fetch(file.uri);
      if (!source.ok) throw new Error(`Could not read ${file.name} (${source.status}).`);
      blob = await source.blob();
    }

    if (!blob.size) throw new Error(`${file.name} is empty or could not be read.`);
    const contentType = contentTypeFor(file, blob);
    onProgress(0.06);

    const authorize = await fetch(`${UPLOAD_BASE}/uploads/authorize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creatorAccountId: accountId,
        originalFilename: file.name,
        contentType,
        contentLength: blob.size,
        mediaType: file.mediaType,
      }),
    });
    if (!authorize.ok) throw await responseFailure(authorize, 'Upload authorization failed');

    const intent = await authorize.json() as { uploadIntentId?: string; upload_intent_id?: string };
    const id = intent.uploadIntentId || intent.upload_intent_id;
    if (!id) throw new Error('Upload authorization did not return an upload ID.');
    onProgress(0.12);

    if (blob.size >= MULTIPART_THRESHOLD_BYTES) {
      try {
        await uploadMultipart(id, access, blob, onProgress);
      } catch (error) {
        const multipartUnavailable = typeof error === 'object' && error && 'code' in error
          && (error as { code?: string }).code === 'multipart_unavailable';
        if (!multipartUnavailable || blob.size > LEGACY_SAFE_SINGLE_PUT_BYTES) throw error;

        // Safe rollout fallback while the upload Worker deployment catches up.
        await putBlob(
          `${UPLOAD_BASE}/uploads/${id}`,
          access,
          blob,
          contentType,
          (loaded) => onProgress(0.12 + Math.min(1, loaded / blob.size) * 0.86),
        );
        onProgress(1);
      }
    } else {
      await putBlob(
        `${UPLOAD_BASE}/uploads/${id}`,
        access,
        blob,
        contentType,
        (loaded) => onProgress(0.12 + Math.min(1, loaded / blob.size) * 0.86),
      );
      onProgress(1);
    }

    return id;
  },

  describeError,
};
