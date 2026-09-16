import type {
  EditableLyricLine,
  LocaleCode,
  LyricDraft,
  LyricEditorTrack,
  LyricKind,
  LyricSyncPrecision,
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
  kind: LyricKind,
): Promise<LyricDraft | null> {
  const { data, error } = await supabase.rpc('get_track_lyric_draft', {
    p_track_id: trackId,
    p_locale: locale,
    p_kind: kind,
  });
  if (error) throw new Error(error.message);
  return data as LyricDraft | null;
}

export async function saveLyricDraft(input: {
  trackId: string;
  locale: LocaleCode;
  kind: LyricKind;
  syncPrecision: LyricSyncPrecision;
  title: string | null;
  source: string | null;
  lines: EditableLyricLine[];
}): Promise<LyricDraft> {
  const { data, error } = await supabase.rpc('save_track_lyric_draft', {
    p_track_id: input.trackId,
    p_locale: input.locale,
    p_kind: input.kind,
    p_sync_precision: input.syncPrecision,
    p_title: input.title,
    p_source: input.source,
    p_lines: input.lines.map((line) => ({
      startMs: line.startMs,
      endMs: line.endMs,
      text: line.text,
    })),
  });
  return unwrap<LyricDraft>(data as LyricDraft | null, error);
}
