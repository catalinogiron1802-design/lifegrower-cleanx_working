import { Ionicons } from '@expo/vector-icons';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Thread } from '../../store/threadStorage';
import { Colors, Radius, Shadow } from '../../utils/theme';
import PhotoCarousel from './PhotoCarousel';

interface ThreadCardProps {
  thread: Thread;
  onView: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
}

export default function ThreadCard({ thread, onView, onDelete }: ThreadCardProps) {
  const handleDelete = () => {
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(thread) },
    ]);
  };

  return (
    <View style={styles.card}>
      <PhotoCarousel uris={thread.photoUris} height={200} />

      <TouchableOpacity style={styles.body} activeOpacity={0.85} onPress={() => onView(thread)}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>{thread.title}</Text>
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color={Colors.red} />
          </TouchableOpacity>
        </View>

        {thread.caption ? (
          <Text style={styles.caption} numberOfLines={3}>{thread.caption}</Text>
        ) : null}

        <View style={styles.metaRow}>
          <Text style={styles.date}>
            {new Date(thread.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          {thread.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {thread.tags.map(tag => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 16,
    ...Shadow.card,
  },
  body: { padding: 14, gap: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text },
  caption: { fontSize: 13, color: Colors.text2, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  date: { fontSize: 11, color: Colors.text3 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    backgroundColor: Colors.surface3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  tagChipText: { fontSize: 11, fontWeight: '600', color: Colors.text2 },
});
