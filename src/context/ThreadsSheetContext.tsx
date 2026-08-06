import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

interface ThreadsSheetContextValue {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  present: () => void;
  dismiss: () => void;
}

const ThreadsSheetContext = createContext<ThreadsSheetContextValue | null>(null);

export function ThreadsSheetProvider({ children }: { children: React.ReactNode }) {
  const sheetRef = useRef<BottomSheetModal>(null);

  const present = useCallback(() => sheetRef.current?.present(), []);
  const dismiss = useCallback(() => sheetRef.current?.dismiss(), []);

  const value = useMemo(() => ({ sheetRef, present, dismiss }), [present, dismiss]);

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
