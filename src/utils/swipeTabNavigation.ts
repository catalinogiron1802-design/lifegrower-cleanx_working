import { router, usePathname } from 'expo-router';
import { Gesture } from 'react-native-gesture-handler';

// Order matches the tab bar in app/_layout.tsx
const TAB_ORDER = ['/', '/reels', '/add', '/timer', '/progress'];

const SWIPE_DISTANCE_THRESHOLD = 50;

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

      if (e.translationX <= -SWIPE_DISTANCE_THRESHOLD && currentIndex < TAB_ORDER.length - 1) {
        router.navigate(TAB_ORDER[currentIndex + 1] as any);
      } else if (e.translationX >= SWIPE_DISTANCE_THRESHOLD && currentIndex > 0) {
        router.navigate(TAB_ORDER[currentIndex - 1] as any);
      }
    });
}
