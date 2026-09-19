import type {
  EditableLyricLine,
  LocaleCode,
  LyricDraft,
  LyricEditorTrack,
} from '@/types/lyrics';
import { supabase } from './supabase';

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('Supabase returned no data.');
  return data;
}

export async function listEditableTracks(): Promise<LyricEditorTrack[]> {
  const { data, error } = await supabase.rpc('get_lyric_editor_tracks');
  return unwrap<LyricEditorTrack[]>(data as LyricEditorTrack[] | null, error);
}

export async function loadLyricDraft(
  trackId: string,
  locale: LocaleCode,
): Promise<LyricDraft | null> {
  const { data, error } = await supabase.rpc('get_track_lyric_language_draft', {
    p_track_id: trackId,
    p_locale: locale,
  });
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


export async function publishLyricLanguages(
  trackId: string,
  locales: LocaleCode[],
): Promise<{ trackId: string; locales: LocaleCode[]; publishedAt: string }> {
  const { data, error } = await supabase.rpc('publish_track_lyric_languages', {
    p_track_id: trackId,
    p_locales: locales,
  });
  return unwrap(data as { trackId: string; locales: LocaleCode[]; publishedAt: string } | null, error);
}
