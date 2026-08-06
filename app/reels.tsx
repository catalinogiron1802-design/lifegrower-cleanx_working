import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity,
  StatusBar, Alert, Platform, ScrollView, Modal, PanResponder,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, router } from 'expo-router';
import { Colors, Radius } from '../src/utils/theme';
import { Storage, FolderStorage, MediaItem, Folder } from '../src/store/storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabBarStyle } from './_layout';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const ITEM_HEIGHT = SCREEN_H;

const HIDDEN_FOLDER   = '__hidden__';
const ARCHIVED_FOLDER = '__archived__';

interface ReelItemProps {
  item: MediaItem;
  isActive: boolean;
  screenFocused: boolean;
  selectMode: boolean;
  isSelected: boolean;
  folders: Folder[];
  onWatched: (id: string) => void;
  onComprehend: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
  onLongPress: (item: MediaItem) => void;
  onTapInSelectMode: (id: string) => void;
  onMove: (item: MediaItem, folderId: string | null) => void;
}

// Video dimensions are a property of the file, not of whether this
// particular reel happens to be active right now — caching them here (keyed
// by item.id, for the life of the app) means they're only ever detected
// once, instead of being thrown away and re-detected via the player's
// flaky/racy track-resolution events every time a reel is revisited.
const videoSizeCache = new Map<string, { width: number; height: number }>();

const ReelItem = React.memo(function ReelItem({
  item, isActive, screenFocused,
  selectMode, isSelected,
  folders,
  onWatched, onComprehend, onDelete, onLongPress, onTapInSelectMode, onMove,
}: ReelItemProps) {
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(
    () => videoSizeCache.get(item.id) ?? null
  );
  const [retryKey, setRetryKey] = useState(0);
  const [showControls, setShowControls] = useState(false);

  // ── Move folder sheet state (per-reel) ─────────────────────────────────────
  const [showMoveSheet, setShowMoveSheet] = useState(false);

  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchedRef = useRef(false);
  const lastTapRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const flashControls = () => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;
    if (delta < 600) flashControls();
  };

  const seek = (seconds: number) => {
    if (!player) return;
    try {
      player.currentTime = Math.max(0, player.currentTime + seconds);
    } catch (_) {}
  };

  const isLandscape = videoSize ? videoSize.width > videoSize.height : false;
  const videoHeight = (() => {
    if (!videoSize || !isLandscape) return SCREEN_H;
    const ratio = videoSize.height / videoSize.width;
    const h = SCREEN_W * ratio;
    return Math.min(SCREEN_H * 0.80, Math.max(SCREEN_H * 0.35, h));
  })();

  const player = useVideoPlayer(
    isActive ? { uri: item.uri } : null,
    p => {
      if (!p) return;
      try { p.loop = true; p.muted = muted; } catch (_) {}
    }
  );

  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  React.useEffect(() => {
    if (!player) return;

    // Writes through to the module-level cache so this video's size is only
    // ever detected once, not re-detected (and potentially re-detected
    // wrong) every time this reel is revisited.
    const applySize = (width?: number, height?: number) => {
      if (!width || !height) return;
      videoSizeCache.set(item.id, { width, height });
      if (mountedRef.current) setVideoSize({ width, height });
    };

    const sub = player.addListener('statusChange', ({ status: s, error }: any) => {
      if (!mountedRef.current) return;
      if (s === 'error') setErrorMsg(error?.message ?? String(error) ?? 'Unknown error');
    });
    const sub2 = player.addListener('videoTrackChange', ({ videoTrack }: any) => {
      applySize(videoTrack?.size?.width, videoTrack?.size?.height);
    });

    // The track can resolve before this effect subscribes (the player is
    // recreated from scratch every time a reel becomes active), which would
    // silently miss the videoTrackChange event above. Check the already-
    // current track as a fallback so we don't depend on winning that race.
    try {
      const vt: any = (player as any).videoTrack;
      applySize(vt?.size?.width, vt?.size?.height);
    } catch (_) {}

    return () => { sub.remove(); sub2.remove(); };
  }, [player, item.id]);

  React.useEffect(() => {
    if (isActive) {
      setPaused(false);
      setErrorMsg(null);
      watchedRef.current = false;
    } else {
      try { player?.pause(); } catch (_) {}
    }
  }, [isActive]);

  React.useEffect(() => {
    if (!player) return;
    try {
      if (isActive && screenFocused && !paused && !selectMode) player.play();
      else player.pause();
    } catch (_) {}
  }, [isActive, screenFocused, paused, selectMode, player]);

  React.useEffect(() => {
    if (!player) return;
    try { player.muted = muted; } catch (_) {}
  }, [muted, player]);

  React.useEffect(() => {
    if (!isActive || !player) return;
    const interval = setInterval(() => {
      if (!mountedRef.current) { clearInterval(interval); return; }
      try {
        if (player.currentTime > 5 && !watchedRef.current) {
          watchedRef.current = true;
          onWatched(item.id);
        }
      } catch (_) {}
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, player]);

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
      try { player?.pause(); } catch (_) {}
    };
  }, [player]);

  const handleRetry = () => {
    setErrorMsg(null);
    setVideoSize(null);
    setRetryKey(k => k + 1);
  };

  const handleDelete = () => {
    Alert.alert('Delete this reel?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(item) },
    ]);
  };

  // Current folder name shown on the Move button
  const currentFolder = item.folderId
    ? folders.find(f => f.id === item.folderId)
    : null;

  return (
    <View style={styles.reel}>
      <StatusBar hidden />

      {/* Main video tap area */}
      <TouchableOpacity
        activeOpacity={1}
        style={styles.videoWrapper}
        onPressIn={() => { if (!selectMode) handleDoubleTap(); }}
        onPress={() => { if (selectMode) onTapInSelectMode(item.id); }}
      >
        {isActive && player ? (
          <VideoView
            key={retryKey}
            player={player}
            style={isLandscape ? { width: SCREEN_W, height: videoHeight } : styles.video}
            contentFit={isLandscape ? 'contain' : 'cover'}
            nativeControls={false}
          />
        ) : (
          <View style={[styles.video, styles.videoPlaceholder]} />
        )}
      </TouchableOpacity>

      {/* Paused overlay */}
      {paused && !errorMsg && isActive && !selectMode && !showControls && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Ionicons name="play" size={72} color="rgba(255,255,255,0.85)" />
        </View>
      )}

      {/* Seek controls */}
      {isActive && !errorMsg && !selectMode && showControls && (
        <View style={styles.seekRow} pointerEvents="box-none">
          <TouchableOpacity style={styles.seekBtn} onPress={() => { seek(-5); flashControls(); }}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
            <Ionicons name="play-back" size={32} color="#fff" />
            <Text style={styles.seekLabel}>5s</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.seekPlayBtn} onPress={() => { setPaused(p => !p); flashControls(); }}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
            <Ionicons name={paused ? 'play' : 'pause'} size={40} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.seekBtn} onPress={() => { seek(5); flashControls(); }}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
            <Ionicons name="play-forward" size={32} color="#fff" />
            <Text style={styles.seekLabel}>5s</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Select mode overlay */}
      {selectMode && (
        <View style={[styles.selectOverlay, isSelected && styles.selectOverlayActive]} pointerEvents="none">
          <View style={[styles.selectCircle, isSelected && styles.selectCircleActive]}>
            {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
        </View>
      )}

      {/* Error overlay */}
      {errorMsg && (
        <View style={styles.errorOverlay}>
          <Ionicons name="warning-outline" size={36} color="#FF6B6B" />
          <Text style={styles.errorTitle}>Failed to play</Text>
          <Text style={styles.errorDetail} numberOfLines={4}>{errorMsg}</Text>
          <Text style={styles.errorUri} numberOfLines={2}>{item.uri}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <Ionicons name="refresh-outline" size={16} color={Colors.bg} />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom text overlay */}
      <View style={styles.bottomInfo}>
        <View style={styles.titleRow}>
          {item.comprehended && (
            <View style={styles.comprehendedTag}>
              <Ionicons name="checkmark-circle" size={13} color={Colors.bg} />
              <Text style={styles.comprehendedTagText}>Got It</Text>
            </View>
          )}
          <Text style={styles.reelTitle} numberOfLines={2}>{item.title}</Text>
        </View>
        {item.note ? (
          <Text style={styles.reelNote} numberOfLines={3}>"{item.note}"</Text>
        ) : null}
        <View style={styles.metaRow}>
          <Ionicons name="eye-outline" size={13} color="rgba(255,255,255,0.6)" />
          <Text style={styles.metaText}>{item.watchCount} views</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>
            {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
          {currentFolder && (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText}>{currentFolder.emoji} {currentFolder.name}</Text>
            </>
          )}
        </View>
      </View>

      {/* Right sidebar */}
      <TouchableOpacity
        style={styles.sideBar}
        activeOpacity={1}
        onLongPress={() => onLongPress(item)}
        delayLongPress={350}
      >
        {!selectMode ? (
          <>
            <TouchableOpacity style={styles.sideBtn} onPress={() => setMuted(m => !m)}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={26} color="#fff" />
              <Text style={styles.sideBtnLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sideBtn} onPress={() => onComprehend(item)}>
              <Ionicons
                name={item.comprehended ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={30}
                color={item.comprehended ? Colors.accent : '#fff'}
              />
              <Text style={[styles.sideBtnLabel, item.comprehended && { color: Colors.accent }]}>
                {item.comprehended ? 'Got it!' : 'Got it?'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sideBtn}
              onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
            >
              <Ionicons name="journal-outline" size={26} color="#fff" />
              <Text style={styles.sideBtnLabel}>Notes</Text>
            </TouchableOpacity>

            {/* ── Move to folder button ── */}
            <TouchableOpacity style={styles.sideBtn} onPress={() => setShowMoveSheet(true)}>
              <Ionicons
                name="folder-open-outline"
                size={26}
                color={currentFolder ? Colors.accent : '#fff'}
              />
              <Text style={[styles.sideBtnLabel, currentFolder && { color: Colors.accent }]}>
                {currentFolder ? currentFolder.emoji : 'Move'}
              </Text>
            </TouchableOpacity>

            <View style={styles.sideBtn}>
              <View style={styles.watchCountBadge}>
                <Text style={styles.watchCountNum}>{item.watchCount}</Text>
              </View>
              <Text style={styles.sideBtnLabel}>Plays</Text>
            </View>

            <TouchableOpacity style={styles.sideBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={24} color={Colors.red} />
              <Text style={[styles.sideBtnLabel, { color: Colors.red }]}>Delete</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.sideBtn}>
            <Ionicons name="checkmark-done-outline" size={24} color="rgba(255,255,255,0.5)" />
            <Text style={[styles.sideBtnLabel, { color: 'rgba(255,255,255,0.5)' }]}>Select</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Per-reel Move to Folder sheet ── */}
      <Modal
        visible={showMoveSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoveSheet(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMoveSheet(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Move to Folder</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Uncategorized option */}
            <TouchableOpacity
              style={[styles.folderOption, !item.folderId && styles.folderOptionActive]}
              onPress={() => { onMove(item, null); setShowMoveSheet(false); }}
            >
              <Text style={styles.folderOptionEmoji}>📂</Text>
              <View style={styles.folderOptionText}>
                <Text style={styles.folderOptionName}>Uncategorized</Text>
                {!item.folderId && (
                  <Text style={styles.folderOptionCurrent}>Current</Text>
                )}
              </View>
              {!item.folderId && (
                <Ionicons name="checkmark" size={18} color={Colors.accent} />
              )}
            </TouchableOpacity>

            {folders.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.folderOption, item.folderId === f.id && styles.folderOptionActive]}
                onPress={() => { onMove(item, f.id); setShowMoveSheet(false); }}
              >
                <Text style={styles.folderOptionEmoji}>{f.emoji}</Text>
                <View style={styles.folderOptionText}>
                  <Text style={styles.folderOptionName}>{f.name}</Text>
                  {item.folderId === f.id && (
                    <Text style={styles.folderOptionCurrent}>Current</Text>
                  )}
                </View>
                {item.folderId === f.id && (
                  <Ionicons name="checkmark" size={18} color={Colors.accent} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}, (prev, next) =>
  prev.isActive === next.isActive &&
  prev.screenFocused === next.screenFocused &&
  prev.item.id === next.item.id &&
  prev.item.comprehended === next.item.comprehended &&
  prev.item.watchCount === next.item.watchCount &&
  prev.item.folderId === next.item.folderId &&
  prev.selectMode === next.selectMode &&
  prev.isSelected === next.isSelected &&
  prev.folders === next.folders
);

// ── ReelsScreen ───────────────────────────────────────────────────────────────

export default function ReelsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [allItems, setAllItems]       = useState<MediaItem[]>([]);
  const [folders, setFolders]         = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null | 'all'>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [screenFocused, setScreenFocused] = useState(false);
  const [showFolderBar, setShowFolderBar] = useState(true);
  const hideBarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList<MediaItem>>(null);

  // ── Bottom tab bar: hidden while on Reels, peek on swipe-up ────────────────
  const [tabBarRevealed, setTabBarRevealed] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectMode, setSelectMode]       = useState(false);
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);

  const [isShuffled, setIsShuffled]       = useState(false);
  const [shuffledItems, setShuffledItems] = useState<MediaItem[]>([]);

  const baseItems: MediaItem[] = (() => {
    const videos = allItems.filter(i => i.type === 'video' && !i.hidden && !i.archived);
    if (activeFolderId === 'all') return videos;
    if (activeFolderId === null)  return videos.filter(i => !i.folderId);
    return videos.filter(i => i.folderId === activeFolderId);
  })();

  const items = isShuffled ? shuffledItems : baseItems;

  const load = useCallback(async () => {
    const [all, allFolders] = await Promise.all([
      Storage.getAll(),
      FolderStorage.getAll(),
    ]);
    setAllItems(all);
    setFolders(allFolders);
  }, []);

  const startHideTimer = useCallback(() => {
    if (hideBarTimer.current) clearTimeout(hideBarTimer.current);
    setShowFolderBar(true);
    hideBarTimer.current = setTimeout(() => setShowFolderBar(false), 3000);
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    setScreenFocused(true);
    startHideTimer();
    return () => {
      setScreenFocused(false);
      if (hideBarTimer.current) clearTimeout(hideBarTimer.current);
      if (revealTimer.current) clearTimeout(revealTimer.current);
      setTabBarRevealed(false);
    };
  }, [load, startHideTimer]));

  // Hide the parent tab bar while Reels is focused; bring it back when a
  // swipe-up reveal is active, or when leaving this screen entirely.
  React.useEffect(() => {
    navigation.setOptions({
      tabBarStyle: (screenFocused && !tabBarRevealed) ? { display: 'none' } : getTabBarStyle(insets),
    });
  }, [screenFocused, tabBarRevealed, navigation, insets]);

  const revealTabBar = useCallback(() => {
    setTabBarRevealed(true);
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => setTabBarRevealed(false), 4000);
  }, []);

  // Sits just above the iOS home-indicator zone so the system's own
  // swipe-up-to-home gesture doesn't steal the touch. Responds to a tap
  // OR a swipe-up — tap is the reliable fallback on iPhone.
  const tabBarPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -16 || Math.abs(gesture.dy) < 6) revealTabBar();
      },
    })
  ).current;

  const handleShuffle = () => {
    const allVideos = allItems.filter(i => i.type === 'video' && !i.hidden && !i.archived);
    const shuffled = [...allVideos].sort(() => Math.random() - 0.5);
    setShuffledItems(shuffled);
    setIsShuffled(true);
    setActiveFolderId('all');
    setActiveIndex(0);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    startHideTimer();
  };

  const handleUnshuffle = () => {
    setIsShuffled(false);
    setShuffledItems([]);
    setActiveIndex(0);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const handleFolderSwitch = (folderId: string | null | 'all') => {
    setIsShuffled(false);
    setShuffledItems([]);
    setActiveFolderId(folderId);
    setActiveIndex(0);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    startHideTimer();
    exitSelectMode();
  };

  const enterSelectMode = (item: MediaItem) => {
    setSelectMode(true);
    setSelectedIds(new Set([item.id]));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(items.map(i => i.id)));

  const bulkDelete = () => {
    const count = selectedIds.size;
    Alert.alert(`Delete ${count} item${count > 1 ? 's' : ''}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await Storage.bulkDelete([...selectedIds]);
          exitSelectMode();
          load();
        },
      },
    ]);
  };

  const bulkArchive = async () => {
    await Storage.bulkUpdate([...selectedIds], { archived: true });
    exitSelectMode();
    load();
  };

  const bulkHide = async () => {
    await Storage.bulkUpdate([...selectedIds], { hidden: true });
    exitSelectMode();
    load();
  };

  const bulkMoveTo = async (folderId: string | null) => {
    await Storage.bulkUpdate([...selectedIds], { folderId, hidden: false, archived: false });
    setShowMoveModal(false);
    exitSelectMode();
    load();
  };

  const handleWatched = useCallback(async (id: string) => {
    await Storage.incrementWatchCount(id);
    setAllItems(prev => prev.map(i =>
      i.id === id ? { ...i, watchCount: (i.watchCount || 0) + 1 } : i
    ));
  }, []);

  const handleComprehend = useCallback(async (item: MediaItem) => {
    const next = !item.comprehended;
    await Storage.updateItem(item.id, { comprehended: next });
    setAllItems(prev => prev.map(i => i.id === item.id ? { ...i, comprehended: next } : i));
    if (next) Alert.alert('🎉 Comprehended!', 'Marked as truly understood and applied!', [{ text: '🌱 Nice!' }]);
  }, []);

  const handleDelete = useCallback(async (item: MediaItem) => {
    await Storage.deleteItem(item.id);
    setAllItems(prev => prev.filter(i => i.id !== item.id));
  }, []);

  // ── Single-item move (from the sidebar button) ──────────────────────────────
  const handleMove = useCallback(async (item: MediaItem, folderId: string | null) => {
    await Storage.updateItem(item.id, { folderId, hidden: false, archived: false });
    setAllItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, folderId, hidden: false, archived: false } : i
    ));
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 75 }).current;
  const keyExtractor = useCallback((i: MediaItem) => i.id, []);

  const renderItem = useCallback(({ item, index }: { item: MediaItem; index: number }) => (
    <ReelItem
      item={item}
      isActive={index === activeIndex}
      screenFocused={screenFocused}
      selectMode={selectMode}
      isSelected={selectedIds.has(item.id)}
      folders={folders}
      onWatched={handleWatched}
      onComprehend={handleComprehend}
      onDelete={handleDelete}
      onLongPress={enterSelectMode}
      onTapInSelectMode={toggleSelect}
      onMove={handleMove}
    />
  ), [activeIndex, screenFocused, selectMode, selectedIds, folders, handleWatched, handleComprehend, handleDelete, handleMove]);

  const activeFolderLabel = (() => {
    if (activeFolderId === 'all') return { emoji: '🗂️', name: 'All Videos' };
    if (activeFolderId === null)  return { emoji: '📂', name: 'Uncategorized' };
    const f = folders.find(f => f.id === activeFolderId);
    return f ? { emoji: f.emoji, name: f.name } : { emoji: '🗂️', name: 'All Videos' };
  })();

  if (items.length === 0 && allItems.filter(i => i.type === 'video').length === 0) {
    return (
      <View style={styles.empty}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
        <Text style={styles.emptyEmoji}>🎬</Text>
        <Text style={styles.emptyTitle}>No videos yet</Text>
        <Text style={styles.emptySub}>Add videos to your library and they'll appear here as reels</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/add')}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.bg} />
          <Text style={styles.emptyBtnText}>Add a Video</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.length > 0 ? (
        <FlatList
          ref={flatListRef}
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          maxToRenderPerBatch={1}
          windowSize={2}
          initialNumToRender={1}
          contentContainerStyle={selectMode ? { paddingBottom: 120 } : undefined}
        />
      ) : (
        <View style={styles.emptyFolder}>
          <Text style={styles.emptyEmoji}>📂</Text>
          <Text style={styles.emptyTitle}>No videos in this folder</Text>
          <Text style={styles.emptySub}>Switch to another folder or add a video from the + tab.</Text>
        </View>
      )}

      {/* Folder switcher overlay */}
      {showFolderBar && !selectMode && (
        <TouchableOpacity activeOpacity={1} onPress={startHideTimer} style={styles.folderBarWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderBar}>
            <TouchableOpacity
              style={[styles.folderTab, activeFolderId === 'all' && styles.folderTabActive]}
              onPress={() => handleFolderSwitch('all')}
            >
              <Text style={styles.folderTabEmoji}>🗂️</Text>
              <Text style={[styles.folderTabLabel, activeFolderId === 'all' && styles.folderTabLabelActive]}>All</Text>
            </TouchableOpacity>

            {folders.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.folderTab, activeFolderId === f.id && styles.folderTabActive]}
                onPress={() => handleFolderSwitch(f.id)}
              >
                <Text style={styles.folderTabEmoji}>{f.emoji}</Text>
                <Text style={[styles.folderTabLabel, activeFolderId === f.id && styles.folderTabLabelActive]} numberOfLines={1}>
                  {f.name}
                </Text>
              </TouchableOpacity>
            ))}

            {allItems.some(i => i.type === 'video' && !i.folderId && !i.hidden && !i.archived) && (
              <TouchableOpacity
                style={[styles.folderTab, activeFolderId === null && styles.folderTabActive]}
                onPress={() => handleFolderSwitch(null)}
              >
                <Text style={styles.folderTabEmoji}>📂</Text>
                <Text style={[styles.folderTabLabel, activeFolderId === null && styles.folderTabLabelActive]}>Other</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </TouchableOpacity>
      )}

      {/* Tap to reveal folder bar */}
      {!showFolderBar && !selectMode && (
        <TouchableOpacity style={styles.folderRevealBtn} onPress={startHideTimer}>
          <Text style={styles.folderRevealEmoji}>{activeFolderLabel.emoji}</Text>
          <Text style={styles.folderRevealLabel}>{activeFolderLabel.name}</Text>
          <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}

      {/* Shuffle button */}
      {!selectMode && (
        <TouchableOpacity
          style={[styles.shuffleBtn, isShuffled && styles.shuffleBtnActive]}
          onPress={isShuffled ? handleUnshuffle : handleShuffle}
        >
          <Ionicons name="shuffle" size={20} color={isShuffled ? Colors.bg : '#fff'} />
          {isShuffled && <Text style={styles.shuffleBtnLabel}>On</Text>}
        </TouchableOpacity>
      )}

      {/* Multi-select action bar */}
      {selectMode && (
        <View style={styles.actionBar}>
          <View style={styles.actionBarTop}>
            <TouchableOpacity onPress={exitSelectMode} style={styles.actionCancel}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <Text style={styles.actionCount}>{selectedIds.size} selected</Text>
            <TouchableOpacity onPress={selectAll} style={styles.actionSelectAll}>
              <Text style={styles.actionSelectAllText}>Select All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionBtns}>
            <TouchableOpacity
              style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
              onPress={bulkDelete} disabled={selectedIds.size === 0}
            >
              <Ionicons name="trash-outline" size={22} color={Colors.red} />
              <Text style={[styles.actionBtnLabel, { color: Colors.red }]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
              onPress={bulkArchive} disabled={selectedIds.size === 0}
            >
              <Ionicons name="archive-outline" size={22} color="rgba(255,255,255,0.8)" />
              <Text style={styles.actionBtnLabel}>Archive</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
              onPress={() => setShowMoveModal(true)} disabled={selectedIds.size === 0}
            >
              <Ionicons name="folder-open-outline" size={22} color="rgba(255,255,255,0.8)" />
              <Text style={styles.actionBtnLabel}>Move</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, selectedIds.size === 0 && styles.actionBtnDisabled]}
              onPress={bulkHide} disabled={selectedIds.size === 0}
            >
              <Ionicons name="eye-off-outline" size={22} color="rgba(255,255,255,0.8)" />
              <Text style={styles.actionBtnLabel}>Hide</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bulk move modal */}
      <Modal
        visible={showMoveModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoveModal(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMoveModal(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Move to Folder</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.folderOption} onPress={() => bulkMoveTo(null)}>
              <Text style={styles.folderOptionEmoji}>📂</Text>
              <View style={styles.folderOptionText}>
                <Text style={styles.folderOptionName}>Uncategorized</Text>
              </View>
            </TouchableOpacity>
            {folders.map(f => (
              <TouchableOpacity key={f.id} style={styles.folderOption} onPress={() => bulkMoveTo(f.id)}>
                <Text style={styles.folderOptionEmoji}>{f.emoji}</Text>
                <View style={styles.folderOptionText}>
                  <Text style={styles.folderOptionName}>{f.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Swipe-up handle to peek the tab bar */}
      {!tabBarRevealed && !selectMode && (
        <View style={[styles.tabBarHandle, { bottom: insets.bottom + 6 }]} {...tabBarPan.panHandlers}>
          <View style={styles.tabBarHandleBar} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  reel: { width: SCREEN_W, height: SCREEN_H, backgroundColor: '#000' },
  videoWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#000',
  },
  video: { width: '100%', height: '100%' },
  videoPlaceholder: { backgroundColor: '#111' },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },

  selectOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-start', alignItems: 'flex-start', padding: 16,
  },
  selectOverlayActive: { backgroundColor: 'rgba(240,192,96,0.15)' },
  selectCircle: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  selectCircleActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },

  bottomInfo: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    left: 16, right: 80, gap: 6,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  comprehendedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.accent, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  comprehendedTagText: { fontSize: 11, fontWeight: '700', color: Colors.bg },
  reelTitle: {
    fontSize: 17, fontWeight: '800', color: '#fff', flex: 1,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  reelNote: {
    fontSize: 13, color: 'rgba(255,255,255,0.9)', fontStyle: 'italic', lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  metaText: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  metaDot: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },

  sideBar: {
    position: 'absolute', right: 12,
    bottom: Platform.OS === 'ios' ? 110 : 90,
    alignItems: 'center', gap: 20,
  },
  sideBtn: { alignItems: 'center', gap: 4 },
  sideBtnLabel: {
    fontSize: 11, color: '#fff', fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  watchCountBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  watchCountNum: { fontSize: 14, fontWeight: '900', color: '#fff' },

  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.88)', padding: 28, gap: 10,
  },
  errorTitle: { color: '#FF6B6B', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  errorDetail: {
    color: 'rgba(255,255,255,0.85)', fontSize: 12, textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', padding: 10, borderRadius: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', width: '100%',
  },
  errorUri: { color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent, borderRadius: Radius.full,
    paddingHorizontal: 20, paddingVertical: 10, marginTop: 4,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.bg },

  seekRow: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32,
  },
  seekBtn: { alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
  seekPlayBtn: { alignItems: 'center', justifyContent: 'center', width: 64, height: 64 },
  seekLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },

  folderBarWrapper: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 32,
    left: 0, right: 0, zIndex: 10,
  },
  folderBar: { paddingHorizontal: 12, gap: 8 },
  folderTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  folderTabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  folderTabEmoji: { fontSize: 14 },
  folderTabLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)', maxWidth: 100 },
  folderTabLabelActive: { color: Colors.bg },

  folderRevealBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 32,
    alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 10,
  },
  folderRevealEmoji: { fontSize: 14 },
  folderRevealLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },

  shuffleBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 90,
    left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 8, zIndex: 10,
  },
  shuffleBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  shuffleBtnLabel: { fontSize: 12, fontWeight: '800', color: Colors.bg },

  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(20,20,20,0.97)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    paddingTop: 12, paddingHorizontal: 16, zIndex: 20,
  },
  actionBarTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  actionCancel: { padding: 4 },
  actionCount: { fontSize: 15, fontWeight: '700', color: '#fff' },
  actionSelectAll: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(240,192,96,0.15)',
    borderWidth: 1, borderColor: 'rgba(240,192,96,0.4)',
  },
  actionSelectAllText: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  actionBtns: { flexDirection: 'row', justifyContent: 'space-around' },
  actionBtn: {
    alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)', minWidth: 70,
  },
  actionBtnDisabled: {},
  actionBtnLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
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
  folderOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  folderOptionActive: {
    backgroundColor: Colors.accentGlow,
    borderRadius: Radius.md,
    paddingHorizontal: 8,
  },
  folderOptionEmoji: { fontSize: 26 },
  folderOptionText: { flex: 1 },
  folderOptionName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  folderOptionCurrent: { fontSize: 11, color: Colors.accent, fontWeight: '700', marginTop: 2 },

  tabBarHandle: {
    position: 'absolute', left: 0, right: 0,
    height: 26, justifyContent: 'center', alignItems: 'center',
    zIndex: 30,
  },
  tabBarHandleBar: {
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  empty: {
    flex: 1, backgroundColor: Colors.bg,
    justifyContent: 'center', alignItems: 'center', padding: 40,
  },
  emptyFolder: {
    flex: 1, backgroundColor: '#000',
    justifyContent: 'center', alignItems: 'center', padding: 40,
  },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: Colors.text3, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: Radius.md,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: Colors.bg },
});
