import { router, usePathname } from 'expo-router';
import { Dimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

// Order matches the tab bar in app/_layout.tsx. '/threads' is deliberately
// excluded — it's not a real screen (it opens a bottom sheet overlay via a
// tabPress listener), so it has nothing to land on if swiped into, and
// swipe-triggering the sheet would risk two gesture recognizers (this one
// and gorhom's internal pan) fighting each other.
const TAB_ORDER = ['/', '/reels', '/add', '/progress'];

const SWIPE_DISTANCE_THRESHOLD = 50;
const SCREEN_W = Dimensions.get('window').width;

function navigateTo(path: string) {
  router.navigate(path as any);
}

// Swipe left -> next tab, swipe right -> previous tab. activeOffsetX/
// failOffsetY make sure this only activates for clearly-horizontal drags,
// so it doesn't fight with vertical scrolling (ScrollView, Reels' FlatList).
//
// The screen's translateX follows the finger during the drag (onUpdate) so
// the swipe is visible as it happens, rather than only snapping to the next
// tab on release. On release: if the threshold was crossed, the screen
// finishes sliding off in that direction and only THEN (once the animation
// completes) does the actual tab navigation happen — the incoming tab just
// appears normally, no attempt at a synced two-screen transition. If the
// threshold wasn't crossed, it springs back to 0. Reading/writing translateX
// and calling withTiming/withSpring are all worklet-safe on their own — only
// the final router.navigate call needs runOnJS, same as before.
export function useSwipeTabNavigation() {
  const pathname = usePathname();
  const translateX = useSharedValue(0);

  const gesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const currentIndex = TAB_ORDER.indexOf(pathname);
      const goingNext = e.translationX <= -SWIPE_DISTANCE_THRESHOLD && currentIndex < TAB_ORDER.length - 1;
      const goingPrev = e.translationX >= SWIPE_DISTANCE_THRESHOLD && currentIndex > 0;

      if (goingNext || goingPrev) {
        const targetPath = goingNext ? TAB_ORDER[currentIndex + 1] : TAB_ORDER[currentIndex - 1];
        const exitX = goingNext ? -SCREEN_W : SCREEN_W;
        translateX.value = withTiming(exitX, { duration: 180 }, (finished) => {
          if (finished) {
            runOnJS(navigateTo)(targetPath);
            translateX.value = 0; // reset immediately so revisiting this tab later isn't pre-offset
          }
        });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return { gesture, animatedStyle };
}
