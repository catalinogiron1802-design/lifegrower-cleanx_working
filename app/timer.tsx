import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSwipeTabNavigation } from '../src/utils/swipeTabNavigation';
import { Colors, Radius, Shadow } from '../src/utils/theme';

const SESSIONS_KEY = 'lifegrower_sessions';

interface Session {
  id: string;
  label: string;
  duration: number; // seconds
  completedAt: number;
}

const PRESETS = [
  { label: '5 min', seconds: 5 * 60, emoji: '⚡', desc: 'Quick review' },
  { label: '15 min', seconds: 15 * 60, emoji: '🎯', desc: 'Focused watch' },
  { label: '25 min', seconds: 25 * 60, emoji: '🍅', desc: 'Pomodoro' },
  { label: '45 min', seconds: 45 * 60, emoji: '🔥', desc: 'Deep study' },
  { label: '1 hour', seconds: 60 * 60, emoji: '🏆', desc: 'Full session' },
];

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export default function TimerScreen() {
  const swipeGesture = useSwipeTabNavigation();
  const [totalSecs, setTotalSecs] = useState(25 * 60);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [sessionLabel, setSessionLabel] = useState('Focus Session');
  const [sessions, setSessions] = useState<Session[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            setFinished(true);
            Vibration.vibrate([0, 400, 200, 400, 200, 800]);
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const loadSessions = async () => {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    setSessions(raw ? JSON.parse(raw) : []);
  };

  const handleComplete = async () => {
    const newSession: Session = {
      id: Date.now().toString(),
      label: sessionLabel,
      duration: totalSecs,
      completedAt: Date.now(),
    };
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    const all: Session[] = raw ? JSON.parse(raw) : [];
    const updated = [newSession, ...all].slice(0, 50);
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
    setSessions(updated);
    Alert.alert(
      '🎉 Session Complete!',
      `You focused for ${formatTime(totalSecs)}. That's growth! Keep it up.`,
      [{ text: 'Nice!' }]
    );
  };

  const setPreset = (seconds: number) => {
    if (running) return;
    setTotalSecs(seconds);
    setRemaining(seconds);
    setFinished(false);
    setCustomMinutes('');
  };

  const applyCustom = () => {
    const mins = parseInt(customMinutes);
    if (!mins || mins < 1 || mins > 180) {
      Alert.alert('Invalid', 'Enter a number between 1 and 180 minutes.');
      return;
    }
    setPreset(mins * 60);
  };

  const toggleTimer = () => {
    if (finished) {
      setRemaining(totalSecs);
      setFinished(false);
    }
    setRunning(r => !r);
  };

  const resetTimer = () => {
    setRunning(false);
    setRemaining(totalSecs);
    setFinished(false);
  };

  const progress = 1 - remaining / totalSecs;
  const progressDeg = progress * 360;

  const todayTotal = sessions
    .filter(s => {
      const d = new Date(s.completedAt);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    })
    .reduce((sum, s) => sum + s.duration, 0);

  return (
    <GestureDetector gesture={swipeGesture}>
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Focus Timer ⏱</Text>
          <Text style={styles.headerSub}>Time your growth sessions</Text>
        </View>

        {/* Today's stats */}
        <View style={styles.todayBar}>
          <Ionicons name="flame" size={16} color={Colors.accent} />
          <Text style={styles.todayText}>
            Today: <Text style={styles.todayHighlight}>{formatTime(todayTotal)}</Text> of focused growth
          </Text>
        </View>

        {/* Session label */}
        <View style={styles.labelRow}>
          <Ionicons name="bookmark-outline" size={16} color={Colors.text3} />
          <TextInput
            style={styles.labelInput}
            value={sessionLabel}
            onChangeText={setSessionLabel}
            placeholder="Session name…"
            placeholderTextColor={Colors.text3}
            maxLength={50}
          />
        </View>

        {/* Clock circle */}
        <View style={styles.clockWrapper}>
          <View style={[styles.clockBg, finished && styles.clockBgDone]}>
            {/* Progress ring drawn with border trick */}
            <View style={styles.clockInner}>
              <Text style={[styles.clockTime, finished && styles.clockTimeDone]}>
                {formatTime(remaining)}
              </Text>
              <Text style={styles.clockSub}>
                {running ? 'Stay focused 🎯' : finished ? 'Well done! 🎉' : 'Ready to grow'}
              </Text>
              <Text style={styles.clockPct}>
                {Math.round(progress * 100)}% complete
              </Text>
            </View>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={resetTimer}
            disabled={remaining === totalSecs && !finished}
          >
            <Ionicons name="refresh" size={22} color={Colors.text2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playBtn, running && styles.pauseBtn, finished && styles.doneBtn]}
            onPress={toggleTimer}
          >
            <Ionicons
              name={finished ? 'reload' : running ? 'pause' : 'play'}
              size={36}
              color={Colors.bg}
            />
          </TouchableOpacity>

          <View style={{ width: 54 }} />
        </View>

        {/* Presets */}
        <Text style={styles.presetsTitle}>Quick Presets</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
          {PRESETS.map(p => (
            <TouchableOpacity
              key={p.label}
              style={[styles.presetChip, totalSecs === p.seconds && styles.presetChipActive]}
              onPress={() => setPreset(p.seconds)}
              disabled={running}
            >
              <Text style={styles.presetEmoji}>{p.emoji}</Text>
              <Text style={[styles.presetLabel, totalSecs === p.seconds && styles.presetLabelActive]}>
                {p.label}
              </Text>
              <Text style={styles.presetDesc}>{p.desc}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Custom time */}
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            value={customMinutes}
            onChangeText={setCustomMinutes}
            placeholder="Custom min…"
            placeholderTextColor={Colors.text3}
            keyboardType="number-pad"
            maxLength={3}
            editable={!running}
          />
          <TouchableOpacity style={styles.customBtn} onPress={applyCustom} disabled={running}>
            <Text style={styles.customBtnText}>Set</Text>
          </TouchableOpacity>
        </View>

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <View style={styles.histSection}>
            <Text style={styles.histTitle}>Recent Sessions</Text>
            {sessions.slice(0, 8).map(s => {
              const d = new Date(s.completedAt);
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <View key={s.id} style={styles.histItem}>
                  <View>
                    <Text style={styles.histLabel}>{s.label}</Text>
                    <Text style={styles.histDate}>
                      {isToday ? 'Today' : d.toLocaleDateString()} · {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={styles.histDuration}>
                    <Ionicons name="time-outline" size={13} color={Colors.accent} />
                    <Text style={styles.histDurText}>{formatTime(s.duration)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 16 },
  headerTitle: {
    fontSize: 28, fontWeight: '800', color: Colors.text,
    fontFamily: 'Georgia', letterSpacing: 0.5,
  },
  headerSub: { fontSize: 14, color: Colors.text3, marginTop: 4 },

  todayBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accentGlow, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.accentDim,
  },
  todayText: { fontSize: 14, color: Colors.text2 },
  todayHighlight: { color: Colors.accent, fontWeight: '800' },

  labelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 28,
  },
  labelInput: { flex: 1, color: Colors.text, fontSize: 15 },

  clockWrapper: { alignItems: 'center', marginBottom: 32 },
  clockBg: {
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: Colors.surface,
    borderWidth: 6, borderColor: Colors.accent,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.accent,
  },
  clockBgDone: { borderColor: Colors.green },
  clockInner: { alignItems: 'center', gap: 4 },
  clockTime: { fontSize: 48, fontWeight: '900', color: Colors.text, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  clockTimeDone: { color: Colors.green },
  clockSub: { fontSize: 14, color: Colors.text3 },
  clockPct: { fontSize: 12, color: Colors.text3 },

  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 24, marginBottom: 36,
  },
  resetBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Colors.surface2, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  playBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center',
    ...Shadow.accent,
  },
  pauseBtn: { backgroundColor: Colors.text2 },
  doneBtn: { backgroundColor: Colors.green },

  presetsTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.text3,
    letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase',
  },
  presetRow: { gap: 10, paddingBottom: 4, marginBottom: 16 },
  presetChip: {
    alignItems: 'center', gap: 3, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, minWidth: 85,
  },
  presetChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accentGlow },
  presetEmoji: { fontSize: 20 },
  presetLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  presetLabelActive: { color: Colors.accent },
  presetDesc: { fontSize: 11, color: Colors.text3 },

  customRow: { flexDirection: 'row', gap: 10, marginBottom: 32 },
  customInput: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    color: Colors.text, fontSize: 15,
  },
  customBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.sm,
    paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center',
  },
  customBtnText: { fontWeight: '700', color: Colors.bg, fontSize: 15 },

  histSection: { marginTop: 4 },
  histTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.text3,
    letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase',
  },
  histItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.sm,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  histLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  histDate: { fontSize: 12, color: Colors.text3, marginTop: 2 },
  histDuration: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.accentGlow, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  histDurText: { fontSize: 13, fontWeight: '700', color: Colors.accent },
});
