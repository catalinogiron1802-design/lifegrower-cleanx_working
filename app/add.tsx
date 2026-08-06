import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Folder, FolderStorage, MediaItem, Storage } from '../src/store/storage';
import { useServerUrl } from '../src/utils/serverConfig';
import { useSwipeTabNavigation } from '../src/utils/swipeTabNavigation';
import { Colors, Radius, Shadow } from '../src/utils/theme';

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function detectLinkPlatform(link: string): 'youtube' | 'instagram' | 'facebook' | null {
  const l = link.toLowerCase();
  if (l.includes('youtube.com') || l.includes('youtu.be')) return 'youtube';
  if (l.includes('instagram.com')) return 'instagram';
  if (l.includes('facebook.com') || l.includes('fb.watch')) return 'facebook';
  return null;
}

interface PendingFile {
  name:   string;
  size:   number;
  type:   'video' | 'photo';
  url:    string;
  synced: boolean;
}

interface FetchedFile {
  name: string;
  size: number;
  type: 'video' | 'photo';
  url:  string;
}

export default function AddScreen() {
  const swipeGesture = useSwipeTabNavigation();
  const SERVER_URL = useServerUrl();
  const SERVER_IP  = SERVER_URL.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  const [title, setTitle]           = useState('');
  const [note, setNote]             = useState('');
  const [selectedMedia, setSelectedMedia] = useState<{
    uri: string; type: 'video' | 'photo'; name: string
  } | null>(null);
  const [saving, setSaving]         = useState(false);
  const [backingUp, setBackingUp]   = useState(false);
  const [folders, setFolders]       = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // ── Bulk sync state ──
  const [showSyncPanel, setShowSyncPanel]       = useState(false);
  const [pendingFiles, setPendingFiles]         = useState<PendingFile[]>([]);
  const [syncFolderId, setSyncFolderId]         = useState<string | null>(null);
  const [showSyncFolderPicker, setShowSyncFolderPicker] = useState(false);
  const [loadingPending, setLoadingPending]     = useState(false);
  const [syncProgress, setSyncProgress]         = useState<{ done: number; total: number } | null>(null);
  const [syncLog, setSyncLog]                   = useState<string[]>([]);

  // ── Link import state (YouTube / Instagram / Facebook) ──
  const [linkUrl, setLinkUrl]           = useState('');
  const [fetchingLink, setFetchingLink] = useState(false);
  const [linkProgress, setLinkProgress] = useState<number | null>(null);
  const [linkStatus, setLinkStatus]     = useState('');

  useFocusEffect(useCallback(() => {
    FolderStorage.getAll().then(setFolders);
  }, []));

  const selectedFolder = folders.find(f => f.id === selectedFolderId);
  const syncFolder     = folders.find(f => f.id === syncFolderId);

  // ── Permissions ────────────────────────────────────────────────────────────
  const requestPermission = async () => {
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status === 'granted') return true;
    if (!canAskAgain) {
      Alert.alert('Permission Denied', 'Go to Settings → Apps → Expo Go → Permissions → enable Photos/Media.', [{ text: 'OK' }]);
      return false;
    }
    Alert.alert('Permission needed', 'Please allow access to your media library.');
    return false;
  };

  // ── Pickers ────────────────────────────────────────────────────────────────
  const pickVideo = async () => {
    try {
      if (!await requestPermission()) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 1, allowsEditing: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const name  = asset.fileName || asset.uri.split('/').pop() || 'video.mp4';
        setSelectedMedia({ uri: asset.uri, type: 'video', name });
        if (!title) setTitle(name.replace(/\.[^.]+$/, '') || 'My Video');
      }
    } catch (e: any) { Alert.alert('Error', 'Could not open video picker: ' + e.message); }
  };

  const pickPhoto = async () => {
    try {
      if (!await requestPermission()) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1, allowsEditing: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const name  = asset.fileName || asset.uri.split('/').pop() || 'photo.jpg';
        setSelectedMedia({ uri: asset.uri, type: 'photo', name });
        if (!title) setTitle(name.replace(/\.[^.]+$/, '') || 'My Photo');
      }
    } catch (e: any) { Alert.alert('Error', 'Could not open photo picker: ' + e.message); }
  };

  // ── Import from a YouTube / Instagram / Facebook link ────────────────────────
  const handleFetchLink = async () => {
    const link = linkUrl.trim();
    if (!link) { Alert.alert('Paste a link', 'Paste a YouTube, Instagram, or Facebook video link first.'); return; }
    if (!detectLinkPlatform(link)) {
      Alert.alert('Unsupported link', 'Only YouTube, Instagram, and Facebook links are supported.');
      return;
    }

    setFetchingLink(true);
    setLinkProgress(0);
    setLinkStatus('Starting download on your PC…');

    try {
      const res = await fetch(`${SERVER_URL}/fetch-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Server responded with status ${res.status}`);
      const { jobId } = await res.json();

      let file: FetchedFile | null = null;
      for (let attempt = 0; attempt < 600; attempt++) {
        await sleep(1200);
        const statusRes = await fetch(`${SERVER_URL}/fetch-status/${jobId}`);
        if (!statusRes.ok) throw new Error(`Server responded with status ${statusRes.status}`);
        const job = await statusRes.json();
        if (job.status === 'downloading') {
          setLinkProgress(typeof job.progress === 'number' ? job.progress : null);
          setLinkStatus(typeof job.progress === 'number' ? `Downloading on PC… ${job.progress.toFixed(0)}%` : 'Downloading on PC…');
          continue;
        }
        if (job.status === 'error') throw new Error(job.error || 'Download failed on the PC.');
        if (job.status === 'done') { file = job.file; break; }
      }
      if (!file) throw new Error('Download is taking too long — try again in a bit.');

      setLinkStatus('Bringing it to your phone…');
      setLinkProgress(null);

      const ext      = file.name.split('.').pop() || (file.type === 'video' ? 'mp4' : 'jpg');
      const id       = generateId();
      const destUri  = FileSystem.documentDirectory + `${id}.${ext}`;
      const download = await FileSystem.downloadAsync(file.url, destUri);
      if (download.status < 200 || download.status >= 300) {
        await FileSystem.deleteAsync(destUri, { idempotent: true });
        throw new Error(`Server returned status ${download.status}`);
      }
      const info = await FileSystem.getInfoAsync(destUri, { size: true });
      if (!info.exists || !info.size || info.size < 1024) {
        await FileSystem.deleteAsync(destUri, { idempotent: true });
        throw new Error('Downloaded file is empty/corrupt.');
      }

      fetch(`${SERVER_URL}/mark-synced`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: [file.name] }),
      }).catch(() => { /* non-critical */ });

      setSelectedMedia({ uri: download.uri, type: file.type, name: file.name });
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
      setLinkUrl('');
    } catch (e: any) {
      Alert.alert(
        'Could not fetch link',
        `${e?.message || 'Unknown error'}\n\nMake sure:\n• PC and phone are on the same Wi-Fi\n• server.js is running on your PC\n• yt-dlp is installed on your PC`
      );
    } finally {
      setFetchingLink(false);
      setLinkStatus('');
      setLinkProgress(null);
    }
  };

  // ── Backup picked file straight to PC's sync_folder ─────────────────────────
  const backupToPC = async () => {
    if (!selectedMedia) return;
    setBackingUp(true);
    try {
      const result = await FileSystem.uploadAsync(
        `${SERVER_URL}/upload?name=${encodeURIComponent(selectedMedia.name)}`,
        selectedMedia.uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        }
      );
      if (result.status >= 200 && result.status < 300) {
        Alert.alert('☁️ Backed up', `"${selectedMedia.name}" was sent to your PC's sync folder.`);
      } else {
        throw new Error(`Server responded with status ${result.status}`);
      }
    } catch (e: any) {
      Alert.alert(
        'Backup failed',
        `${e?.message || 'Unknown error'}\n\nMake sure:\n• PC and phone are on the same Wi-Fi\n• server.js is running on your PC\n• IP is correct (${SERVER_IP})`
      );
    } finally {
      setBackingUp(false);
    }
  };

  // ── Save single item ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedMedia) { Alert.alert('No media selected', 'Please pick a video or photo first.'); return; }
    if (!title.trim())  { Alert.alert('Add a title', 'Give this item a name.'); return; }
    setSaving(true);
    try {
      const id = generateId();
      let finalUri = selectedMedia.uri;
      try {
        const ext     = selectedMedia.name.split('.').pop() || (selectedMedia.type === 'video' ? 'mp4' : 'jpg');
        const destUri = FileSystem.documentDirectory + `${id}.${ext}`;
        await FileSystem.copyAsync({ from: selectedMedia.uri, to: destUri });
        finalUri = destUri;
      } catch { /* fall back to original */ }

      const newItem: MediaItem = {
        id, type: selectedMedia.type, uri: finalUri,
        title: title.trim(), note: note.trim(), tags: [],
        folderId: selectedFolderId, comprehended: false,
        hidden: false, archived: false,
        createdAt: Date.now(), updatedAt: Date.now(), watchCount: 0,
      };
      await Storage.addItem(newItem);
      Alert.alert('🌱 Added!', `"${title}" added to your growth library.`, [
        { text: 'View Library', onPress: () => router.push('/') },
        { text: 'Add Another',  onPress: () => { setTitle(''); setNote(''); setSelectedMedia(null); setSelectedFolderId(null); } },
      ]);
    } catch (e: any) { Alert.alert('Error', 'Could not save: ' + e.message); }
    setSaving(false);
  };

  // ── Bulk sync: fetch pending list ──────────────────────────────────────────
  const fetchPending = async () => {
    setLoadingPending(true);
    setSyncLog([]);
    setPendingFiles([]);

    // Manual timeout using AbortController (compatible with all RN/Hermes versions)
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 10000); // 10 seconds

    try {
      const res  = await fetch(`${SERVER_URL}/pending`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Server responded with status ${res.status}`);
      const data = await res.json();
      setPendingFiles(data.files || []);
      if ((data.files || []).length === 0) {
        setSyncLog(['✅ All files already synced! Drop more into your PC sync folder.']);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      const reason = e?.name === 'AbortError'
        ? 'Request timed out (10s). PC may be slow or unreachable.'
        : e?.message || 'Unknown error';
      Alert.alert(
        'Cannot reach PC',
        `${reason}\n\nMake sure:\n• PC and phone are on the same Wi-Fi\n• server.js is running on your PC\n• IP is correct (${SERVER_IP})`
      );
    } finally { setLoadingPending(false); }
  };

  // ── Bulk sync: download all pending ───────────────────────────────────────
  const syncAll = async () => {
    if (pendingFiles.length === 0) return;

    if (syncFolderId === null) {
      const go = await new Promise<boolean>(resolve =>
        Alert.alert(
          'No folder selected',
          'Videos will land in Uncategorized. Continue?',
          [
            { text: 'Cancel',   style: 'cancel', onPress: () => resolve(false) },
            { text: 'Continue',                  onPress: () => resolve(true)  },
          ]
        )
      );
      if (!go) return;
    }

    setSyncProgress({ done: 0, total: pendingFiles.length });
    setSyncLog([]);
    const log:    string[] = [];
    const synced: string[] = [];
    let done = 0;

    for (const file of pendingFiles) {
      try {
        log.unshift(`⬇ Downloading ${file.name}…`);
        setSyncLog([...log]);

        const ext      = file.name.split('.').pop() || (file.type === 'video' ? 'mp4' : 'jpg');
        const id       = generateId();
        const destUri  = FileSystem.documentDirectory + `${id}.${ext}`;
        const download = await FileSystem.downloadAsync(file.url, destUri);

        // downloadAsync resolves even on 404/500 — it just writes whatever
        // bytes (e.g. an HTML error page) the server sent. Verify the
        // response and the resulting file before trusting it.
        if (download.status < 200 || download.status >= 300) {
          await FileSystem.deleteAsync(destUri, { idempotent: true });
          throw new Error(`Server returned status ${download.status}`);
        }
        const info = await FileSystem.getInfoAsync(destUri, { size: true });
        if (!info.exists || !info.size || info.size < 1024) {
          await FileSystem.deleteAsync(destUri, { idempotent: true });
          throw new Error(`Downloaded file is empty/corrupt (${info.exists ? info.size : 0} bytes)`);
        }
        // Compare against the size the server reported in /pending — catches
        // a silently truncated transfer (download "succeeds" but the file
        // is smaller than the source, e.g. dropped connection mid-stream).
        if (file.size && info.size !== file.size) {
          await FileSystem.deleteAsync(destUri, { idempotent: true });
          throw new Error(`Size mismatch: expected ${file.size} bytes, got ${info.size} bytes (truncated transfer)`);
        }

        const newItem: MediaItem = {
          id,
          type:         file.type,
          uri:          download.uri,
          title:        file.name.replace(/\.[^.]+$/, ''),
          note:         '',
          tags:         [],
          folderId:     syncFolderId,
          comprehended: false,
          hidden:       false,
          archived:     false,
          createdAt:    Date.now(),
          updatedAt:    Date.now(),
          watchCount:   0,
        };
        await Storage.addItem(newItem);
        synced.push(file.name);
        done++;
        log.unshift(`✅ Saved: ${file.name}`);
        setSyncLog([...log]);
        setSyncProgress({ done, total: pendingFiles.length });
      } catch (e: any) {
        log.unshift(`❌ Failed: ${file.name} — ${e.message}`);
        setSyncLog([...log]);
      }
    }

    // Tell PC server which files landed successfully
    if (synced.length > 0) {
      try {
        await fetch(`${SERVER_URL}/mark-synced`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: synced }),
        });
      } catch { /* non-critical */ }
    }

    setSyncProgress(null);
    setPendingFiles([]);
    log.unshift(`\n🌱 Done! ${done} of ${pendingFiles.length} files saved.`);
    setSyncLog([...log]);
  };

  function fmtSize(bytes: number) {
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <GestureDetector gesture={swipeGesture}>
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add to Library</Text>
          <Text style={styles.headerSub}>Save something that will help you grow</Text>
        </View>

        {/* Pick buttons */}
        <View style={styles.pickRow}>
          <TouchableOpacity style={[styles.pickBtn, styles.pickBtnVideo]} onPress={pickVideo}>
            <Ionicons name="film" size={32} color={Colors.accent} />
            <Text style={styles.pickBtnLabel}>Pick Video</Text>
            <Text style={styles.pickBtnSub}>From your gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pickBtn, styles.pickBtnPhoto]} onPress={pickPhoto}>
            <Ionicons name="image" size={32} color={Colors.blue} />
            <Text style={styles.pickBtnLabel}>Pick Photo</Text>
            <Text style={styles.pickBtnSub}>Infographic, quote…</Text>
          </TouchableOpacity>
        </View>

        {/* Import from link */}
        <View style={styles.orDivider}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or paste a link</Text>
          <View style={styles.orLine} />
        </View>

        <View style={styles.linkRow}>
          <View style={styles.linkPlatforms}>
            <Ionicons name="logo-youtube" size={16} color={Colors.red} />
            <Ionicons name="logo-instagram" size={16} color={Colors.blue} />
            <Ionicons name="logo-facebook" size={16} color={Colors.blue} />
          </View>
          <TextInput
            style={styles.linkInput}
            value={linkUrl}
            onChangeText={setLinkUrl}
            placeholder="YouTube / Instagram / Facebook link…"
            placeholderTextColor={Colors.text3}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!fetchingLink}
          />
          <TouchableOpacity
            style={[styles.linkFetchBtn, (!linkUrl.trim() || fetchingLink) && styles.saveBtnDisabled]}
            onPress={handleFetchLink}
            disabled={!linkUrl.trim() || fetchingLink}
            activeOpacity={0.8}
          >
            {fetchingLink
              ? <ActivityIndicator color={Colors.bg} size="small" />
              : <Ionicons name="download-outline" size={20} color={Colors.bg} />}
          </TouchableOpacity>
        </View>

        {fetchingLink && (
          <View style={styles.progressBox}>
            <Text style={styles.progressLabel}>{linkStatus || 'Working…'}</Text>
            {linkProgress !== null && (
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${linkProgress}%` as any }]} />
              </View>
            )}
          </View>
        )}

        {/* Preview */}
        {selectedMedia && (
          <View style={styles.previewBox}>
            {selectedMedia.type === 'photo' ? (
              <Image source={{ uri: selectedMedia.uri }} style={styles.previewImage} resizeMode="cover" />
            ) : (
              <View style={styles.videoPreview}>
                <Ionicons name="film" size={48} color={Colors.accent} />
                <Text style={styles.videoPreviewText}>Video selected</Text>
                <Text style={styles.videoPreviewName} numberOfLines={1}>{selectedMedia.name}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.removeBtn} onPress={() => setSelectedMedia(null)}>
              <Ionicons name="close-circle" size={22} color={Colors.red} />
            </TouchableOpacity>
            <View style={styles.typePill}>
              <Ionicons name={selectedMedia.type === 'video' ? 'film-outline' : 'image-outline'} size={12} color={Colors.bg} />
              <Text style={styles.typePillText}>{selectedMedia.type}</Text>
            </View>
          </View>
        )}

        {/* Backup picked file to PC */}
        {selectedMedia && (
          <TouchableOpacity
            style={[styles.backupBtn, backingUp && styles.saveBtnDisabled]}
            onPress={backupToPC}
            disabled={backingUp}
            activeOpacity={0.8}
          >
            {backingUp ? <ActivityIndicator color={Colors.accent} /> : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color={Colors.accent} />
                <Text style={styles.backupBtnText}>Backup to PC ({SERVER_IP})</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}><Ionicons name="text-outline" size={14} color={Colors.accent} /> Title *</Text>
          <TextInput
            style={styles.input} value={title} onChangeText={setTitle}
            placeholder="e.g. Morning routine tips…" placeholderTextColor={Colors.text3} maxLength={100}
          />
        </View>

        {/* Folder picker */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}><Ionicons name="folder-outline" size={14} color={Colors.accent} /> Folder</Text>
          <TouchableOpacity style={styles.folderPickerBtn} onPress={() => setShowFolderPicker(true)}>
            <Text style={styles.folderPickerEmoji}>{selectedFolder ? selectedFolder.emoji : '📂'}</Text>
            <Text style={[styles.folderPickerText, !selectedFolder && styles.folderPickerPlaceholder]}>
              {selectedFolder ? selectedFolder.name : 'Uncategorized — tap to choose'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text3} />
          </TouchableOpacity>
        </View>

        {/* Note */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}><Ionicons name="journal-outline" size={14} color={Colors.accent} /> My Note / Reflection</Text>
          <Text style={styles.fieldHint}>Write what you want to apply from this. Your future self will thank you.</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]} value={note} onChangeText={setNote}
            placeholder="e.g. I want to try waking up at 5am and using the first hour for deep work."
            placeholderTextColor={Colors.text3} multiline numberOfLines={5}
            textAlignVertical="top" maxLength={2000}
          />
          <Text style={styles.charCount}>{note.length}/2000</Text>
        </View>

        {/* Save single */}
        <TouchableOpacity
          style={[styles.saveBtn, (!selectedMedia || !title.trim()) && styles.saveBtnDisabled]}
          onPress={handleSave} disabled={saving || !selectedMedia || !title.trim()} activeOpacity={0.8}
        >
          {saving ? <ActivityIndicator color={Colors.bg} /> : (
            <><Ionicons name="add-circle" size={22} color={Colors.bg} /><Text style={styles.saveBtnText}>Add to Growth Library</Text></>
          )}
        </TouchableOpacity>

        {/* Bulk PC Sync entry point */}
        <TouchableOpacity style={styles.syncCard} onPress={() => { setShowSyncPanel(true); fetchPending(); }}>
          <View style={styles.syncCardLeft}>
            <Ionicons name="cloud-download-outline" size={28} color={Colors.accent} />
            <View>
              <Text style={styles.syncCardTitle}>Sync Folder from PC</Text>
              <Text style={styles.syncCardSub}>Bulk import all pending videos via Wi-Fi</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.text3} />
        </TouchableOpacity>

        <Text style={styles.tipText}>
          💡 Tip: After saving, watch it repeatedly and mark "Comprehended" when you've truly applied it in your life.
        </Text>
      </ScrollView>

      {/* ══════ BULK SYNC PANEL ══════ */}
      <Modal visible={showSyncPanel} transparent animationType="slide" onRequestClose={() => { if (!syncProgress) setShowSyncPanel(false); }}>
        <View style={styles.syncModalBg}>
          <View style={styles.syncModal}>
            <View style={styles.syncModalHeader}>
              <Text style={styles.syncModalTitle}>📡 Sync from PC Folder</Text>
              <TouchableOpacity onPress={() => { if (!syncProgress) setShowSyncPanel(false); }}>
                <Ionicons name="close" size={24} color={Colors.text2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Destination folder */}
              <Text style={styles.syncSectionLabel}>Where should files land?</Text>
              <TouchableOpacity style={styles.folderPickerBtn} onPress={() => setShowSyncFolderPicker(true)} disabled={!!syncProgress}>
                <Text style={styles.folderPickerEmoji}>{syncFolder ? syncFolder.emoji : '📂'}</Text>
                <Text style={[styles.folderPickerText, !syncFolder && styles.folderPickerPlaceholder]}>
                  {syncFolder ? syncFolder.name : 'Uncategorized — tap to choose'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.text3} />
              </TouchableOpacity>

              {/* Pending list header */}
              <View style={styles.syncSectionRow}>
                <Text style={styles.syncSectionLabel}>
                  Pending Files{pendingFiles.length > 0 ? ` (${pendingFiles.length})` : ''}
                </Text>
                <TouchableOpacity onPress={fetchPending} disabled={loadingPending || !!syncProgress}>
                  <Ionicons name="refresh" size={18} color={loadingPending ? Colors.text3 : Colors.accent} />
                </TouchableOpacity>
              </View>

              {loadingPending && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={Colors.accent} />
                  <Text style={styles.loadingText}>Scanning PC folder…</Text>
                </View>
              )}

              {!loadingPending && pendingFiles.length === 0 && syncLog.length === 0 && (
                <View style={styles.emptySync}>
                  <Ionicons name="folder-open-outline" size={40} color={Colors.text3} />
                  <Text style={styles.emptySyncText}>
                    Drop your videos into the sync folder on your PC, then tap the refresh icon.
                  </Text>
                  <View style={styles.serverPill}>
                    <Ionicons name="server-outline" size={13} color={Colors.accent} />
                    <Text style={styles.serverPillText}>{SERVER_URL}</Text>
                  </View>
                </View>
              )}

              {/* File list */}
              {pendingFiles.length > 0 && (
                <>
                  <View style={styles.fileList}>
                    {pendingFiles.map((f, i) => (
                      <View key={i} style={[styles.fileRow, i === pendingFiles.length - 1 && { borderBottomWidth: 0 }]}>
                        <Ionicons
                          name={f.type === 'video' ? 'film-outline' : 'image-outline'}
                          size={18}
                          color={f.type === 'video' ? Colors.accent : Colors.blue}
                        />
                        <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
                        <Text style={styles.fileSize}>{fmtSize(f.size)}</Text>
                      </View>
                    ))}
                  </View>

                  {!syncProgress && (
                    <TouchableOpacity style={styles.syncAllBtn} onPress={syncAll}>
                      <Ionicons name="cloud-download" size={22} color={Colors.bg} />
                      <Text style={styles.syncAllBtnText}>
                        Download All {pendingFiles.length} Files
                        {syncFolder ? `  →  ${syncFolder.emoji} ${syncFolder.name}` : '  →  Uncategorized'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* Progress */}
              {syncProgress && (
                <View style={styles.progressBox}>
                  <Text style={styles.progressLabel}>Downloading… please keep screen open</Text>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${(syncProgress.done / syncProgress.total) * 100}%` as any }]} />
                  </View>
                  <Text style={styles.progressText}>{syncProgress.done} / {syncProgress.total}</Text>
                </View>
              )}

              {/* Log */}
              {syncLog.length > 0 && (
                <View style={styles.logBox}>
                  {syncLog.map((line, i) => (
                    <Text key={i} style={[styles.logLine, line.startsWith('❌') && { color: Colors.red }]}>{line}</Text>
                  ))}
                </View>
              )}

              {/* Done: go to library */}
              {!syncProgress && syncLog.some(l => l.includes('Done')) && (
                <TouchableOpacity
                  style={styles.viewLibraryBtn}
                  onPress={() => { setShowSyncPanel(false); router.push('/'); }}
                >
                  <Ionicons name="grid-outline" size={18} color={Colors.bg} />
                  <Text style={styles.viewLibraryBtnText}>View Library</Text>
                </TouchableOpacity>
              )}

            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Sync folder picker */}
      <Modal visible={showSyncFolderPicker} transparent animationType="slide" onRequestClose={() => setShowSyncFolderPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSyncFolderPicker(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Sync Destination</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.folderOption} onPress={() => { setSyncFolderId(null); setShowSyncFolderPicker(false); }}>
              <Text style={styles.folderOptionEmoji}>📂</Text>
              <Text style={[styles.folderOptionName, !syncFolderId && styles.folderOptionNameActive]}>Uncategorized</Text>
              {!syncFolderId && <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />}
            </TouchableOpacity>
            {folders.map(f => (
              <TouchableOpacity key={f.id} style={styles.folderOption} onPress={() => { setSyncFolderId(f.id); setShowSyncFolderPicker(false); }}>
                <Text style={styles.folderOptionEmoji}>{f.emoji}</Text>
                <Text style={[styles.folderOptionName, syncFolderId === f.id && styles.folderOptionNameActive]}>{f.name}</Text>
                {syncFolderId === f.id && <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Single-item folder picker */}
      <Modal visible={showFolderPicker} transparent animationType="slide" onRequestClose={() => setShowFolderPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowFolderPicker(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Choose a Folder</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.folderOption} onPress={() => { setSelectedFolderId(null); setShowFolderPicker(false); }}>
              <Text style={styles.folderOptionEmoji}>📂</Text>
              <Text style={[styles.folderOptionName, !selectedFolderId && styles.folderOptionNameActive]}>Uncategorized</Text>
              {!selectedFolderId && <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />}
            </TouchableOpacity>
            {folders.map(f => (
              <TouchableOpacity key={f.id} style={styles.folderOption} onPress={() => { setSelectedFolderId(f.id); setShowFolderPicker(false); }}>
                <Text style={styles.folderOptionEmoji}>{f.emoji}</Text>
                <Text style={[styles.folderOptionName, selectedFolderId === f.id && styles.folderOptionNameActive]}>{f.name}</Text>
                {selectedFolderId === f.id && <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 28 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: Colors.text, fontFamily: 'Georgia', letterSpacing: 0.5 },
  headerSub: { fontSize: 14, color: Colors.text3, marginTop: 4 },

  pickRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  pickBtn: { flex: 1, borderRadius: Radius.md, padding: 20, alignItems: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed' },
  pickBtnVideo: { borderColor: Colors.accentDim, backgroundColor: Colors.accentGlow },
  pickBtnPhoto: { borderColor: Colors.border, backgroundColor: Colors.surface2 },
  pickBtnLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  pickBtnSub: { fontSize: 12, color: Colors.text3 },

  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  orText: { fontSize: 12, color: Colors.text3, fontWeight: '600' },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  linkPlatforms: { flexDirection: 'row', gap: 6, backgroundColor: Colors.surface2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 13 },
  linkInput: { flex: 1, backgroundColor: Colors.surface2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text, fontSize: 14 },
  linkFetchBtn: { backgroundColor: Colors.accent, borderRadius: Radius.md, width: 46, height: 46, alignItems: 'center', justifyContent: 'center', ...Shadow.accent },

  previewBox: { borderRadius: Radius.md, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: Colors.border, ...Shadow.card },
  previewImage: { width: '100%', height: 200 },
  videoPreview: { height: 160, backgroundColor: Colors.surface2, justifyContent: 'center', alignItems: 'center', gap: 8 },
  videoPreviewText: { fontSize: 16, fontWeight: '700', color: Colors.text },
  videoPreviewName: { fontSize: 12, color: Colors.text3, maxWidth: '80%' },
  removeBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: Radius.full, padding: 2 },
  typePill: { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.accent, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  typePillText: { fontSize: 11, fontWeight: '700', color: Colors.bg, textTransform: 'uppercase' },

  field: { marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.text2, marginBottom: 6, letterSpacing: 0.3 },
  fieldHint: { fontSize: 12, color: Colors.text3, marginBottom: 8, lineHeight: 18 },
  input: { backgroundColor: Colors.surface2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text, fontSize: 15 },
  inputMulti: { height: 140, paddingTop: 12 },
  charCount: { fontSize: 11, color: Colors.text3, textAlign: 'right', marginTop: 4 },

  folderPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12 },
  folderPickerEmoji: { fontSize: 22 },
  folderPickerText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
  folderPickerPlaceholder: { color: Colors.text3, fontWeight: '400' },

  saveBtn: { backgroundColor: Colors.accent, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, marginBottom: 16, ...Shadow.accent },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 17, fontWeight: '800', color: Colors.bg, letterSpacing: 0.3 },

  backupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accentGlow, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.accentDim, paddingVertical: 13, marginBottom: 20 },
  backupBtnText: { fontSize: 14, fontWeight: '700', color: Colors.accent },

  syncCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.accentDim, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20, ...Shadow.card },
  syncCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  syncCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  syncCardSub: { fontSize: 12, color: Colors.text3, marginTop: 2 },

  tipText: { fontSize: 13, color: Colors.text3, lineHeight: 20, backgroundColor: Colors.surface2, borderRadius: Radius.md, padding: 14, borderLeftWidth: 3, borderLeftColor: Colors.accent },

  // Sync modal
  syncModalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  syncModal: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '92%' },
  syncModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  syncModalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  syncSectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10, marginTop: 16 },
  syncSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 10 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  loadingText: { color: Colors.text3, fontSize: 14 },

  emptySync: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  emptySyncText: { fontSize: 14, color: Colors.text3, textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
  serverPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface2, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.accentDim },
  serverPillText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },

  fileList: { backgroundColor: Colors.surface2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 16 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  fileName: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: '500' },
  fileSize: { fontSize: 12, color: Colors.text3 },

  syncAllBtn: { backgroundColor: Colors.accent, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, marginBottom: 16, ...Shadow.accent },
  syncAllBtnText: { fontSize: 14, fontWeight: '800', color: Colors.bg },

  progressBox: { marginVertical: 16, gap: 8 },
  progressLabel: { fontSize: 13, color: Colors.text3, textAlign: 'center' },
  progressBarBg: { height: 8, backgroundColor: Colors.surface2, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 4 },
  progressText: { fontSize: 13, color: Colors.text2, textAlign: 'center', fontWeight: '700' },

  logBox: { backgroundColor: Colors.surface2, borderRadius: Radius.md, padding: 14, gap: 3, marginBottom: 16 },
  logLine: { fontSize: 12, color: Colors.text2, lineHeight: 20 },

  viewLibraryBtn: { backgroundColor: Colors.accent, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 4 },
  viewLibraryBtnText: { fontSize: 15, fontWeight: '800', color: Colors.bg },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '70%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 16 },
  folderOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  folderOptionEmoji: { fontSize: 26 },
  folderOptionName: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.text },
  folderOptionNameActive: { color: Colors.accent },
});
