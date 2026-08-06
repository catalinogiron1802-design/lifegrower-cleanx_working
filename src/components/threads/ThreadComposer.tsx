import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { generateThreadId, Thread, ThreadStorage } from '../../store/threadStorage';
import { Colors, Radius, Shadow } from '../../utils/theme';
import PhotoCarousel from './PhotoCarousel';

interface ComposerPhoto {
  uri: string;
  isNew: boolean; // true = fresh picker-cache URI needing to be copied on save; false = already-permanent URI from an existing thread
}

interface ThreadComposerProps {
  editingThread: Thread | null;
  // Already-permanent photo URIs to seed a brand-new post with (e.g. photos
  // picked from the Library via "Add to Thread") — ignored when editingThread
  // is set, since that already provides its own photos.
  initialPhotoUris?: string[];
  onCancel: () => void;
  onSaved: (id: string) => void;
}

export default function ThreadComposer({ editingThread, initialPhotoUris, onCancel, onSaved }: ThreadComposerProps) {
  const [photos, setPhotos] = useState<ComposerPhoto[]>(() => {
    if (editingThread) return editingThread.photoUris.map(uri => ({ uri, isNew: false }));
    if (initialPhotoUris?.length) return initialPhotoUris.map(uri => ({ uri, isNew: false }));
    return [];
  });
  const [title, setTitle] = useState(editingThread?.title ?? '');
  const [caption, setCaption] = useState(editingThread?.caption ?? '');
  const [tags, setTags] = useState<string[]>(editingThread?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = photos.length > 0 && title.trim().length > 0 && !saving;

  const pickPhotos = async () => {
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      if (!canAskAgain) {
        Alert.alert('Permission Denied', 'Go to Settings → Apps → Expo Go → Permissions → enable Photos/Media.', [{ text: 'OK' }]);
      } else {
        Alert.alert('Permission needed', 'Please allow access to your media library.');
      }
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });
      if (!result.canceled && result.assets?.length) {
        setPhotos(prev => [...prev, ...result.assets.map(a => ({ uri: a.uri, isNew: true }))]);
      }
    } catch (e: any) {
      Alert.alert('Error', 'Could not open photo picker: ' + e.message);
    }
  };

  const movePhoto = (index: number, direction: -1 | 1) => {
    setPhotos(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    setTags(prev => prev.includes(t) ? prev : [...prev, t]);
    setTagInput('');
  };

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const id = editingThread?.id ?? generateThreadId();
      const finalUris: string[] = [];

      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        if (!p.isNew) { finalUris.push(p.uri); continue; }
        try {
          const ext = p.uri.split('.').pop() || 'jpg';
          const destUri = FileSystem.documentDirectory + `${id}_${i}_${Date.now()}.${ext}`;
          await FileSystem.copyAsync({ from: p.uri, to: destUri });
          finalUris.push(destUri);
        } catch {
          finalUris.push(p.uri); // fall back to the original (possibly ephemeral) picker URI
        }
      }

      if (editingThread) {
        await ThreadStorage.updateThread(id, {
          title: title.trim(), caption: caption.trim(), photoUris: finalUris, tags,
        });
      } else {
        await ThreadStorage.addThread({
          id, title: title.trim(), caption: caption.trim(), photoUris: finalUris, tags,
          createdAt: Date.now(), updatedAt: Date.now(),
        });
      }
      onSaved(id);
    } catch (e: any) {
      Alert.alert('Error', 'Could not save post: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.headerCancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editingThread ? 'Edit Post' : 'New Post'}</Text>
        <TouchableOpacity
          style={[styles.postBtn, !canSave && styles.postBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}
        >
          {saving
            ? <ActivityIndicator color={Colors.bg} size="small" />
            : <Text style={styles.postBtnText}>Post</Text>}
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Carousel preview */}
        {photos.length > 0 && (
          <PhotoCarousel uris={photos.map(p => p.uri)} height={240} />
        )}

        {/* Add photos button */}
        <TouchableOpacity style={styles.addPhotosBtn} onPress={pickPhotos} activeOpacity={0.8}>
          <Ionicons name="images-outline" size={18} color={Colors.accent} />
          <Text style={styles.addPhotosBtnText}>
            {photos.length === 0 ? 'Add Photos' : 'Add More Photos'}
          </Text>
        </TouchableOpacity>

        {/* Reorder strip */}
        {photos.length > 0 && (
          <View style={styles.reorderStrip}>
            {photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.thumbWrap}>
                <Image source={{ uri: p.uri }} style={styles.thumb} />
                <TouchableOpacity style={styles.thumbRemove} onPress={() => removePhoto(i)}>
                  <Ionicons name="close" size={12} color={Colors.white} />
                </TouchableOpacity>
                <View style={styles.thumbArrows}>
                  <TouchableOpacity
                    style={[styles.thumbArrowBtn, i === 0 && styles.thumbArrowBtnDisabled]}
                    onPress={() => movePhoto(i, -1)}
                    disabled={i === 0}
                  >
                    <Ionicons name="chevron-back" size={13} color={i === 0 ? Colors.text3 : Colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.thumbArrowBtn, i === photos.length - 1 && styles.thumbArrowBtnDisabled]}
                    onPress={() => movePhoto(i, 1)}
                    disabled={i === photos.length - 1}
                  >
                    <Ionicons name="chevron-forward" size={13} color={i === photos.length - 1 ? Colors.text3 : Colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Title</Text>
          <BottomSheetTextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. 3 Things That Helped Me Improve My Piano Skills"
            placeholderTextColor={Colors.text3}
            maxLength={100}
          />
        </View>

        {/* Caption */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Caption</Text>
          <BottomSheetTextInput
            style={[styles.input, styles.inputMulti]}
            value={caption}
            onChangeText={setCaption}
            placeholder="Describe what you learned, what worked, what to remember..."
            placeholderTextColor={Colors.text3}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Tags */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tags</Text>
          <View style={styles.tagInputRow}>
            <BottomSheetTextInput
              style={[styles.input, styles.tagInput]}
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="Music, Piano, FL Studio..."
              placeholderTextColor={Colors.text3}
              onSubmitEditing={addTag}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.tagAddBtn} onPress={addTag}>
              <Ionicons name="add" size={20} color={Colors.bg} />
            </TouchableOpacity>
          </View>
          {tags.length > 0 && (
            <View style={styles.tagsRow}>
              {tags.map(tag => (
                <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => removeTag(tag)}>
                  <Text style={styles.tagChipText}>{tag}</Text>
                  <Ionicons name="close" size={12} color={Colors.text2} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
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
  headerCancel: { fontSize: 15, color: Colors.text2, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  postBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.full,
    paddingHorizontal: 18, paddingVertical: 7, minWidth: 64, alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.4 },
  postBtnText: { fontSize: 14, fontWeight: '800', color: Colors.bg },

  scroll: { padding: 20, paddingBottom: 60, gap: 4 },

  addPhotosBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.accentDim,
    backgroundColor: Colors.accentGlow, borderRadius: Radius.md,
    paddingVertical: 14, marginTop: 12, marginBottom: 12,
  },
  addPhotosBtnText: { fontSize: 14, fontWeight: '700', color: Colors.accent },

  reorderStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  thumbWrap: { width: 64 },
  thumb: { width: 64, height: 64, borderRadius: Radius.sm, backgroundColor: Colors.surface2 },
  thumbRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.red, justifyContent: 'center', alignItems: 'center',
  },
  thumbArrows: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  thumbArrowBtn: {
    width: 26, height: 22, borderRadius: Radius.sm,
    backgroundColor: Colors.surface2, justifyContent: 'center', alignItems: 'center',
  },
  thumbArrowBtnDisabled: { opacity: 0.35 },

  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.text2, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    color: Colors.text, fontSize: 15,
  },
  inputMulti: { height: 120, paddingTop: 12 },

  tagInputRow: { flexDirection: 'row', gap: 8 },
  tagInput: { flex: 1 },
  tagAddBtn: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center',
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface3, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  tagChipText: { fontSize: 12, fontWeight: '600', color: Colors.text2 },
});
