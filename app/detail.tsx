import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Image,
  KeyboardAvoidingView, Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MediaItem, Storage } from '../src/store/storage';
import { Colors, Radius } from '../src/utils/theme';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<MediaItem | null>(null);
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const hasCountedPlay = useRef(false);

  // expo-video player — only created when item is a video
  const player = useVideoPlayer(
    item?.type === 'video' ? { uri: item.uri } : null,
    p => { if (p) p.loop = false; }
  );

  // Listen for playback changes via addListener
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('playingChange', ({ isPlaying }: any) => {
      if (isPlaying && !hasCountedPlay.current) {
        hasCountedPlay.current = true;
        if (item) {
          Storage.incrementWatchCount(item.id);
          setItem(prev => prev ? { ...prev, watchCount: (prev.watchCount || 0) + 1 } : prev);
        }
      }
      if (!isPlaying) hasCountedPlay.current = false;
    });
    return () => sub.remove();
  }, [player, item]);

  useEffect(() => {
    loadItem();
    hasCountedPlay.current = false;
  }, [id]);

  const loadItem = async () => {
    const all = await Storage.getAll();
    const found = all.find(i => i.id === id);
    if (found) {
      setItem(found);
      setNote(found.note || '');
      setTitle(found.title || '');
    }
  };

  const saveNote = async () => {
    if (!item) return;
    await Storage.updateItem(item.id, { note: note.trim() });
    setEditingNote(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
    setItem(prev => prev ? { ...prev, note: note.trim() } : prev);
  };

  const saveTitle = async () => {
    if (!item || !title.trim()) return;
    await Storage.updateItem(item.id, { title: title.trim() });
    setEditingTitle(false);
    setItem(prev => prev ? { ...prev, title: title.trim() } : prev);
  };

  const toggleComprehended = async () => {
    if (!item) return;
    const next = !item.comprehended;
    await Storage.updateItem(item.id, { comprehended: next });
    if (next) {
      Alert.alert(
        '🎉 Amazing!',
        'You\'ve marked this as comprehended. That means you\'ve truly internalized it. Keep growing!',
        [{ text: 'Thank you!' }]
      );
    }
    setItem(prev => prev ? { ...prev, comprehended: next } : prev);
  };

  const handleBack = () => {
    try { player?.pause(); } catch (_) {}
    router.back();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete item',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await Storage.deleteItem(item!.id);
            router.back();
          },
        },
      ]
    );
  };

  if (!item) return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Loading…</Text>
    </View>
  );

  const watchedDaysAgo = item.lastWatchedAt
    ? Math.floor((Date.now() - item.lastWatchedAt) / 86400000)
    : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.topActions}>
            <TouchableOpacity onPress={handleDelete} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={20} color={Colors.red} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Media */}
          <View style={styles.mediaBox}>
            {item.type === 'video' ? (
              <VideoView
                player={player}
                style={styles.video}
                contentFit="contain"
                nativeControls
              />
            ) : (
              <Image
                source={{ uri: item.uri }}
                style={styles.photo}
                resizeMode="contain"
              />
            )}
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="eye-outline" size={16} color={Colors.accent} />
              <Text style={styles.statVal}>{item.watchCount || 0}</Text>
              <Text style={styles.statLab}>
                {item.type === 'video' ? 'plays' : 'views'}
              </Text>
            </View>
            {watchedDaysAgo !== null && (
              <View style={styles.statItem}>
                <Ionicons name="calendar-outline" size={16} color={Colors.blue} />
                <Text style={styles.statVal}>
                  {watchedDaysAgo === 0 ? 'Today' : `${watchedDaysAgo}d ago`}
                </Text>
                <Text style={styles.statLab}>last viewed</Text>
              </View>
            )}
            <View style={styles.statItem}>
              <Ionicons
                name={item.comprehended ? 'checkmark-circle' : 'time-outline'}
                size={16}
                color={item.comprehended ? Colors.green : Colors.text3}
              />
              <Text style={[styles.statVal, item.comprehended && { color: Colors.green }]}>
                {item.comprehended ? 'Done' : 'Learning'}
              </Text>
              <Text style={styles.statLab}>status</Text>
            </View>
          </View>

          {/* Title */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Title</Text>
              <TouchableOpacity onPress={() => setEditingTitle(true)}>
                <Ionicons name="pencil-outline" size={16} color={Colors.accent} />
              </TouchableOpacity>
            </View>
            {editingTitle ? (
              <View>
                <TextInput
                  style={styles.inputInline}
                  value={title}
                  onChangeText={setTitle}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={saveTitle}
                />
                <TouchableOpacity style={styles.saveNoteBtn} onPress={saveTitle}>
                  <Text style={styles.saveNoteBtnText}>Save title</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.itemTitle}>{item.title}</Text>
            )}
          </View>

          {/* Note */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionLabelRow}>
                <Ionicons name="journal-outline" size={15} color={Colors.accent} />
                <Text style={styles.sectionLabel}>My Note & Reflection</Text>
              </View>
              {!editingNote && (
                <TouchableOpacity onPress={() => setEditingNote(true)}>
                  <Text style={styles.editLink}>{note ? 'Edit' : 'Add note'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {editingNote ? (
              <View>
                <TextInput
                  style={[styles.inputInline, styles.inputMulti]}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  autoFocus
                  placeholder="Write what this means to you. How will you apply it?"
                  placeholderTextColor={Colors.text3}
                  textAlignVertical="top"
                  maxLength={2000}
                />
                <View style={styles.noteActions}>
                  <TouchableOpacity
                    style={styles.cancelNoteBtn}
                    onPress={() => { setNote(item.note || ''); setEditingNote(false); }}
                  >
                    <Text style={styles.cancelNoteBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveNoteBtn} onPress={saveNote}>
                    <Ionicons name="checkmark" size={16} color={Colors.bg} />
                    <Text style={styles.saveNoteBtnText}>Save note</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.noteDisplay}>
                {note ? (
                  <Text style={styles.noteText}>"{note}"</Text>
                ) : (
                  <Text style={styles.notePlaceholder}>
                    Tap "Add note" to write your thoughts, what you learned, or how you plan to apply this in your life.
                  </Text>
                )}
              </View>
            )}

            {noteSaved && (
              <View style={styles.savedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.green} />
                <Text style={styles.savedBadgeText}>Note saved!</Text>
              </View>
            )}
          </View>

          {/* Comprehension toggle */}
          <TouchableOpacity
            style={[styles.comprehendBlock, item.comprehended && styles.comprehendBlockDone]}
            onPress={toggleComprehended}
            activeOpacity={0.85}
          >
            <View>
              <Text style={[styles.comprehendTitle, item.comprehended && styles.comprehendTitleDone]}>
                {item.comprehended ? '✅ Comprehended & Applied' : '⭕ Mark as Comprehended'}
              </Text>
              <Text style={styles.comprehendSub}>
                {item.comprehended
                  ? 'You\'ve internalized this into your life. Tap to undo.'
                  : 'Tap when you\'ve truly understood AND applied this in real life.'}
              </Text>
            </View>
            <Ionicons
              name={item.comprehended ? 'checkmark-circle' : 'radio-button-off-outline'}
              size={28}
              color={item.comprehended ? Colors.green : Colors.text3}
            />
          </TouchableOpacity>

          {/* Motivation card */}
          <View style={styles.motivCard}>
            <Text style={styles.motivQuote}>
              "Watch it again. Growth isn't about watching once — it's about watching until it changes you."
            </Text>
            <Text style={styles.motivBy}>— LifeGrower</Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg },
  loadingText: { color: Colors.text2 },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface2, justifyContent: 'center', alignItems: 'center',
  },
  topActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface2, justifyContent: 'center', alignItems: 'center',
  },

  scroll: { paddingBottom: 60 },

  mediaBox: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderColor: Colors.border,
  },
  video: { width: '100%', height: 240 },
  photo: { width: '100%', height: 300 },

  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 16, paddingHorizontal: 20,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderColor: Colors.border,
  },
  statItem: { alignItems: 'center', gap: 3 },
  statVal: { fontSize: 16, fontWeight: '800', color: Colors.text },
  statLab: { fontSize: 11, color: Colors.text3 },

  section: {
    marginHorizontal: 20, marginTop: 24,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.text2, letterSpacing: 0.4 },
  editLink: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  itemTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, lineHeight: 28 },

  inputInline: {
    backgroundColor: Colors.surface2, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.accent,
    padding: 12, color: Colors.text, fontSize: 15,
  },
  inputMulti: { height: 140, textAlignVertical: 'top', paddingTop: 10 },

  noteActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cancelNoteBtn: {
    flex: 1, paddingVertical: 10, borderRadius: Radius.sm,
    backgroundColor: Colors.surface3, alignItems: 'center',
  },
  cancelNoteBtnText: { color: Colors.text2, fontWeight: '600' },
  saveNoteBtn: {
    flex: 1, paddingVertical: 10, borderRadius: Radius.sm,
    backgroundColor: Colors.accent, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  saveNoteBtnText: { color: Colors.bg, fontWeight: '700' },

  noteDisplay: {
    backgroundColor: Colors.surface2, borderRadius: Radius.sm,
    padding: 14, borderLeftWidth: 3, borderLeftColor: Colors.accent,
  },
  noteText: {
    fontSize: 15, color: Colors.text, lineHeight: 24,
    fontStyle: 'italic',
  },
  notePlaceholder: {
    fontSize: 14, color: Colors.text3, lineHeight: 22, fontStyle: 'italic',
  },
  savedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 8,
  },
  savedBadgeText: { fontSize: 12, color: Colors.green, fontWeight: '600' },

  comprehendBlock: {
    margin: 20, marginBottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 18, borderWidth: 1.5, borderColor: Colors.border,
    gap: 12,
  },
  comprehendBlockDone: {
    borderColor: Colors.green, backgroundColor: Colors.greenDim,
  },
  comprehendTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  comprehendTitleDone: { color: Colors.green },
  comprehendSub: { fontSize: 12, color: Colors.text3, lineHeight: 18, flex: 1 },

  motivCard: {
    margin: 20,
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    padding: 18, borderLeftWidth: 4, borderLeftColor: Colors.accentDim,
  },
  motivQuote: {
    fontSize: 14, color: Colors.text2, fontStyle: 'italic', lineHeight: 22,
  },
  motivBy: { fontSize: 12, color: Colors.accent, fontWeight: '700', marginTop: 8 },
});
