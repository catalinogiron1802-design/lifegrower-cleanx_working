import { Ionicons } from '@expo/vector-icons';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Thread } from '../../store/threadStorage';
import { Colors, Radius, Shadow } from '../../utils/theme';
import ThreadCard from './ThreadCard';

interface ThreadFeedProps {
  threads: Thread[];
  onView: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
  onCompose: () => void;
}

export default function ThreadFeed({ threads, onView, onDelete, onCompose }: ThreadFeedProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Threads</Text>
        <Text style={styles.headerSub}>Your learning journal</Text>
      </View>

      <BottomSheetFlatList
        data={threads}
        keyExtractor={(t: Thread) => t.id}
        renderItem={({ item }: { item: Thread }) => (
          <ThreadCard thread={item} onView={onView} onDelete={onDelete} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📝</Text>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptySub}>Tap + to start your journal</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={onCompose} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={Colors.bg} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, fontFamily: 'Georgia' },
  headerSub: { fontSize: 13, color: Colors.text3, marginTop: 2 },

  list: { paddingHorizontal: 16, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 70, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.text3 },

  fab: {
    position: 'absolute', right: 16, bottom: 16,
    width: 54, height: 54, borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.accent,
  },
});
