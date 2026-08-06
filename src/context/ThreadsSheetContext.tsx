import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

interface ThreadsSheetContextValue {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  present: () => void;
  dismiss: () => void;
  // Lets other screens (e.g. Library's multi-select bar) open the sheet
  // straight into compose mode, pre-filled with a set of already-permanent
  // photo URIs — used by "Add to Thread".
  pendingComposePhotos: string[] | null;
  composeWithPhotos: (uris: string[]) => void;
  clearPendingComposePhotos: () => void;
}

const ThreadsSheetContext = createContext<ThreadsSheetContextValue | null>(null);

export function ThreadsSheetProvider({ children }: { children: React.ReactNode }) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingComposePhotos, setPendingComposePhotos] = useState<string[] | null>(null);

  const present = useCallback(() => sheetRef.current?.present(), []);
  const dismiss = useCallback(() => sheetRef.current?.dismiss(), []);

  const composeWithPhotos = useCallback((uris: string[]) => {
    setPendingComposePhotos(uris);
    sheetRef.current?.present();
  }, []);

  const clearPendingComposePhotos = useCallback(() => setPendingComposePhotos(null), []);

  const value = useMemo(
    () => ({
      sheetRef, isOpen, setIsOpen, present, dismiss,
      pendingComposePhotos, composeWithPhotos, clearPendingComposePhotos,
    }),
    [isOpen, present, dismiss, pendingComposePhotos, composeWithPhotos, clearPendingComposePhotos]
  );

  return (
    <ThreadsSheetContext.Provider value={value}>
      {children}
    </ThreadsSheetContext.Provider>
  );
}

export function useThreadsSheet() {
  const ctx = useContext(ThreadsSheetContext);
  if (!ctx) throw new Error('useThreadsSheet must be used within a ThreadsSheetProvider');
  return ctx;
}
