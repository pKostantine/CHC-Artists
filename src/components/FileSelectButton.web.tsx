import { useState, type ChangeEvent, type CSSProperties } from 'react';
import { COLORS, RADII, SPACING } from '@/constants/theme';
import type { FileSelectButtonProps } from './FileSelectButton';
import { droppedUploadCandidates } from '@/utils/uploads';

const ACCEPT: Record<FileSelectButtonProps['kind'], string> = {
  audio: 'audio/*,.mp3,.m4a,.wav,.flac,.aac,.ogg,.webm',
  video: 'video/*,.mp4,.mov,.m4v,.webm',
  image: 'image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif',
  lesson: 'audio/*,video/*,.mp3,.m4a,.wav,.flac,.aac,.ogg,.webm,.mp4,.mov,.m4v',
};

function isIOSFilesPicker(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** A real, touchable HTML file input, not a synthetic click on a hidden input.
 * Safari and iOS standalone PWAs can reject scripted/hidden picker opens.
 */
export function FileSelectButton({
  label, kind, multiple = false, busy = false, disabled = false, onFiles, onError,
}: FileSelectButtonProps) {
  const [focused, setFocused] = useState(false);
  const [localError, setLocalError] = useState('');
  const off = disabled || busy;

  function selected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = ''; // Permit choosing the same file on retry.
    if (!files.length) return;
    const picked = droppedUploadCandidates(files, kind);
    if (picked.length) {
      setLocalError('');
      onFiles(multiple ? picked : picked.slice(0, 1));
    }
    if (picked.length < files.length) {
      const message = picked.length
        ? 'Some selected files were not supported and were skipped.'
        : 'No supported files were selected. Choose the correct audio, video, or image format.';
      setLocalError(message);
      onError?.(message);
    }
  }

  const button: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: `${SPACING.sm + 2}px ${SPACING.md}px`,
    borderRadius: RADII.sm,
    border: `1px solid ${focused ? COLORS.gold : COLORS.border}`,
    background: COLORS.surfaceSoft,
    color: COLORS.goldBright,
    fontWeight: 800,
    fontSize: 14,
    cursor: off ? 'not-allowed' : 'pointer',
    opacity: off ? 0.48 : 1,
    userSelect: 'none',
    overflow: 'hidden',
    whiteSpace: 'normal',
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: SPACING.xs, maxWidth: '100%' }}>
      <label style={button}>
        <span aria-hidden="true">{busy ? 'Uploading…' : label}</span>
        <input
          type="file"
          aria-label={label}
          accept={isIOSFilesPicker() ? undefined : ACCEPT[kind]}
          multiple={multiple}
          disabled={off}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={selected}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            opacity: 0,
            fontSize: 16,
            cursor: off ? 'not-allowed' : 'pointer',
            zIndex: 1,
          }}
        />
      </label>
      {!!localError && <span role="alert" style={{ color: COLORS.danger, fontSize: 12 }}>{localError}</span>}
    </div>
  );
}
