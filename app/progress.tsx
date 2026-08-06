import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ScrollView, StatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { MediaItem, Storage } from '../src/store/storage';
import { useSwipeTabNavigation } from '../src/utils/swipeTabNavigation';
import { Colors, Radius } from '../src/utils/theme';

const SESSIONS_KEY = 'lifegrower_sessions';

interface Session {
  id: string; label: string; duration: number; completedAt: number;
}

interface Achievement {
  id: string; emoji: string; title: string; desc: string; unlocked: boolean;
}

export default function ProgressScreen() {
  const swipeGesture = useSwipeTabNavigation();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  const load = useCallback(async () => {
    const [allItems, rawSessions] = await Promise.all([
      Storage.getAll(),
      AsyncStorage.getItem(SESSIONS_KEY),
    ]);
    setItems(allItems);
    setSessions(rawSessions ? JSON.parse(rawSessions) : []);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalWatches = items.reduce((s, i) => s + (i.watchCount || 0), 0);
  const comprehendedCount = items.filter(i => i.comprehended).length;
  const videosCount = items.filter(i => i.type === 'video').length;
  const photosCount = items.filter(i => i.type === 'photo').length;
  const withNotes = items.filter(i => i.note?.trim()).length;
  const totalFocusTime = sessions.reduce((s, se) => s + se.duration, 0);
  const focusSessions = sessions.length;

  const todayFocus = sessions
    .filter(s => new Date(s.completedAt).toDateString() === new Date().toDateString())
    .reduce((s, se) => s + se.duration, 0);

  // Most watched item
  const mostWatched = [...items].sort((a, b) => (b.watchCount || 0) - (a.watchCount || 0))[0];

  const achievements: Achievement[] = [
    {
      id: 'first', emoji: '🌱', title: 'First Seed',
      desc: 'Added your first item to the library',
      unlocked: items.length >= 1,
    },
    {
      id: 'watcher', emoji: '👀', title: 'Repeat Watcher',
      desc: 'Watched a video 3+ times',
      unlocked: items.some(i => (i.watchCount || 0) >= 3),
    },
    {
      id: 'thinker', emoji: '🧠', title: 'Reflective Thinker',
      desc: 'Added notes to 3+ items',
      unlocked: withNotes >= 3,
    },
    {
      id: 'grad', emoji: '🎓', title: 'First Graduate',
      desc: 'Marked your first item as comprehended',
      unlocked: comprehendedCount >= 1,
    },
    {
      id: 'library', emoji: '📚', title: 'Curator',
      desc: 'Built a library of 10+ items',
      unlocked: items.length >= 10,
    },
    {
      id: 'focus', emoji: '🍅', title: 'Focus Master',
      desc: 'Completed 10 focus sessions',
      unlocked: focusSessions >= 10,
    },
    {
      id: 'hour', emoji: '⌚', title: 'Hour of Power',
      desc: 'Accumulated 1 hour of total focus time',
      unlocked: totalFocusTime >= 3600,
    },
    {
      id: 'comprehender', emoji: '🏆', title: 'Master Grower',
      desc: 'Comprehended 5+ items',
      unlocked: comprehendedCount >= 5,
    },
  ];

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  function formatTime(s: number) {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  const STATS = [
    { icon: 'grid-outline', label: 'Total Items', value: items.length, color: Colors.blue },
    { icon: 'film-outline', label: 'Videos', value: videosCount, color: Colors.accent },
    { icon: 'image-outline', label: 'Photos', value: photosCount, color: Colors.blue },
    { icon: 'eye-outline', label: 'Total Views', value: totalWatches, color: Colors.accent },
    { icon: 'checkmark-circle-outline', label: 'Comprehended', value: comprehendedCount, color: Colors.green },
    { icon: 'journal-outline', label: 'With Notes', value: withNotes, color: Colors.accent },
    { icon: 'timer-outline', label: 'Focus Time', value: formatTime(totalFocusTime), color: Colors.blue },
    { icon: 'flame-outline', label: 'Sessions', value: focusSessions, color: Colors.accent2 },
  ];

  const completionPct = items.length > 0
    ? Math.round((comprehendedCount / items.length) * 100)
    : 0;

  return (
    <GestureDetector gesture={swipeGesture}>
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Growth Board 🏆</Text>
          <Text style={styles.headerSub}>Your personal progress snapshot</Text>
        </View>

        {/* Today card */}
        <View style={styles.todayCard}>
          <View style={styles.todayLeft}>
            <Text style={styles.todayLabel}>TODAY'S FOCUS</Text>
            <Text style={styles.todayVal}>{formatTime(todayFocus)}</Text>
            <Text style={styles.todayDesc}>Keep growing today! 💪</Text>
          </View>
          <View style={styles.todayRight}>
            <Text style={styles.bigEmoji}>🌿</Text>
          </View>
        </View>

        {/* Comprehension progress bar */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Library Mastery</Text>
            <Text style={styles.progressPct}>{completionPct}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${completionPct}%` }]} />
          </View>
          <Text style={styles.progressSub}>
            {comprehendedCount} of {items.length} items truly comprehended
          </Text>
        </View>

        {/* Stats grid */}
        <Text style={styles.sectionTitle}>All-Time Stats</Text>
        <View style={styles.statsGrid}>
          {STATS.map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Ionicons name={s.icon as any} size={20} color={s.color} />
              <Text style={styles.statVal}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Most watched */}
        {mostWatched && mostWatched.watchCount > 0 && (
          <View style={styles.featuredCard}>
            <View style={styles.featuredTop}>
              <Ionicons name="star" size={16} color={Colors.accent} />
              <Text style={styles.featuredBadge}>MOST WATCHED</Text>
            </View>
            <Text style={styles.featuredTitle}>{mostWatched.title}</Text>
            <Text style={styles.featuredStat}>Viewed {mostWatched.watchCount}× — keep it going!</Text>
          </View>
        )}

        {/* Achievements */}
        <View style={styles.achievHeader}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <Text style={styles.achievCount}>
            {unlockedCount}/{achievements.length} unlocked
          </Text>
        </View>
        <View style={styles.achievGrid}>
          {achievements.map(a => (
            <View key={a.id} style={[styles.achievCard, !a.unlocked && styles.achievCardLocked]}>
              <Text style={[styles.achievEmoji, !a.unlocked && styles.achievEmojiLocked]}>
                {a.unlocked ? a.emoji : '🔒'}
              </Text>
              <Text style={[styles.achievTitle, !a.unlocked && styles.achievTitleLocked]}>
                {a.title}
              </Text>
              <Text style={styles.achievDesc}>{a.desc}</Text>
            </View>
          ))}
        </View>

        {/* Motivational quote */}
        <View style={styles.quoteCard}>
          <Text style={styles.quoteText}>
            "The secret of getting ahead is getting started. Watch, reflect, apply — repeat."
          </Text>
          <Text style={styles.quoteAuthor}>— Your LifeGrower journey</Text>
        </View>

      </ScrollView>
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 20 },
  headerTitle: {
    fontSize: 28, fontWeight: '800', color: Colors.text,
    fontFamily: 'Georgia', letterSpacing: 0.5,
  },
  headerSub: { fontSize: 14, color: Colors.text3, marginTop: 4 },

  todayCard: {
    backgroundColor: Colors.accentGlow,
    borderRadius: Radius.lg, padding: 20, marginBottom: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.accentDim,
  },
  todayLeft: { gap: 4 },
  todayLabel: { fontSize: 11, fontWeight: '700', color: Colors.accentDim, letterSpacing: 1 },
  todayVal: { fontSize: 36, fontWeight: '900', color: Colors.accent },
  todayDesc: { fontSize: 13, color: Colors.text2 },
  todayRight: {},
  bigEmoji: { fontSize: 52 },

  progressCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 16, marginBottom: 28,
    borderWidth: 1, borderColor: Colors.border,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  progressPct: { fontSize: 14, fontWeight: '800', color: Colors.accent },
  progressBar: {
    height: 8, backgroundColor: Colors.surface3, borderRadius: 4, overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%', backgroundColor: Colors.green, borderRadius: 4,
  },
  progressSub: { fontSize: 12, color: Colors.text3 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.text3,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24,
  },
  statCard: {
    width: '47%', backgroundColor: Colors.surface,
    borderRadius: Radius.md, padding: 16, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  statVal: { fontSize: 24, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.text3, textAlign: 'center' },

  featuredCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 16, marginBottom: 28,
    borderWidth: 1.5, borderColor: Colors.accentDim,
    borderLeftWidth: 4, borderLeftColor: Colors.accent,
  },
  featuredTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  featuredBadge: { fontSize: 11, fontWeight: '700', color: Colors.accent, letterSpacing: 1 },
  featuredTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  featuredStat: { fontSize: 13, color: Colors.text3 },

  achievHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  achievCount: { fontSize: 13, color: Colors.accent, fontWeight: '700' },
  achievGrid: { gap: 10, marginBottom: 24 },
  achievCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  achievCardLocked: { opacity: 0.4 },
  achievEmoji: { fontSize: 28, minWidth: 36, textAlign: 'center' },
  achievEmojiLocked: { fontSize: 22 },
  achievTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  achievTitleLocked: { color: Colors.text3 },
  achievDesc: { fontSize: 12, color: Colors.text3, flex: 1 },

  quoteCard: {
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    padding: 20, borderLeftWidth: 4, borderLeftColor: Colors.accent,
  },
  quoteText: { fontSize: 15, color: Colors.text2, fontStyle: 'italic', lineHeight: 24 },
  quoteAuthor: { fontSize: 12, color: Colors.accent, fontWeight: '700', marginTop: 10 },
});
