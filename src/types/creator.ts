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

export interface CreditArtist { id: string; displayName: string; isCreditOnly?: boolean }

export interface CreditOptions {
  /** The artist this account releases as. Every track defaults to it. */
  identityArtist: CreditArtist | null;
  creditableArtists: CreditArtist[];
}

export type TrackContributorRole = 'featured' | 'composer' | 'lyricist' | 'arranger' | 'producer' | 'artwork';

export interface TrackContributor {
  id: string;
  name: string;
  role: TrackContributorRole;
}

export interface ArtistSocialLink { platform: string; url: string }

export interface ArtistProfile {
  id: string;
  displayName: string;
  sortName: string | null;
  biography: string | null;
  publicationStatus: PublicationStatus;
  profileImage: { assetId: string; bucket: string; path: string } | null;
  /** Set while a newly uploaded picture is still being processed. */
  profileImagePending: string | null;
  socialLinks: ArtistSocialLink[];
  pinnedReleases: { id: string; title: string; releaseType: ReleaseType; publicationStatus: PublicationStatus }[];
  releases: { id: string; title: string; releaseType: ReleaseType; publicationStatus: PublicationStatus; displayDate: string | null }[];
}

export interface ReleaseTrack {
  id: string;
  trackNumber: number;
  discNumber: number;
  title: string;
  durationMs: number | null;
  publicationStatus: PublicationStatus;
  hasMedia: boolean;
  mainArtist: CreditArtist | null;
  featuredArtists: CreditArtist[];
}

export interface CreatorRelease {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  releaseType: ReleaseType;
  publicationStatus: PublicationStatus;
  scheduledReleaseAt: string | null;
  originalReleaseDate: string | null;
  displayDate: string | null;
  earliestReleaseAt: string;
  primaryArtist: CreditArtist | null;
  cover: { assetId: string; bucket: string; path: string } | null;
  localizations: { locale: string; title: string }[];
  tracks: ReleaseTrack[];
}

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
  /** Browser File/Blob retained so large web uploads do not need to be re-read into memory. */
  sourceFile?: any;
  mediaType: MediaKind;
  progress: number;
  uploading?: boolean;
  uploadIntentId?: string;
  uploaded?: boolean;
  error?: string;
  /** Track metadata is intentionally independent of the uploaded filename. */
  title?: string;
  localizedTitle?: LocalizedMetadata;
  /** Blank means the artist posting, which is the default. */
  mainArtistName?: string;
  contributors?: TrackContributor[];
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
  /** When this goes live on CHC. Must be at least 48 hours out. */
  scheduledReleaseAt: string;
  /** When it came out elsewhere, if it did. Wins over the CHC date on display. */
  originalReleaseDate: string;
}
