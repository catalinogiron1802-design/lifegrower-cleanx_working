import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useFocusEffect } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useThreadsSheet } from '../context/ThreadsSheetContext';
import { Folder, FolderStorage, MediaItem, Storage } from '../store/storage';
import { useServerUrl } from '../utils/serverConfig';
import { Colors, Radius, Shadow } from '../utils/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

type FilterType = 'all' | 'video' | 'photo' | 'comprehended' | 'todo';
const HIDDEN_FOLDER = '__hidden__';
const ARCHIVED_FOLDER = '__archived__';

const FILTERS: { key: FilterType; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'video', label: 'Videos', icon: 'film-outline' },
  { key: 'photo', label: 'Photos', icon: 'image-outline' },
  { key: 'todo', label: 'To Learn', icon: 'time-outline' },
  { key: 'comprehended', label: 'Mastered', icon: 'checkmark-circle-outline' },
];

const FOLDER_EMOJIS = ['🎵', '🚀', '🤝', '💻', '🌍', '📚', '🎯', '💡', '🏋️', '🎨', '🧠', '💰', '❤️', '🌱', '⚡'];

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ─────────────────────────────────────────────────────────────────────────────
// MediaCard — memoized so it only re-renders when its own props change
// ─────────────────────────────────────────────────────────────────────────────
interface MediaCardProps {
  item: MediaItem;
  isSelected: boolean;
  selectMode: boolean;
  activeFolderId: string | null | 'all';
  onPress: () => void;
  onLongPress: () => void;
  onComprehend: () => void;
}

const MediaCard = React.memo(({
  item,
  isSelected,
  selectMode,
  activeFolderId,
  onPress,
  onLongPress,
  onComprehend,
}: MediaCardProps) => (
  <TouchableOpacity
    style={[styles.card, isSelected && styles.cardSelected]}
    activeOpacity={0.85}
    onPress={onPress}
    onLongPress={onLongPress}
    delayLongPress={350}
  >
    {/* Selection overlay */}
    {selectMode && (
      <View style={styles.selectOverlay} pointerEvents="none">
        <View style={[styles.selectCircle, isSelected && styles.selectCircleActive]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </View>
    )}

    <View style={[styles.thumbBox, isSelected && styles.thumbSelected]}>
      {item.type === 'photo' && item.uri ? (
        <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
      ) : item.type === 'video' && item.thumbnailUri ? (
        <View>
          <Image source={{ uri: item.thumbnailUri }} style={styles.thumb} resizeMode="cover" />
          <View style={styles.playOverlay}>
            <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.9)" />
          </View>
        </View>
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons
            name={item.type === 'video' ? 'play-circle' : 'image-outline'}
            size={36}
            color={item.type === 'video' ? Colors.accent : Colors.blue}
          />
        </View>
      )}
      <View style={styles.typeBadge}>
        <Ionicons
          name={item.type === 'video' ? 'play-circle' : 'image'}
          size={14}
          color={item.type === 'video' ? Colors.accent : Colors.blue}
        />
      </View>
      {item.watchCount > 0 && (
        <View style={styles.watchBadge}>
          <Text style={styles.watchText}>×{item.watchCount}</Text>
        </View>
      )}
      {item.comprehended && (
        <View style={styles.comprehendBadge}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />
        </View>
      )}
      {item.archived && activeFolderId !== ARCHIVED_FOLDER && (
        <View style={styles.archivedBadge}>
          <Ionicons name="archive-outline" size={12} color={Colors.text3} />
        </View>
      )}
    </View>

    <View style={styles.cardBody}>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title || 'Untitled'}</Text>
      {item.note ? (
        <Text style={styles.cardNote} numberOfLines={2}>"{item.note}"</Text>
      ) : null}
    </View>

    {!selectMode && (
      <TouchableOpacity
        style={[styles.comprehendBtn, item.comprehended && styles.comprehendBtnDone]}
        onPress={onComprehend}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={item.comprehended ? 'checkmark-circle' : 'ellipse-outline'}
          size={18}
          color={item.comprehended ? Colors.green : Colors.text3}
        />
        <Text style={[styles.comprehendLabel, item.comprehended && styles.comprehendLabelDone]}>
          {item.comprehended ? 'Got it!' : 'To learn'}
        </Text>
      </TouchableOpacity>
    )}
  </TouchableOpacity>
));

// ─────────────────────────────────────────────────────────────────────────────
// LibraryScreen
// ─────────────────────────────────────────────────────────────────────────────
interface LibraryScreenProps {
  isActive: boolean;
  // Height of the floating tab bar overlay, so the multi-select action bar
  // (also absolutely positioned at the bottom) sits above it instead of
  // being hidden underneath it.
  bottomInset?: number;
}

export default function LibraryScreen({ isActive, bottomInset = 0 }: LibraryScreenProps) {
  const SERVER_URL = useServerUrl();
  const { composeWithPhotos } = useThreadsSheet();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null | 'all'>('all');
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // ── Multi-select state ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [backupProgress, setBackupProgress] = useState<{ done: number; total: number } | null>(null);

  // ── New folder modal ──
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderEmoji, setNewFolderEmoji] = useState('📁');

  const load = useCallback(async () => {
    const [allItems, allFolders] = await Promise.all([
      Storage.getAll(),
      FolderStorage.getAll(),
    ]);
    setItems(allItems);
    setFolders(allFolders);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!isActive) return;
    load();
  }, [isActive, load]));

  // Backfill thumbnails for existing videos that don't have one yet
  useFocusEffect(useCallback(() => {
    if (!isActive) return;
    const backfill = async () => {
      const all = await Storage.getAll();
      const missing = all.filter(i => i.type === 'video' && !i.thumbnailUri && i.uri);
      if (missing.length === 0) return;

      for (const item of missing) {
        try {
          let localUri = item.uri;
          if (localUri.startsWith('http://') || localUri.startsWith('https://')) {
            const ext = localUri.split('.').pop()?.split('?')[0] || 'mp4';
            const dest = FileSystem.documentDirectory + `thumb_src_${item.id}.${ext}`;
            const info = await FileSystem.getInfoAsync(dest);
            if (!info.exists) {
              const dl = await FileSystem.downloadAsync(localUri, dest);
              localUri = dl.uri;
            } else {
              localUri = dest;
            }
            await Storage.updateItem(item.id, { uri: localUri });
          }

          let thumbUri: string | null = null;
          for (const t of [0, 500, 1000, 2000]) {
            try {
              const result = await VideoThumbnails.getThumbnailAsync(localUri, { time: t, quality: 0.7 });
              thumbUri = result.uri;
              break;
            } catch { /* try next timestamp */ }
          }
          if (thumbUri) {
            await Storage.updateItem(item.id, { thumbnailUri: thumbUri });
          }
        } catch { /* skip */ }
      }
      load();
    };
    backfill();
  }, [isActive, load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ── Derived data — all memoized ─────────────────────────────────────────────
  const folderItems = useMemo(() => {
    if (activeFolderId === HIDDEN_FOLDER) return items.filter(i => i.hidden);
    if (activeFolderId === ARCHIVED_FOLDER) return items.filter(i => i.archived && !i.hidden);
    const visible = items.filter(i => !i.hidden && !i.archived);
    if (activeFolderId === 'all') return visible;
    if (activeFolderId === null) return visible.filter(i => !i.folderId);
    return visible.filter(i => i.folderId === activeFolderId);
  }, [items, activeFolderId]);

  const filtered = useMemo(() => folderItems.filter(item => {
    const matchSearch =
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      (item.note || '').toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'video') return item.type === 'video';
    if (filter === 'photo') return item.type === 'photo';
    if (filter === 'comprehended') return item.comprehended;
    if (filter === 'todo') return !item.comprehended;
    return true;
  }), [folderItems, search, filter]);

  // Rows for the 2-column grid — only recomputed when filtered list changes
  const rows = useMemo(() => {
    const result: MediaItem[][] = [];
    for (let i = 0; i < filtered.length; i += 2) {
      result.push(filtered.slice(i, i + 2));
    }
    return result;
  }, [filtered]);

  const totalWatches = useMemo(() =>
    items.filter(i => !i.hidden && !i.archived).reduce((s, i) => s + (i.watchCount || 0), 0),
    [items]);
  const comprehendedCount = useMemo(() =>
    items.filter(i => !i.hidden && !i.archived && i.comprehended).length,
    [items]);
  const visibleCount = useMemo(() =>
    items.filter(i => !i.hidden && !i.archived).length,
    [items]);

  const activeFolder = useMemo(() =>
    activeFolderId === 'all' ? null
      : activeFolderId === null ? { name: 'Uncategorized', emoji: '📂' }
        : activeFolderId === HIDDEN_FOLDER ? { name: 'Hidden', emoji: '🙈' }
          : activeFolderId === ARCHIVED_FOLDER ? { name: 'Archive', emoji: '🗃️' }
            : folders.find(f => f.id === activeFolderId),
    [activeFolderId, folders]);

  // ── Multi-select helpers ────────────────────────────────────────────────────
  const enterSelectMode = useCallback((item: MediaItem) => {
    setSelectMode(true);
    setSelectedIds(new Set([item.id]));
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map(i => i.id)));
  }, [filtered]);

  // ── Bulk actions ────────────────────────────────────────────────────────────
  const bulkDelete = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(
      `Delete ${count} item${count > 1 ? 's' : ''}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await Storage.bulkDelete([...selectedIds]);
            exitSelectMode();
            load();
          },
        },
      ]
    );
  }, [selectedIds, exitSelectMode, load]);

  const bulkArchive = useCallback(async () => {
    const isInArchive = activeFolderId === ARCHIVED_FOLDER;
    await Storage.bulkUpdate([...selectedIds], {
      archived: !isInArchive,
      ...(isInArchive ? { folderId: null } : {}),
    });
    exitSelectMode();
    load();
  }, [selectedIds, activeFolderId, exitSelectMode, load]);

  const bulkHide = useCallback(async () => {
    const isInHidden = activeFolderId === HIDDEN_FOLDER;
    await Storage.bulkUpdate([...selectedIds], { hidden: !isInHidden });
    exitSelectMode();
    load();
  }, [selectedIds, activeFolderId, exitSelectMode, load]);

  const bulkMoveTo = useCallback(async (folderId: string | null) => {
    await Storage.bulkUpdate([...selectedIds], {
      folderId,
      hidden: false,
      archived: false,
    });
    setShowMoveModal(false);
    exitSelectMode();
    load();
  }, [selectedIds, exitSelectMode, load]);

  const bulkBackupToPC = useCallback(async () => {
    const selected = items.filter(i => selectedIds.has(i.id));
    if (selected.length === 0) return;

    setBackupProgress({ done: 0, total: selected.length });
    const failed: string[] = [];
    let done = 0;

    for (const item of selected) {
      try {
        const ext  = item.uri.split('.').pop()?.split('?')[0] || (item.type === 'video' ? 'mp4' : 'jpg');
        const safe = (item.title || item.id).trim().replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 60) || item.id;
        const name = `${safe}.${ext}`;

        const result = await FileSystem.uploadAsync(
          `${SERVER_URL}/upload?name=${encodeURIComponent(name)}`,
          item.uri,
          { httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT }
        );
        if (result.status < 200 || result.status >= 300) {
          throw new Error(`status ${result.status}`);
        }
      } catch {
        failed.push(item.title || item.id);
      }
      done++;
      setBackupProgress({ done, total: selected.length });
    }

    setBackupProgress(null);
    if (failed.length === 0) {
      Alert.alert('☁️ Backup complete', `${selected.length} item${selected.length > 1 ? 's' : ''} sent to your PC's sync folder.`);
    } else {
      Alert.alert(
        'Backup finished with errors',
        `${selected.length - failed.length} succeeded, ${failed.length} failed:\n${failed.join(', ')}\n\nCheck Wi-Fi and that server.js is running.`
      );
    }
    exitSelectMode();
  }, [items, selectedIds, exitSelectMode]);

  const bulkAddToThread = useCallback(() => {
    const selected = items.filter(i => selectedIds.has(i.id));
    const photoUris = selected.filter(i => i.type === 'photo').map(i => i.uri);
    if (photoUris.length === 0) {
      Alert.alert('No photos selected', 'Only photos can be added to a Threads post — select at least one photo.');
      return;
    }
    exitSelectMode();
    composeWithPhotos(photoUris);
  }, [items, selectedIds, exitSelectMode, composeWithPhotos]);

  const toggleComprehend = useCallback(async (item: MediaItem) => {
    await Storage.updateItem(item.id, { comprehended: !item.comprehended });
    load();
  }, [load]);

  // ── Folder management ───────────────────────────────────────────────────────
  const handleDeleteFolder = useCallback((folder: Folder) => {
    const count = items.filter(i => i.folderId === folder.id).length;
    Alert.alert(
      `Delete "${folder.name}"?`,
      count > 0
        ? `${count} item${count > 1 ? 's' : ''} will be moved to Uncategorized.`
        : 'This folder is empty.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await FolderStorage.deleteFolder(folder.id);
            if (activeFolderId === folder.id) setActiveFolderId('all');
            load();
          },
        },
      ]
    );
  }, [items, activeFolderId, load]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    const folder: Folder = {
      id: generateId(),
      name: newFolderName.trim(),
      emoji: newFolderEmoji,
      createdAt: Date.now(),
    };
    await FolderStorage.addFolder(folder);
    setNewFolderName('');
    setNewFolderEmoji('📁');
    setShowNewFolder(false);
    load();
  }, [newFolderName, newFolderEmoji, load]);

  // ── Folder chip renderer ────────────────────────────────────────────────────
  const renderFolderChip = useCallback((folder: Folder) => {
    const count = items.filter(i => i.folderId === folder.id && !i.hidden && !i.archived).length;
    const isFolderActive = activeFolderId === folder.id;
    return (
      <TouchableOpacity
        key={folder.id}
        style={[styles.folderChip, isFolderActive && styles.folderChipActive]}
        onPress={() => { setActiveFolderId(folder.id); setFilter('all'); exitSelectMode(); }}
        onLongPress={() => handleDeleteFolder(folder)}
      >
        <Text style={styles.folderEmoji}>{folder.emoji}</Text>
        <Text style={[styles.folderName, isFolderActive && styles.folderNameActive]} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={[styles.folderCount, isFolderActive && styles.folderCountActive]}>{count}</Text>
      </TouchableOpacity>
    );
  }, [items, activeFolderId, exitSelectMode, handleDeleteFolder]);

  // ── List header — useCallback so it's not recreated every render ────────────
  const ListHeader = useCallback(() => (
    <View>
      {/* App header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>LifeGrower 🌱</Text>
          <Text style={styles.headerSub}>Your personal growth library</Text>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.statPill}>
            <Ionicons name="eye-outline" size={12} color={Colors.accent} />
            <Text style={styles.statText}>{totalWatches}</Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="checkmark-circle-outline" size={12} color={Colors.green} />
            <Text style={styles.statText}>{comprehendedCount}/{visibleCount}</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={Colors.text3} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your collection…"
          placeholderTextColor={Colors.text3}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.text3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Folders */}
      <Text style={styles.sectionLabel}>Folders</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.folderRow}
      >
        {/* All */}
        <TouchableOpacity
          style={[styles.folderChip, activeFolderId === 'all' && styles.folderChipActive]}
          onPress={() => { setActiveFolderId('all'); setFilter('all'); exitSelectMode(); }}
        >
          <Text style={styles.folderEmoji}>🗂️</Text>
          <Text style={[styles.folderName, activeFolderId === 'all' && styles.folderNameActive]}>All</Text>
          <Text style={[styles.folderCount, activeFolderId === 'all' && styles.folderCountActive]}>
            {visibleCount}
          </Text>
        </TouchableOpacity>

        {folders.map(renderFolderChip)}

        {/* Uncategorized */}
        {items.some(i => !i.folderId && !i.hidden && !i.archived) && (
          <TouchableOpacity
            style={[styles.folderChip, activeFolderId === null && styles.folderChipActive]}
            onPress={() => { setActiveFolderId(null); setFilter('all'); exitSelectMode(); }}
          >
            <Text style={styles.folderEmoji}>📂</Text>
            <Text style={[styles.folderName, activeFolderId === null && styles.folderNameActive]}>
              Uncategorized
            </Text>
            <Text style={[styles.folderCount, activeFolderId === null && styles.folderCountActive]}>
              {items.filter(i => !i.folderId && !i.hidden && !i.archived).length}
            </Text>
          </TouchableOpacity>
        )}

        {/* Archive virtual folder */}
        {items.some(i => i.archived && !i.hidden) && (
          <TouchableOpacity
            style={[styles.folderChip, activeFolderId === ARCHIVED_FOLDER && styles.folderChipActive]}
            onPress={() => { setActiveFolderId(ARCHIVED_FOLDER); setFilter('all'); exitSelectMode(); }}
          >
            <Text style={styles.folderEmoji}>🗃️</Text>
            <Text style={[styles.folderName, activeFolderId === ARCHIVED_FOLDER && styles.folderNameActive]}>
              Archive
            </Text>
            <Text style={[styles.folderCount, activeFolderId === ARCHIVED_FOLDER && styles.folderCountActive]}>
              {items.filter(i => i.archived && !i.hidden).length}
            </Text>
          </TouchableOpacity>
        )}

        {/* Hidden virtual folder */}
        {items.some(i => i.hidden) && (
          <TouchableOpacity
            style={[styles.folderChip, activeFolderId === HIDDEN_FOLDER && styles.folderChipActive]}
            onPress={() => { setActiveFolderId(HIDDEN_FOLDER); setFilter('all'); exitSelectMode(); }}
          >
            <Text style={styles.folderEmoji}>🙈</Text>
            <Text style={[styles.folderName, activeFolderId === HIDDEN_FOLDER && styles.folderNameActive]}>
              Hidden
            </Text>
            <Text style={[styles.folderCount, activeFolderId === HIDDEN_FOLDER && styles.folderCountActive]}>
              {items.filter(i => i.hidden).length}
            </Text>
          </TouchableOpacity>
        )}

        {/* New folder */}
        <TouchableOpacity
          style={styles.addFolderChip}
          onPress={() => setShowNewFolder(true)}
        >
          <Ionicons name="add" size={18} color={Colors.accent} />
          <Text style={styles.addFolderLabel}>New</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Active folder label */}
      {activeFolderId !== 'all' && activeFolder && (
        <View style={styles.activeFolderBar}>
          <Text style={styles.activeFolderTitle}>
            {(activeFolder as any).emoji}  {(activeFolder as any).name}
          </Text>
          <TouchableOpacity onPress={() => { setActiveFolderId('all'); setFilter('all'); }}>
            <Ionicons name="close-circle" size={18} color={Colors.text3} />
          </TouchableOpacity>
        </View>
      )}

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Ionicons
              name={f.icon as any}
              size={13}
              color={filter === f.key ? Colors.bg : Colors.text2}
            />
            <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🌱</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySub}>
            {search
              ? 'Try a different search term'
              : activeFolderId !== 'all'
                ? 'No items in this folder yet.'
                : 'Tap the + tab to add your first growth video or photo'}
          </Text>
        </View>
      )}
    </View>
  ), [
    search, filter, activeFolderId, folders, items,
    filtered, totalWatches, comprehendedCount, visibleCount,
    activeFolder, renderFolderChip, exitSelectMode,
  ]);

  const isInSpecialFolder = activeFolderId === HIDDEN_FOLDER || activeFolderId === ARCHIVED_FOLDER;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      <FlatList
        data={rows}
        // Stable key using the item IDs in each row
        keyExtractor={(row) => row.map(i => i.id).join('-')}
        ListHeaderComponent={ListHeader}
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            {row.map(item => (
              <MediaCard
                key={item.id}
                item={item}
                isSelected={selectedIds.has(item.id)}
                selectMode={selectMode}
                activeFolderId={activeFolderId}
                onPress={() => {
                  if (selectMode) toggleSelect(item.id);
                  else router.push({ pathname: '/detail', params: { id: item.id } });
                }}
                onLongPress={() => { if (!selectMode) enterSelectMode(item); }}
                onComprehend={() => toggleComprehend(item)}
              />
            ))}
            {row.length === 1 && <View style={styles.cardPlaceholder} />}
          </View>
        )}
        contentContainerStyle={[styles.grid, selectMode && { paddingBottom: 120 + bottomInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
      />

      {/* ── Multi-select action bar ── */}
      {selectMode && (
        <View style={[styles.actionBar, { bottom: bottomInset }]}>
          <View style={styles.actionBarTop}>
            <TouchableOpacity onPress={exitSelectMode} style={styles.actionCancel}>
              <Ionicons name="close" size={20} color={Colors.text2} />
            </TouchableOpacity>
            <Text style={styles.actionCount}>{selectedIds.size} selected</Text>
            <TouchableOpacity onPress={selectAll} style={styles.actionSelectAll}>
              <Text style={styles.actionSelectAllText}>Select All</Text>
            </TouchableOpacity>
          </View>

          {backupProgress && (
            <View style={styles.backupProgressRow}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={styles.backupProgressText}>
                Backing up to PC… {backupProgress.done}/{backupProgress.total}
              </Text>
            </View>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionBtns}
          >
            <TouchableOpacity
              style={[styles.actionBtn, (selectedIds.size === 0 || !!backupProgress) && styles.actionBtnDisabled]}
              onPress={bulkBackupToPC}
              disabled={selectedIds.size === 0 || !!backupProgress}
            >
              <Ionicons name="cloud-upload-outline" size={22} color={Colors.accent} />
              <Text style={[styles.actionBtnLabel, { color: Colors.accent }]}>Backup</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
              onPress={bulkAddToThread}
              disabled={selectedIds.size === 0}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={Colors.accent} />
              <Text style={[styles.actionBtnLabel, { color: Colors.accent }]}>Thread</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
              onPress={bulkDelete}
              disabled={selectedIds.size === 0}
            >
              <Ionicons name="trash-outline" size={22} color={Colors.red} />
              <Text style={[styles.actionBtnLabel, { color: Colors.red }]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
              onPress={bulkArchive}
              disabled={selectedIds.size === 0}
            >
              <Ionicons
                name="archive-outline"
                size={22}
                color={isInSpecialFolder && activeFolderId === ARCHIVED_FOLDER ? Colors.accent : Colors.text2}
              />
              <Text style={styles.actionBtnLabel}>
                {activeFolderId === ARCHIVED_FOLDER ? 'Unarchive' : 'Archive'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
              onPress={() => setShowMoveModal(true)}
              disabled={selectedIds.size === 0}
            >
              <Ionicons name="folder-open-outline" size={22} color={Colors.text2} />
              <Text style={styles.actionBtnLabel}>Move</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
              onPress={bulkHide}
              disabled={selectedIds.size === 0}
            >
              <Ionicons
                name={activeFolderId === HIDDEN_FOLDER ? 'eye-outline' : 'eye-off-outline'}
                size={22}
                color={Colors.text2}
              />
              <Text style={styles.actionBtnLabel}>
                {activeFolderId === HIDDEN_FOLDER ? 'Unhide' : 'Hide'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ── Move to folder modal ── */}
      <Modal
        visible={showMoveModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoveModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMoveModal(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Move to Folder</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.folderOption} onPress={() => bulkMoveTo(null)}>
              <Text style={styles.folderOptionEmoji}>📂</Text>
              <Text style={styles.folderOptionName}>Uncategorized</Text>
            </TouchableOpacity>
            {folders.map(f => (
              <TouchableOpacity
                key={f.id}
                style={styles.folderOption}
                onPress={() => bulkMoveTo(f.id)}
              >
                <Text style={styles.folderOptionEmoji}>{f.emoji}</Text>
                <Text style={styles.folderOptionName}>{f.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── New Folder Modal ── */}
      <Modal
        visible={showNewFolder}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewFolder(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowNewFolder(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>New Folder</Text>

          <Text style={styles.modalLabel}>Pick an emoji</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
            {FOLDER_EMOJIS.map(e => (
              <TouchableOpacity
                key={e}
                style={[styles.emojiBtn, newFolderEmoji === e && styles.emojiBtnActive]}
                onPress={() => setNewFolderEmoji(e)}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.modalLabel}>Folder name</Text>
          <TextInput
            style={styles.modalInput}
            value={newFolderName}
            onChangeText={setNewFolderName}
            placeholder="e.g. Motivation, Health…"
            placeholderTextColor={Colors.text3}
            maxLength={30}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.modalBtn, !newFolderName.trim() && styles.modalBtnDisabled]}
            onPress={handleCreateFolder}
            disabled={!newFolderName.trim()}
          >
            <Ionicons name="folder-open-outline" size={18} color={Colors.bg} />
            <Text style={styles.modalBtnText}>Create Folder</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28, fontWeight: '800', color: Colors.text,
    fontFamily: 'Georgia', letterSpacing: 0.5,
  },
  headerSub: { fontSize: 13, color: Colors.text3, marginTop: 2 },
  headerStats: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statPill: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    backgroundColor: Colors.surface2, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  statText: { fontSize: 12, color: Colors.text2, fontWeight: '600' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    marginHorizontal: 16, marginBottom: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: Colors.text, fontSize: 15 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.text3,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 16, marginBottom: 10,
  },
  folderRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  folderChip: {
    alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.surface,
    minWidth: 72,
  },
  folderChipActive: { backgroundColor: Colors.accentGlow, borderColor: Colors.accent },
  folderEmoji: { fontSize: 22 },
  folderName: { fontSize: 11, fontWeight: '700', color: Colors.text2, textAlign: 'center' },
  folderNameActive: { color: Colors.accent },
  folderCount: {
    fontSize: 11, color: Colors.text3, fontWeight: '600',
    backgroundColor: Colors.surface2, borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  folderCountActive: { backgroundColor: Colors.accentDim, color: Colors.accent },
  addFolderChip: {
    alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radius.md, borderWidth: 1.5,
    borderColor: Colors.accent, borderStyle: 'dashed',
    backgroundColor: Colors.accentGlow, minWidth: 60,
  },
  addFolderLabel: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  activeFolderBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.accentDim,
  },
  activeFolderTitle: { fontSize: 15, fontWeight: '700', color: Colors.accent },

  filterRow: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  filterChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterLabel: { fontSize: 13, color: Colors.text2, fontWeight: '600' },
  filterLabelActive: { color: Colors.bg },

  grid: { paddingHorizontal: 16, paddingBottom: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },

  // ── Cards ──
  card: {
    width: CARD_WIDTH, backgroundColor: Colors.surface,
    borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.card,
  },
  cardSelected: { borderColor: Colors.accent, borderWidth: 2 },
  cardPlaceholder: { width: CARD_WIDTH },

  selectOverlay: { position: 'absolute', top: 8, left: 8, zIndex: 10 },
  selectCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  selectCircleActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },

  thumbBox: { position: 'relative' },
  thumbSelected: { opacity: 0.75 },
  thumb: { width: '100%', height: 120 },
  thumbPlaceholder: {
    backgroundColor: Colors.surface2,
    justifyContent: 'center', alignItems: 'center',
  },
  playOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  typeBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.full, padding: 4,
  },
  watchBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(240,192,96,0.9)',
    borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2,
  },
  watchText: { fontSize: 11, fontWeight: '700', color: Colors.bg },
  comprehendBadge: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: Colors.bg, borderRadius: Radius.full,
  },
  archivedBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: Colors.surface2, borderRadius: Radius.full, padding: 3,
  },
  cardBody: { padding: 10, paddingBottom: 6 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, lineHeight: 18 },
  cardNote: {
    fontSize: 11, color: Colors.text3, fontStyle: 'italic',
    marginTop: 4, lineHeight: 16,
  },
  comprehendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    margin: 8, marginTop: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.full, backgroundColor: Colors.surface2,
    alignSelf: 'flex-start',
  },
  comprehendBtnDone: { backgroundColor: Colors.greenDim },
  comprehendLabel: { fontSize: 11, color: Colors.text3, fontWeight: '600' },
  comprehendLabelDone: { color: Colors.green },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, paddingBottom: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: Colors.text3, textAlign: 'center', lineHeight: 22 },

  // ── Multi-select action bar ──
  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingBottom: 24, paddingTop: 12, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 16,
  },
  actionBarTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  actionCancel: { padding: 4 },
  actionCount: { fontSize: 15, fontWeight: '700', color: Colors.text },
  actionSelectAll: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentGlow,
    borderWidth: 1, borderColor: Colors.accentDim,
  },
  actionSelectAllText: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  backupProgressRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginBottom: 12,
  },
  backupProgressText: { fontSize: 12, color: Colors.text2, fontWeight: '600' },
  actionBtns: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    gap: 10, flexGrow: 1, minWidth: '100%',
  },
  actionBtn: {
    alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    minWidth: 70,
  },
  actionBtnDisabled: { opacity: 0.35 },
  actionBtnLabel: { fontSize: 11, fontWeight: '700', color: Colors.text2 },

  // ── Modals ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, maxHeight: '70%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 16 },
  modalLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.text3,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
  },
  folderOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  folderOptionEmoji: { fontSize: 26 },
  folderOptionName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  emojiRow: { marginBottom: 20 },
  emojiBtn: {
    width: 44, height: 44, borderRadius: 12, marginRight: 8,
    backgroundColor: Colors.surface2, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  emojiBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentGlow },
  emojiText: { fontSize: 22 },
  modalInput: {
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    color: Colors.text, fontSize: 16, marginBottom: 20,
  },
  modalBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  modalBtnDisabled: { opacity: 0.4 },
  modalBtnText: { fontSize: 16, fontWeight: '800', color: Colors.bg },
});
