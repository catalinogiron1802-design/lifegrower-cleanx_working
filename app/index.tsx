import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import BottomTabBar from '../src/components/BottomTabBar';
import { useThreadsSheet } from '../src/context/ThreadsSheetContext';
import AddScreen from '../src/screens/AddScreen';
import GrowthScreen from '../src/screens/GrowthScreen';
import LibraryScreen from '../src/screens/LibraryScreen';
import ReelsScreen from '../src/screens/ReelsScreen';
import { Colors } from '../src/utils/theme';

const LIBRARY = 0;
const REELS = 1;
const ADD = 2;
const GROWTH = 3;

export default function PagerHostScreen() {
  const { present } = useThreadsSheet();
  const pagerRef = useRef<PagerView>(null);
  const [currentIndex, setCurrentIndex] = useState(LIBRARY);
  const [reelsTabBarRevealed, setReelsTabBarRevealed] = useState(false);

  const goToPage = useCallback((index: number) => {
    pagerRef.current?.setPage(index);
  }, []);

  // Single source of truth for "which page is active" — only ever set from
  // the native callback, never directly from a tap handler, so it can't
  // drift from what the pager actually did mid-swipe.
  const handlePageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    setCurrentIndex(e.nativeEvent.position);
  }, []);

  const tabBarVisible = currentIndex !== REELS || reelsTabBarRevealed;

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={LIBRARY}
        onPageSelected={handlePageSelected}
      >
        <View key="library" style={styles.page}>
          <LibraryScreen isActive={currentIndex === LIBRARY} />
        </View>
        <View key="reels" style={styles.page}>
          <ReelsScreen
            isActive={currentIndex === REELS}
            tabBarRevealed={reelsTabBarRevealed}
            onTabBarRevealedChange={setReelsTabBarRevealed}
            onRequestAddPage={() => goToPage(ADD)}
          />
        </View>
        <View key="add" style={styles.page}>
          <AddScreen isActive={currentIndex === ADD} onRequestLibraryPage={() => goToPage(LIBRARY)} />
        </View>
        <View key="growth" style={styles.page}>
          <GrowthScreen isActive={currentIndex === GROWTH} />
        </View>
      </PagerView>

      <BottomTabBar
        currentIndex={currentIndex}
        onSelectIndex={goToPage}
        onPresentThreads={present}
        visible={tabBarVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  pager: { flex: 1 },
  page: { flex: 1 },
});
