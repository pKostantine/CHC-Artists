export type SubmissionType = 'music_release' | 'learning_album' | 'learning_lesson_set' | 'artist_update' | 'cantor_update';
export type PublicationStatus = 'draft' | 'uploading' | 'ready_to_submit' | 'pending_review' | 'changes_requested' | 'approved' | 'processing' | 'published' | 'rejected' | 'archived';
export type ReleaseType = 'single' | 'ep' | 'album';
export type MediaKind = 'audio' | 'video' | 'image';
export type SubmissionMode = 'music' | 'learning_album' | 'learning_lesson_set';

export interface CreatorAccount { id: string; displayName: string; status: string; role: string; }

export interface CreatorSubmission {
  id: string;
  submissionType: SubmissionType;
  title: string;
  description: string | null;
  status: PublicationStatus;
  submittedAt: string | null;
  reviewDueAt: string | null;
  reviewNotes: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

export interface CatalogOption { id: string; title: string; subtitle?: string | null; }

export interface CreatorDashboardData {
  submissions: CreatorSubmission[];
  artists: CatalogOption[];
  cantors: CatalogOption[];
}

export interface CatalogOptions { seasons: CatalogOption[]; hymns: CatalogOption[]; }

export type SubmissionItemRole = 'artwork' | 'track' | 'lesson' | 'other';
export type ProcessingJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface SubmissionItem {
  id: string;
  title: string | null;
  role: SubmissionItemRole;
  sortOrder: number;
  required: boolean;
  mediaAssetId: string | null;
  uploadIntentId: string | null;
  mediaType: MediaKind | null;
  contentLength: number | null;
  uploadStatus: string | null;
  processingStatus: ProcessingJobStatus | null;
  processingJobType: string | null;
  processingAttemptCount: number | null;
  processingMaxAttempts: number | null;
  processingError: string | null;
  processingAvailableAt: string | null;
}

export interface UploadCandidate {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  mediaType: MediaKind;
  progress: number;
  uploading?: boolean;
  uploadIntentId?: string;
  uploaded?: boolean;
  error?: string;
}

export interface LocalizedMetadata { en: string; ar: string; cop: string; fr: string; }

export interface CreatorDraft {
  mode: SubmissionMode;
  title: string;
  description: string;
  releaseType: ReleaseType;
  artistId: string;
  cantorId: string;
  seasonId: string;
  hymnId: string;
  localizedTitle: LocalizedMetadata;
  artwork?: UploadCandidate;
  media: UploadCandidate[];
}
