import { useState } from 'react';
import { Button } from '@/components/ui';
import type { UploadCandidate } from '@/types/creator';
import { pickUploadCandidates } from '@/utils/uploads';

export type FileSelectKind = 'audio' | 'video' | 'image' | 'lesson';

export interface FileSelectButtonProps {
  label: string;
  kind: FileSelectKind;
  multiple?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onFiles: (files: UploadCandidate[]) => void;
  onError?: (message: string) => void;
}

/**
 * Expo iOS/Android: open the native Files picker directly from the tap event.
 * The web build substitutes FileSelectButton.web.tsx with a real DOM input.
 */
export function FileSelectButton({
  label, kind, multiple = false, busy = false, disabled = false, onFiles, onError,
}: FileSelectButtonProps) {
  const [picking, setPicking] = useState(false);
  function pick() {
    if (disabled || busy || picking) return;
    setPicking(true);
    void pickUploadCandidates(kind, multiple)
      .then(onFiles)
      .catch((error: unknown) => onError?.(error instanceof Error ? error.message : String(error)))
      .finally(() => setPicking(false));
  }
  return <Button label={label} onPress={pick} busy={busy || picking} disabled={disabled} />;
}
