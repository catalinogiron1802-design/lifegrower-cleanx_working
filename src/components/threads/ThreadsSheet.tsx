import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useThreadsSheet } from '../../context/ThreadsSheetContext';
import { Thread, ThreadStorage } from '../../store/threadStorage';
import { Colors, Radius } from '../../utils/theme';
import ThreadComposer from './ThreadComposer';
import ThreadFeed from './ThreadFeed';

export default function ThreadsSheet() {
  const { sheetRef } = useThreadsSheet();
  const [mode, setMode] = useState<'feed' | 'compose'>('feed');
  const [editingThread, setEditingThread] = useState<Thread | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);

  const snapPoints = useMemo(() => ['72%'], []);

  const loadThreads = useCallback(async () => {
    setThreads(await ThreadStorage.getAll());
  }, []);

  // Reload every time the sheet opens; reset back to the feed (discarding
  // any in-progress compose state) every time it fully closes, so reopening
  // never lands mid-compose from a previous session.
  const handleSheetChange = useCallback((index: number) => {
    if (index >= 0) {
      loadThreads();
    } else {
      setMode('feed');
      setEditingThread(null);
    }
  }, [loadThreads]);

  const handleEdit = useCallback((thread: Thread) => {
    setEditingThread(thread);
    setMode('compose');
  }, []);

  const handleCompose = useCallback(() => {
    setEditingThread(null);
    setMode('compose');
  }, []);

  const handleDelete = useCallback(async (thread: Thread) => {
    await ThreadStorage.deleteThread(thread.id);
    loadThreads();
  }, [loadThreads]);

  const handleCancelCompose = useCallback(() => {
    setMode('feed');
    setEditingThread(null);
  }, []);

  const handleSaved = useCallback(() => {
    setMode('feed');
    setEditingThread(null);
    loadThreads();
  }, [loadThreads]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.55} pressBehavior="close" />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handleIndicator}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      onChange={handleSheetChange}
    >
      {mode === 'feed' ? (
        <ThreadFeed threads={threads} onEdit={handleEdit} onDelete={handleDelete} onCompose={handleCompose} />
      ) : (
        <ThreadComposer
          key={editingThread?.id ?? 'new'}
          editingThread={editingThread}
          onCancel={handleCancelCompose}
          onSaved={handleSaved}
        />
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
  handleIndicator: { backgroundColor: Colors.border, width: 36, height: 4 },
});
