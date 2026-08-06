import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../utils/theme';

interface BottomTabBarProps {
  currentIndex: number; // 0=Library,1=Reels,2=Add,3=Growth
  onSelectIndex: (index: number) => void;
  onPresentThreads: () => void;
  visible: boolean;
}

export default function BottomTabBar({ currentIndex, onSelectIndex, onPresentThreads, visible }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
      ]}
    >
      <TouchableOpacity style={styles.tab} onPress={() => onSelectIndex(0)}>
        <Ionicons name="grid-outline" size={24} color={currentIndex === 0 ? Colors.accent : Colors.text3} />
        <Text style={[styles.label, currentIndex === 0 && styles.labelActive]}>Library</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tab} onPress={() => onSelectIndex(1)}>
        <Ionicons name="play-circle-outline" size={24} color={currentIndex === 1 ? Colors.accent : Colors.text3} />
        <Text style={[styles.label, currentIndex === 1 && styles.labelActive]}>Reels</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tab} onPress={() => onSelectIndex(2)}>
        <View style={[styles.addBtn, currentIndex === 2 && styles.addBtnActive]}>
          <Ionicons name="add" size={28} color={currentIndex === 2 ? Colors.bg : Colors.accent} />
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tab} onPress={onPresentThreads}>
        <Ionicons name="chatbubble-ellipses-outline" size={24} color={Colors.text3} />
        <Text style={styles.label}>Threads</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tab} onPress={() => onSelectIndex(3)}>
        <Ionicons name="leaf-outline" size={24} color={currentIndex === 3 ? Colors.accent : Colors.text3} />
        <Text style={[styles.label, currentIndex === 3 && styles.labelActive]}>Growth</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 2 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, color: Colors.text3 },
  labelActive: { color: Colors.accent },
  addBtn: {
    width: 50, height: 40, borderRadius: 25,
    borderWidth: 2, borderColor: Colors.accent,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 10,
  },
  addBtnActive: { backgroundColor: Colors.accent },
});
