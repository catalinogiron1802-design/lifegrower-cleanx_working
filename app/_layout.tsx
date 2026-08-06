import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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
        name="timer"
        options={{
          title: 'Timer',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="timer-outline" size={size} color={color} />
          ),
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
      {/* Hidden screens - not shown in tab bar */}
      <Tabs.Screen
        name="detail"
        options={{ href: null }}
      />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Layout />
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
