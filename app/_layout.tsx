import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ThreadsFloatingBubble from '../src/components/threads/ThreadsFloatingBubble';
import ThreadsSheet from '../src/components/threads/ThreadsSheet';
import { ThreadsSheetProvider } from '../src/context/ThreadsSheetContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <ThreadsSheetProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="detail" />
              <Stack.Screen name="timer" />
            </Stack>
            <ThreadsSheet />
            <ThreadsFloatingBubble />
          </ThreadsSheetProvider>
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
