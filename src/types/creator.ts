export type SubmissionType = 'music_release' | 'learning_album' | 'learning_lesson_set' | 'artist_update' | 'cantor_update';
export type PublicationStatus = 'draft' | 'uploading' | 'ready_to_submit' | 'pending_review' | 'changes_requested' | 'approved' | 'processing' | 'published' | 'rejected' | 'archived';
export type ReleaseType = 'single' | 'ep' | 'album';
export type MediaKind = 'audio' | 'video' | 'image';
export interface CreatorAccount { id: string; display_name: string; status: string; role: string; }
export interface CreatorSubmission { id: string; creator_account_id: string; submission_type: SubmissionType; title: string; description: string | null; status: PublicationStatus; submitted_at: string | null; review_due_at: string | null; review_notes: string | null; published_at: string | null; updated_at: string; }
export interface CatalogOption { id: string; title: string; subtitle?: string | null; }
export type SubmissionItemRole = 'artwork' | 'track' | 'lesson' | 'other';
export type ProcessingJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
/** Shape returned by the get_creator_submission_items RPC. */
export interface SubmissionItem {
  id: string; title: string | null; role: SubmissionItemRole; sortOrder: number; required: boolean;
  mediaAssetId: string | null; uploadIntentId: string | null; mediaType: MediaKind | 'document' | 'other' | null;
  contentLength: number | null; uploadStatus: string | null;
  processingStatus: ProcessingJobStatus | null; processingJobType: string | null;
  processingAttemptCount: number | null; processingMaxAttempts: number | null;
  processingError: string | null; processingAvailableAt: string | null;
}
export interface UploadCandidate { id: string; name: string; uri: string; mimeType: string; size: number; mediaType: MediaKind; progress: number; uploadIntentId?: string; uploaded?: boolean; error?: string; }
export interface LocalizedMetadata { en: string; ar: string; cop: string; fr: string; }
export interface CreatorDraft {
  mode: 'music' | 'learning_album' | 'learning_lesson_set'; title: string; description: string; releaseType: ReleaseType;
  artistId: string; cantorId: string; seasonId: string; hymnId: string; localizedTitle: LocalizedMetadata; artwork?: UploadCandidate;
  media: UploadCandidate[];
}
