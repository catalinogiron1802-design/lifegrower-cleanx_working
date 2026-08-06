import { router, usePathname } from 'expo-router';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

// Order matches the tab bar in app/_layout.tsx. '/threads' is deliberately
// excluded — it's not a real screen (it opens a bottom sheet overlay via a
// tabPress listener), so it has nothing to land on if swiped into, and
// swipe-triggering the sheet would risk two gesture recognizers (this one
// and gorhom's internal pan) fighting each other.
const TAB_ORDER = ['/', '/reels', '/add', '/progress'];

const SWIPE_DISTANCE_THRESHOLD = 50;

function navigateTo(path: string) {
  router.navigate(path as any);
}

// Swipe left -> next tab, swipe right -> previous tab. activeOffsetX/
// failOffsetY make sure this only activates for clearly-horizontal drags,
// so it doesn't fight with vertical scrolling (ScrollView, Reels' FlatList).
export function useSwipeTabNavigation() {
  const pathname = usePathname();

  return Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      const currentIndex = TAB_ORDER.indexOf(pathname);
      if (currentIndex === -1) return;

      // .onEnd runs as a worklet on the UI thread (gesture-handler treats
      // gesture callbacks as worklets whenever Reanimated is installed) —
      // router.navigate is a full JS/React-Navigation call and must be
      // marshaled back to the JS thread via runOnJS, or this crashes natively.
      if (e.translationX <= -SWIPE_DISTANCE_THRESHOLD && currentIndex < TAB_ORDER.length - 1) {
        runOnJS(navigateTo)(TAB_ORDER[currentIndex + 1]);
      } else if (e.translationX >= SWIPE_DISTANCE_THRESHOLD && currentIndex > 0) {
        runOnJS(navigateTo)(TAB_ORDER[currentIndex - 1]);
      }
    });
}
