import { useState, type ChangeEvent, type DragEvent } from 'react';
import { COLORS, RADII, SPACING } from '@/constants/theme';

const ACCEPT: Record<'audio' | 'lesson', string> = {
  audio: 'audio/*,.mp3,.m4a,.wav,.flac,.aac,.ogg,.webm',
  lesson: 'audio/*,video/*,.mp3,.m4a,.wav,.flac,.aac,.ogg,.webm,.mp4,.mov,.m4v',
};

function isIOSFilesPicker() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Directly touchable file input covers the dropzone. Safari PWA must receive a
 * native input tap instead of a scripted click on a hidden input.
 * Desktop drag-and-drop uses the same onFiles path.
 */
export function FileDropZone({
  kind,
  onFiles,
}: {
  kind: 'audio' | 'lesson';
  onFiles: (files: File[]) => void;
}) {
  const [active, setActive] = useState(false);

  function receive(files: FileList | null) {
    if (files?.length) onFiles(Array.from(files));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setActive(false);
    receive(event.dataTransfer.files);
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    receive(event.currentTarget.files);
    event.currentTarget.value = '';
  }

  return (
    <div
      onDrop={onDrop}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        setActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActive(false);
      }}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: SPACING.sm,
        padding: SPACING.lg,
        borderRadius: RADII.md,
        border: `2px dashed ${active ? COLORS.gold : COLORS.border}`,
        background: active ? COLORS.surfaceSoft : COLORS.black,
        cursor: 'pointer',
        minHeight: 92,
      }}
    >
      <strong style={{ color: COLORS.white, fontSize: 16 }}>
        {kind === 'lesson' ? 'Choose or drop lesson files' : 'Choose or drop audio files'}
      </strong>
      <span style={{ color: COLORS.muted, fontSize: 13 }}>
        Tap to choose files on iPhone/iPad or drop multiple files here on desktop. Reorder after selecting.
      </span>
      <input
        type="file"
        aria-label={kind === 'lesson' ? 'Choose lesson files' : 'Choose audio files'}
        multiple
        accept={isIOSFilesPicker() ? undefined : ACCEPT[kind]}
        onChange={onInput}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          opacity: 0,
          fontSize: 16,
          cursor: 'pointer',
          zIndex: 1,
        }}
      />
    </div>
  );
}
