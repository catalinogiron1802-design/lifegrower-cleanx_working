import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import ThreadsFloatingBubble from '../src/components/threads/ThreadsFloatingBubble';
import ThreadsSheet from '../src/components/threads/ThreadsSheet';
import { ThreadsSheetProvider, useThreadsSheet } from '../src/context/ThreadsSheetContext';
import { Colors } from '../src/utils/theme';

// Shared with reels.tsx, which has to reset tabBarStyle itself when the tab
// bar is swiped back into view — using `undefined` there would fall back to
// React Navigation's default (white) style instead of this dark one.
export function getTabBarStyle(insets: { bottom: number }) {
  return {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 60 + insets.bottom,
    paddingBottom: 8 + insets.bottom,
    paddingTop: 8,
  };
}

// Separate component so we can use the hook inside SafeAreaProvider
function Layout() {
  const insets = useSafeAreaInsets();
  const { present } = useThreadsSheet();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.text3,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: getTabBarStyle(insets),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: 'Reels',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="play-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.addBtn, focused && styles.addBtnActive]}>
              <Ionicons name="add" size={28} color={focused ? Colors.bg : Colors.accent} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="threads"
        options={{
          title: 'Threads',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            // Threads isn't a real screen — it opens a bottom sheet overlaid
            // on whatever tab is currently active, so it must never navigate.
            e.preventDefault();
            present();
          },
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Growth',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="leaf-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden screens - not shown in tab bar, but still reachable via router.push */}
      <Tabs.Screen
        name="detail"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="timer"
        options={{ href: null }}
      />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <ThreadsSheetProvider>
            <Layout />
            <ThreadsSheet />
            <ThreadsFloatingBubble />
          </ThreadsSheetProvider>
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  addBtn: {
    width: 50,
    height: 40,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  addBtnActive: {
    backgroundColor: Colors.accent,
  },
});
