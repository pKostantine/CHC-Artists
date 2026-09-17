import { supabase } from '@/services/supabase';
import type { CatalogOption, CreatorAccount, CreatorSubmission, SubmissionItem, SubmissionType, UploadCandidate } from '@/types/creator';

const UPLOAD_BASE = process.env.EXPO_PUBLIC_CHC_UPLOAD_URL || 'https://chc-upload-authorizer.hrmpdd8d6c.workers.dev';

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

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

async function responseFailure(response: Response, label: string): Promise<Error> {
  let detail = '';
  try {
    detail = (await response.text()).trim();
  } catch {
    // The HTTP status still gives us a useful error if the response has no text body.
  }
  return new Error(`${label} (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
}

export const creatorService = {
  async ensureWorkspace(displayName?: string): Promise<void> {
    const { error } = await supabase.rpc('ensure_creator_workspace', {
      p_display_name: displayName?.trim() || null,
    });
    if (error) throw error;
  },

  async accounts(): Promise<CreatorAccount[]> {
    const { data: session } = await supabase.auth.getUser();
    if (!session.user) return [];
    const { data, error } = await supabase
      .schema('creator')
      .from('creator_account_members')
      .select('role, creator_accounts!inner(id, display_name, status)')
      .eq('user_id', session.user.id);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.creator_accounts.id,
      display_name: row.creator_accounts.display_name,
      status: row.creator_accounts.status,
      role: row.role,
    }));
  },

  async submissions(accountId: string): Promise<CreatorSubmission[]> {
    const { data, error } = await supabase
      .schema('media')
      .from('submissions')
      .select('id,creator_account_id,submission_type,title,description,status,submitted_at,review_due_at,review_notes,published_at,updated_at')
      .eq('creator_account_id', accountId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CreatorSubmission[];
  },

  async artists(accountId: string): Promise<CatalogOption[]> {
    const { data, error } = await supabase
      .schema('music')
      .from('artists')
      .select('id,display_name,publication_status')
      .eq('owner_creator_account_id', accountId)
      .order('display_name');
    if (error) throw error;
    return (data ?? []).map((x: any) => ({ id: x.id, title: x.display_name, subtitle: x.publication_status }));
  },

  async cantors(accountId: string): Promise<CatalogOption[]> {
    const { data, error } = await supabase
      .schema('learning')
      .from('cantors')
      .select('id,display_name,publication_status')
      .eq('owner_creator_account_id', accountId)
      .order('display_name');
    if (error) throw error;
    return (data ?? []).map((x: any) => ({ id: x.id, title: x.display_name, subtitle: x.publication_status }));
  },

  async seasons(): Promise<CatalogOption[]> {
    const { data, error } = await supabase.schema('learning').from('seasons').select('id,title,slug').order('sort_order');
    if (error) throw error;
    return (data ?? []).map((x: any) => ({ id: x.id, title: x.title, subtitle: x.slug }));
  },

  async hymns(): Promise<CatalogOption[]> {
    const { data, error } = await supabase.schema('learning').from('hymns').select('id,title,subtitle').order('title');
    if (error) throw error;
    return (data ?? []).map((x: any) => ({ id: x.id, title: x.title, subtitle: x.subtitle }));
  },

  async createArtist(accountId: string, displayName: string): Promise<CatalogOption> {
    const { data, error } = await supabase
      .schema('music')
      .from('artists')
      .insert({ owner_creator_account_id: accountId, display_name: displayName.trim() })
      .select('id,display_name')
      .single();
    if (error) throw error;
    return { id: data.id, title: data.display_name };
  },

  async createCantor(accountId: string, displayName: string): Promise<CatalogOption> {
    const { data, error } = await supabase
      .schema('learning')
      .from('cantors')
      .insert({ owner_creator_account_id: accountId, display_name: displayName.trim() })
      .select('id,display_name')
      .single();
    if (error) throw error;
    return { id: data.id, title: data.display_name };
  },

  async createSubmission(accountId: string, type: SubmissionType, title: string, description?: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_media_submission', {
      p_creator_account_id: accountId,
      p_submission_type: type,
      p_title: title,
      p_description: description || null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.submission_id) throw new Error('Submission was not created.');
    return row.submission_id;
  },

  async submit(id: string): Promise<void> {
    const { error } = await supabase.rpc('submit_media_submission', { p_submission_id: id });
    if (error) throw error;
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

  async attachUpload(submissionId: string, uploadIntentId: string, title: string, order: number): Promise<void> {
    const { error } = await supabase.rpc('add_media_submission_item', {
      p_submission_id: submissionId,
      p_upload_intent_id: uploadIntentId,
      p_media_asset_id: null,
      p_title: title,
      p_sort_order: order,
      p_required: true,
    });
    if (error) throw error;
  },

  async createRelease(accountId: string, artistId: string, releaseType: string, title: string, description: string, localized: Record<string, string>): Promise<string> {
    const { data, error } = await supabase
      .schema('music')
      .from('releases')
      .insert({ owner_creator_account_id: accountId, primary_artist_id: artistId || null, release_type: releaseType, title, description: description || null })
      .select('id')
      .single();
    if (error) throw error;
    for (const [locale, value] of Object.entries(localized)) {
      if (!value.trim()) continue;
      const { error: localError } = await supabase
        .schema('music')
        .from('release_localizations')
        .upsert({ release_id: data.id, locale, title: value.trim(), is_primary: locale === 'en' });
      if (localError) throw localError;
    }
    return data.id;
  },

  async createLearningShell(kind: 'album' | 'lesson_set', accountId: string, cantorId: string, seasonId: string, hymnId: string, title: string, description: string, submissionId: string, localized: Record<string, string> = {}): Promise<string> {
    const table = kind === 'album' ? 'albums' : 'lesson_sets';
    const payload: any = {
      owner_creator_account_id: accountId,
      cantor_id: cantorId,
      season_id: seasonId || null,
      title,
      description: description || null,
      submission_id: submissionId,
    };
    if (kind === 'lesson_set') payload.hymn_id = hymnId;
    const { data, error } = await supabase.schema('learning').from(table).insert(payload).select('id').single();
    if (error) throw error;

    const localizationTable = kind === 'album' ? 'album_localizations' : 'lesson_set_localizations';
    const parentColumn = kind === 'album' ? 'album_id' : 'lesson_set_id';
    for (const [locale, value] of Object.entries(localized)) {
      if (!value.trim()) continue;
      const { error: localError } = await supabase
        .schema('learning')
        .from(localizationTable)
        .upsert({ [parentColumn]: data.id, locale, title: value.trim() }, { onConflict: `${parentColumn},locale` });
      if (localError) throw localError;
    }
    return data.id;
  },

  async items(submissionId: string): Promise<SubmissionItem[]> {
    const { data, error } = await supabase
      .schema('media')
      .from('submission_items')
      .select('id,title,sort_order,required,media_asset_id,upload_intent_id')
      .eq('submission_id', submissionId)
      .order('sort_order');
    if (error) throw error;
    return (data ?? []) as SubmissionItem[];
  },

  describeError: message,
};
