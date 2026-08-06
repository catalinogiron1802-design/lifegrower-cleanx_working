import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Thread } from '../../store/threadStorage';
import { Colors, Radius } from '../../utils/theme';
import PhotoCarousel from './PhotoCarousel';

interface ThreadDetailProps {
  thread: Thread;
  onBack: () => void;
  onEdit: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
}

export default function ThreadDetail({ thread, onBack, onEdit, onDelete }: ThreadDetailProps) {
  const handleDelete = () => {
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(thread) },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => onEdit(thread)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="pencil-outline" size={20} color={Colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="trash-outline" size={20} color={Colors.red} />
          </TouchableOpacity>
        </View>
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PhotoCarousel uris={thread.photoUris} height={320} />

        <Text style={styles.title}>{thread.title}</Text>
        <Text style={styles.date}>
          {new Date(thread.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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

        {thread.caption ? <Text style={styles.caption}>{thread.caption}</Text> : null}
      </BottomSheetScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerActions: { flexDirection: 'row', gap: 20 },

  scroll: { padding: 20, paddingBottom: 60 },

  title: { fontSize: 21, fontWeight: '800', color: Colors.text, marginTop: 16, lineHeight: 28 },
  date: { fontSize: 12, color: Colors.text3, marginTop: 4 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tagChip: {
    backgroundColor: Colors.surface3, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  tagChipText: { fontSize: 12, fontWeight: '600', color: Colors.text2 },

  caption: { fontSize: 15, color: Colors.text2, lineHeight: 23, marginTop: 16 },
});
