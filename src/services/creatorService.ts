import { supabase } from '@/services/supabase';
import type {
  CatalogOption,
  CatalogOptions,
  CreatorAccount,
  CreatorDashboardData,
  CreatorDraft,
  ArtistProfile,
  ArtistSocialLink,
  CreatorRelease,
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

  createCantor(accountId: string, displayName: string): Promise<CatalogOption> {
    return rpc<CatalogOption>('create_creator_cantor', { p_creator_account_id: accountId, p_display_name: displayName });
  },

  items(submissionId: string): Promise<SubmissionItem[]> {
    return rpc<SubmissionItem[]>('get_creator_submission_items', { p_submission_id: submissionId });
  },

  /** Creates the submission, its catalog record, and its items, then submits it — all in one transaction. */
  createSubmission(accountId: string, draft: CreatorDraft): Promise<{ submissionId: string; status: string }> {
    const isMusic = draft.mode === 'music';
    const items = [
      ...(draft.artwork ? [{ uploadIntentId: draft.artwork.uploadIntentId, title: draft.artwork.name, role: 'artwork' }] : []),
      ...draft.media.map((file) => ({
        uploadIntentId: file.uploadIntentId,
        title: isMusic ? file.title?.trim() : file.name,
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
      p_title: draft.title,
      p_description: draft.description || null,
      p_release_type: isMusic ? draft.releaseType : null,
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

  release(releaseId: string): Promise<CreatorRelease> {
    return rpc<CreatorRelease>('get_creator_release', { p_release_id: releaseId });
  },

  updateRelease(releaseId: string, patch: {
    title?: string | null;
    description?: string | null;
    scheduledReleaseAt?: string | null;
    originalReleaseDate?: string | null;
    clearOriginalReleaseDate?: boolean;
    localizedTitles?: Record<string, string> | null;
    tracks?: {
      id?: string;
      uploadIntentId?: string;
      title?: string;
      mainArtistId?: string | null;
      featuredArtistIds?: string[];
    }[] | null;
    coverUploadIntentId?: string | null;
  }): Promise<CreatorRelease> {
    return rpc<CreatorRelease>('update_creator_release', {
      p_release_id: releaseId,
      p_title: patch.title ?? null,
      p_description: patch.description ?? null,
      p_scheduled_release_at: patch.scheduledReleaseAt ? toIsoOrNull(patch.scheduledReleaseAt) : null,
      p_original_release_date: nullIfBlank(patch.originalReleaseDate ?? ''),
      p_clear_original_release_date: Boolean(patch.clearOriginalReleaseDate),
      p_localized_titles: patch.localizedTitles ?? null,
      p_tracks: patch.tracks ?? null,
      p_cover_upload_intent_id: patch.coverUploadIntentId ?? null,
    });
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

    // Read the actual picked file first. Browser/mobile pickers can report a zero
    // or rounded size, while the backend intentionally requires an exact byte count.
    const source = await fetch(file.uri);
    if (!source.ok) throw new Error(`Could not read ${file.name} (${source.status}).`);
    const blob = await source.blob();
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

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${UPLOAD_BASE}/uploads/${id}`);
      xhr.setRequestHeader('Authorization', `Bearer ${access}`);
      xhr.setRequestHeader('Content-Type', contentType);
      if (xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(0.12 + (event.loaded / event.total) * 0.86);
        };
      }
      xhr.onerror = () => reject(new Error(`Network error while uploading ${file.name}.`));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        const detail = xhr.responseText?.trim();
        reject(new Error(`Upload failed (${xhr.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`));
      };
      xhr.send(blob);
    });

    onProgress(1);
    return id;
  },

  describeError,
};
