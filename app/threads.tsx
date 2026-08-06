import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { useThreadsSheet } from '../src/context/ThreadsSheetContext';
import { Colors } from '../src/utils/theme';

// Backing file for the "Threads" tab. In normal operation the tab's
// tabPress listener (app/_layout.tsx) intercepts the press with
// e.preventDefault() and opens the sheet without ever navigating here —
// this screen only exists as a graceful fallback in case that interception
// ever fails to suppress navigation for some reason.
export default function ThreadsScreen() {
  const { present } = useThreadsSheet();

  useFocusEffect(useCallback(() => {
    present();
  }, [present]));

  return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
}
