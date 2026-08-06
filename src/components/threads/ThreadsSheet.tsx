import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useThreadsSheet } from '../../context/ThreadsSheetContext';
import { Thread, ThreadStorage } from '../../store/threadStorage';
import { Colors, Radius } from '../../utils/theme';
import ThreadComposer from './ThreadComposer';
import ThreadDetail from './ThreadDetail';
import ThreadFeed from './ThreadFeed';

type Mode = 'feed' | 'detail' | 'compose';

export default function ThreadsSheet() {
  const { sheetRef, setIsOpen } = useThreadsSheet();
  const [mode, setMode] = useState<Mode>('feed');
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  // Tracks whether the current compose session is a brand-new post or an
  // edit of an existing one, so Cancel/Save know whether to land back on
  // the feed or back on that post's detail view.
  const [composeOrigin, setComposeOrigin] = useState<'new' | 'edit'>('new');
  const [threads, setThreads] = useState<Thread[]>([]);

  const snapPoints = useMemo(() => ['72%'], []);

  const loadThreads = useCallback(async () => {
    setThreads(await ThreadStorage.getAll());
  }, []);

  // Refresh feed data whenever the sheet opens, but deliberately do NOT
  // reset mode/activeThread on close — the user wants to resume exactly
  // where they left off (mid-compose, or viewing a post's detail) rather
  // than always snapping back to the feed.
  const handleSheetChange = useCallback((index: number) => {
    setIsOpen(index >= 0);
    if (index >= 0) loadThreads();
  }, [loadThreads, setIsOpen]);

  const handleView = useCallback((thread: Thread) => {
    setActiveThread(thread);
    setMode('detail');
  }, []);

  const handleEdit = useCallback((thread: Thread) => {
    setActiveThread(thread);
    setComposeOrigin('edit');
    setMode('compose');
  }, []);

  const handleCompose = useCallback(() => {
    setActiveThread(null);
    setComposeOrigin('new');
    setMode('compose');
  }, []);

  const handleDelete = useCallback(async (thread: Thread) => {
    await ThreadStorage.deleteThread(thread.id);
    setMode('feed');
    setActiveThread(null);
    loadThreads();
  }, [loadThreads]);

  const handleBackToFeed = useCallback(() => {
    setMode('feed');
    setActiveThread(null);
  }, []);

  // Cancelling a new post always returns to the feed (nothing existed
  // before); cancelling an edit returns to that post's detail view, since
  // the post itself is unchanged and still valid to show.
  const handleCancelCompose = useCallback(() => {
    if (composeOrigin === 'edit' && activeThread) {
      setMode('detail');
    } else {
      setMode('feed');
      setActiveThread(null);
    }
  }, [composeOrigin, activeThread]);

  const handleSaved = useCallback(async (savedId: string) => {
    const all = await ThreadStorage.getAll();
    setThreads(all);
    if (composeOrigin === 'edit') {
      const updated = all.find(t => t.id === savedId) ?? null;
      setActiveThread(updated);
      setMode(updated ? 'detail' : 'feed');
    } else {
      setActiveThread(null);
      setMode('feed');
    }
  }, [composeOrigin]);

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
      {mode === 'feed' && (
        <ThreadFeed threads={threads} onView={handleView} onDelete={handleDelete} onCompose={handleCompose} />
      )}
      {mode === 'detail' && activeThread && (
        <ThreadDetail thread={activeThread} onBack={handleBackToFeed} onEdit={handleEdit} onDelete={handleDelete} />
      )}
      {mode === 'compose' && (
        <ThreadComposer
          key={activeThread?.id ?? 'new'}
          editingThread={activeThread}
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
