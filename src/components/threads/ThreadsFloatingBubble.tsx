import { Ionicons } from '@expo/vector-icons';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThreadsSheet } from '../../context/ThreadsSheetContext';
import { Colors, Shadow } from '../../utils/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BUBBLE_SIZE = 56;
const MARGIN = 12;
// Beyond this much movement, a touch counts as a drag rather than a tap.
const TAP_MAX_DISTANCE = 10;

// A draggable, AssistiveTouch-style bubble that opens the Threads sheet from
// anywhere in the app, even mid-scroll on another screen. Position is driven
// entirely by Reanimated shared values updated inside worklets (onUpdate) —
// no runOnJS needed there. runOnJS is only used for the one call that has to
// cross back to the JS thread: opening the sheet on a tap. This mirrors the
// fix for the earlier native crash, where a gesture callback called a
// non-worklet-safe JS function (router.navigate) directly.
//
// Tap and drag are two SEPARATE gesture recognizers composed with
// Gesture.Race, rather than one Pan gesture inferring "was this a tap"
// from its own movement tracking — the earlier hand-rolled version
// (checking total movement inside Pan's onEnd) required winning a race
// against gesture-handler's own state machine for near-zero-movement
// touches, which is exactly the class of touch a real tap produces, and
// unreliably needed multiple taps to register. A dedicated Tap gesture
// doesn't have that problem.
export default function ThreadsFloatingBubble() {
  const { present, isOpen } = useThreadsSheet();
  const insets = useSafeAreaInsets();

  const minX = MARGIN;
  const maxX = SCREEN_W - BUBBLE_SIZE - MARGIN;
  const minY = insets.top + MARGIN;
  const maxY = SCREEN_H - BUBBLE_SIZE - insets.bottom - 100; // stays clear of the tab bar

  const translateX = useSharedValue(maxX);
  const translateY = useSharedValue(maxY - 60);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const openSheet = () => present();

  const tap = Gesture.Tap()
    .maxDistance(TAP_MAX_DISTANCE)
    .onEnd((_e, success) => {
      if (success) runOnJS(openSheet)();
    });

  const pan = Gesture.Pan()
    .minDistance(TAP_MAX_DISTANCE)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = Math.min(maxX, Math.max(minX, startX.value + e.translationX));
      translateY.value = Math.min(maxY, Math.max(minY, startY.value + e.translationY));
    })
    .onEnd(() => {
      // Snap to the nearest horizontal edge, like real AssistiveTouch.
      const midX = (minX + maxX) / 2 + BUBBLE_SIZE / 2;
      translateX.value = withSpring(translateX.value + BUBBLE_SIZE / 2 < midX ? minX : maxX);
    });

  const gesture = Gesture.Race(tap, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  if (isOpen) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.bubble, animatedStyle]}>
          <Ionicons name="chatbubble-ellipses" size={24} color={Colors.bg} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  bubble: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.accent,
  },
});
