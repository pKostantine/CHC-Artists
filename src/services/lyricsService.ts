import type {
  EditableLyricLine,
  LocaleCode,
  LyricDraft,
  LyricEditorTrack,
  LyricSyncPrecision,
} from '@/types/lyrics';
import { supabase } from './supabase';

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('Supabase returned no data.');
  return data;
}

export async function listEditableTracks(): Promise<LyricEditorTrack[]> {
  const [music, learning] = await Promise.all([
    supabase.rpc('get_lyric_editor_tracks'),
    supabase.rpc('get_learning_lyric_editor_items'),
  ]);
  const musicTracks = unwrap<Array<Omit<LyricEditorTrack, 'targetType' | 'maxSyncPrecision'>>>(
    music.data as Array<Omit<LyricEditorTrack, 'targetType' | 'maxSyncPrecision'>> | null,
    music.error,
  ).map((track) => ({ ...track, targetType: 'music_track' as const, maxSyncPrecision: 'line' as const }));
  const learningItems = unwrap<LyricEditorTrack[]>(learning.data as LyricEditorTrack[] | null, learning.error);
  return [...musicTracks, ...learningItems];
}

function learningKind(track: LyricEditorTrack): 'album_recording' | 'lesson' {
  return track.targetType === 'learning_lesson' ? 'lesson' : 'album_recording';
}

export async function loadLyricDraft(
  track: LyricEditorTrack,
  locale: LocaleCode,
): Promise<LyricDraft | null> {
  const request = track.targetType === 'music_track'
    ? supabase.rpc('get_track_lyric_language_draft', { p_track_id: track.id, p_locale: locale })
    : supabase.rpc('get_learning_lyric_language_draft', {
        p_item_kind: learningKind(track), p_item_id: track.id, p_locale: locale,
      });
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data as LyricDraft | null;
}

export async function saveLyricDraft(input: {
  trackId: string;
  locale: LocaleCode;
  description: string | null;
  lines: EditableLyricLine[];
}): Promise<LyricDraft> {
  const { data, error } = await supabase.rpc('save_track_lyric_language_draft', {
    p_track_id: input.trackId,
    p_locale: input.locale,
    p_description: input.description,
    p_lines: input.lines.map((line) => ({
      startMs: line.startMs,
      endMs: line.endMs,
      text: line.text,
    })),
  });
  return unwrap<LyricDraft>(data as LyricDraft | null, error);
}


export async function saveLyricStudioDraft(input: {
  track: LyricEditorTrack;
  syncPrecision: Extract<LyricSyncPrecision, 'unsynced' | 'line'>;
  languages: Array<{
    locale: LocaleCode;
    description: string | null;
    lines: EditableLyricLine[];
  }>;
}): Promise<{ trackId: string; languages: LyricDraft[]; savedAt: string }> {
  const languages = input.languages.map((language) => ({
      locale: language.locale,
      description: language.description,
      lines: language.lines.map((line) => ({
        id: line.id ?? null,
        sequence: line.sequence,
        startMs: line.startMs,
        endMs: line.endMs,
        text: line.text,
      })),
    }));
  const request = input.track.targetType === 'music_track'
    ? supabase.rpc('save_track_lyric_studio_draft', { p_track_id: input.track.id, p_languages: languages })
    : supabase.rpc('save_learning_lyric_studio_draft', {
        p_item_kind: learningKind(input.track),
        p_item_id: input.track.id,
        p_sync_precision: input.syncPrecision,
        p_languages: languages,
      });
  const { data, error } = await request;

  return unwrap(
    data as { trackId: string; languages: LyricDraft[]; savedAt: string } | null,
    error,
  );
}


export async function publishLyricLanguages(
  track: LyricEditorTrack,
  locales: LocaleCode[],
  syncPrecision: Extract<LyricSyncPrecision, 'unsynced' | 'line'>,
): Promise<{ trackId: string; locales: LocaleCode[]; publishedAt: string }> {
  const request = track.targetType === 'music_track'
    ? supabase.rpc('publish_track_lyric_languages_v2', {
        p_track_id: track.id, p_locales: locales, p_sync_precision: syncPrecision,
      })
    : supabase.rpc('publish_learning_lyric_languages', {
        p_item_kind: learningKind(track), p_item_id: track.id,
        p_locales: locales, p_sync_precision: syncPrecision,
      });
  const { data, error } = await request;
  return unwrap(data as { trackId: string; locales: LocaleCode[]; publishedAt: string } | null, error);
}
