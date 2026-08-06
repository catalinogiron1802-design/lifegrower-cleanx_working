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
// Below this much total movement, treat the gesture as a tap rather than a drag.
const TAP_MOVEMENT_THRESHOLD = 8;

// A draggable, AssistiveTouch-style bubble that opens the Threads sheet from
// anywhere in the app, even mid-scroll on another screen. Position is driven
// entirely by Reanimated shared values updated inside worklets (onUpdate) —
// no runOnJS needed there. runOnJS is only used for the one call that has to
// cross back to the JS thread: opening the sheet on a tap. This mirrors the
// fix for the earlier native crash, where a gesture callback called a
// non-worklet-safe JS function (router.navigate) directly.
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
  const movement = useSharedValue(0);

  const openSheet = () => present();

  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
      movement.value = 0;
    })
    .onUpdate((e) => {
      translateX.value = Math.min(maxX, Math.max(minX, startX.value + e.translationX));
      translateY.value = Math.min(maxY, Math.max(minY, startY.value + e.translationY));
      movement.value = Math.abs(e.translationX) + Math.abs(e.translationY);
    })
    .onEnd(() => {
      if (movement.value < TAP_MOVEMENT_THRESHOLD) {
        runOnJS(openSheet)();
        return;
      }
      // Snap to the nearest horizontal edge, like real AssistiveTouch.
      const midX = (minX + maxX) / 2 + BUBBLE_SIZE / 2;
      translateX.value = withSpring(translateX.value + BUBBLE_SIZE / 2 < midX ? minX : maxX);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  if (isOpen) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
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
