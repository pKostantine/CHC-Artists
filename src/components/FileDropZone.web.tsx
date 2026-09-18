import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { COLORS, RADII, SPACING } from '@/constants/theme';

const ACCEPT: Record<'audio' | 'lesson', string> = {
  audio: 'audio/*,.mp3,.m4a,.wav,.flac,.aac,.ogg,.webm',
  lesson: 'audio/*,video/*,.mp3,.m4a,.wav,.flac,.aac,.ogg,.webm,.mp4,.mov,.m4v',
};

export function FileDropZone({
  kind,
  onFiles,
}: {
  kind: 'audio' | 'lesson';
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  function receive(files: FileList | null) {
    if (!files?.length) return;
    onFiles(Array.from(files));
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
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
      }}
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
      onDrop={onDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SPACING.sm,
        padding: SPACING.lg,
        borderRadius: RADII.md,
        border: `2px dashed ${active ? COLORS.gold : COLORS.border}`,
        background: active ? COLORS.surfaceSoft : COLORS.black,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <strong style={{ color: COLORS.white, fontSize: 16 }}>
        {kind === 'lesson' ? 'Drop lesson files here' : 'Drop audio files here'}
      </strong>
      <span style={{ color: COLORS.muted, fontSize: 13 }}>
        Drop multiple files at once, or click here to browse. You can reorder them afterward.
      </span>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT[kind]}
        onChange={onInput}
        style={{ display: 'none' }}
      />
    </div>
  );
}
