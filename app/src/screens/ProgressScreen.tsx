import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Platform,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../services/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

// ── Theme ─────────────────────────────────────────────────────────────────────
const BG         = '#0D0D0D';
const CARD_BG    = '#1A1A1A';
const ROW_BG     = '#242424';
const CHARTREUSE = '#CFFF00';
const WHITE      = '#FFFFFF';
const GRAY       = '#888888';
const BORDER     = '#2A2A2A';
const GREEN      = '#34C759';
const ORANGE     = '#FF9500';
const RED        = '#FF3B30';
const NEON       = '#00F5FF';
const MAX_BAR_H  = 90;
// ──────────────────────────────────────────────────────────────────────────────

// ── Muscle group config ───────────────────────────────────────────────────────
const MUSCLE_GROUPS: { name: string; color: string; keywords: string[] }[] = [
  { name: 'Chest',     color: '#FF6B6B', keywords: ['bench', 'fly', 'chest', 'push', 'pec', 'dip'] },
  { name: 'Back',      color: '#4ECDC4', keywords: ['row', 'pull', 'lat', 'deadlift', 'rdl'] },
  { name: 'Legs',      color: CHARTREUSE, keywords: ['squat', 'lunge', 'leg', 'calf', 'glute', 'hip', 'hamstring'] },
  { name: 'Shoulders', color: '#A78BFA', keywords: ['press', 'shoulder', 'lateral', 'raise', 'shrug', 'delt', 'overhead'] },
  { name: 'Arms',      color: '#FB923C', keywords: ['curl', 'extension', 'tricep', 'bicep'] },
  { name: 'Core',      color: '#60A5FA', keywords: ['plank', 'crunch', 'ab', 'sit', 'twist', 'rotation'] },
  { name: 'Cardio',    color: '#F472B6', keywords: ['run', 'jog', 'bike', 'cycle', 'jump', 'sprint', 'walk', 'cardio'] },
];

function inferMuscleGroup(exerciseName: string): string | null {
  const lower = exerciseName.toLowerCase();
  for (const g of MUSCLE_GROUPS) {
    if (g.keywords.some(k => lower.includes(k))) return g.name;
  }
  return null;
}
// ──────────────────────────────────────────────────────────────────────────────

type SetLog = {
  weight?: number;
  reps?: number;
  duration?: number;
  distance_miles?: number;
  completed_rounds?: number;
};

type SessionLog = {
  name: string;
  type?: string;
  setsLogs?: SetLog[];
};

type LoggedData = {
  total_exercises?: number;
  completed_indices?: number[];
  feedback?: string;
  actual_volume?: number;
  duration_mins?: number;
  is_partial?: boolean;
  session_logs?: SessionLog[];
};

type WorkoutLog = {
  date: string;
  logged_data: LoggedData;
};

type PR = { name: string; weight: number; trend: 'up' | 'down' | 'same' };

export const ProgressScreen = () => {
  const [loading, setLoading] = useState(true);

  // Calendar
  const [markedDates, setMarkedDates] = useState<any>({});

  // Stats row
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [workoutsThisMonth, setWorkoutsThisMonth] = useState(0);
  const [completionRate, setCompletionRate] = useState(0);

  // Effort trend
  const [effortDots, setEffortDots] = useState<(1 | 2 | 3)[]>([]);

  // Muscle balance
  const [muscleBalance, setMuscleBalance] = useState<Record<string, number>>({});

  // Strength PRs
  const [strengthPRs, setStrengthPRs] = useState<PR[]>([]);

  // AI insight — cached by workout count
  const [aiInsight, setAiInsight] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(true);
  const aiCacheRef = React.useRef<{ insight: string; workoutCount: number } | null>(null);

  // Weekly volume chart
  const [weeklyVolume, setWeeklyVolume] = useState<{ label: string; volume: number }[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      fetchAll();
    }, [])
  );

  const fetchAll = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

      // Run all fetches in parallel
      const [allLogsRes, recentLogsRes, streakRes] = await Promise.all([
        supabase.from('workout_logs').select('date, logged_data').eq('user_id', user.id),
        supabase.from('workout_logs')
          .select('date, logged_data')
          .eq('user_id', user.id)
          .gte('date', cutoff)
          .order('date', { ascending: false }),
        supabase.from('streaks')
          .select('current_streak, longest_streak')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      const allLogs: WorkoutLog[] = allLogsRes.data ?? [];
      const recentLogs: WorkoutLog[] = recentLogsRes.data ?? [];

      // ── Streak ───────────────────────────────────────────────────────────
      setCurrentStreak(streakRes.data?.current_streak ?? 0);
      setLongestStreak(streakRes.data?.longest_streak ?? 0);

      // ── Calendar heatmap ─────────────────────────────────────────────────
      const newMarked: any = {};
      let perfect = 0;
      let partial = 0;

      allLogs.forEach((log) => {
        const total = log.logged_data?.total_exercises || 0;
        const completedCount = log.logged_data?.completed_indices?.length || 0;
        if (total > 0 && completedCount > 0) {
          if (completedCount === total) {
            perfect++;
            newMarked[log.date] = { selected: true, selectedColor: GREEN, marked: true, dotColor: WHITE, activeOpacity: 1 };
          } else {
            partial++;
            newMarked[log.date] = { selected: true, selectedColor: ORANGE, marked: true, dotColor: WHITE, activeOpacity: 1 };
          }
        }
      });
      setMarkedDates(newMarked);

      // ── Consistency stats ─────────────────────────────────────────────────
      const thisMonthCount = recentLogs.filter(l => (l.logged_data?.total_exercises ?? 0) > 0).length;
      setWorkoutsThisMonth(thisMonthCount);
      const total = perfect + partial;
      setCompletionRate(total > 0 ? Math.round((perfect / total) * 100) : 0);

      // ── Effort trend (last 8 sessions with feedback) ──────────────────────
      const withFeedback = recentLogs
        .filter(l => l.logged_data?.feedback)
        .slice(0, 8)
        .reverse();
      const dots = withFeedback.map(l => {
        const f = l.logged_data.feedback;
        if (f === 'Too Easy') return 1 as const;
        if (f === 'Too Hard') return 3 as const;
        return 2 as const;
      });
      setEffortDots(dots);

      // ── Muscle group balance (last 30 days) ───────────────────────────────
      const balance: Record<string, number> = {};
      recentLogs.forEach(log => {
        const seen = new Set<string>();
        (log.logged_data?.session_logs ?? []).forEach(ex => {
          const group = inferMuscleGroup(ex.name);
          if (group && !seen.has(group)) {
            seen.add(group);
            balance[group] = (balance[group] ?? 0) + 1;
          }
        });
      });
      setMuscleBalance(balance);

      // ── Strength PRs (all-time, top 5 with weight data) ──────────────────
      const prMap: Record<string, { sessions: { weight: number; date: string }[] }> = {};

      allLogs.forEach(log => {
        (log.logged_data?.session_logs ?? []).forEach(ex => {
          const maxWeight = Math.max(0, ...(ex.setsLogs ?? []).map(s => s.weight ?? 0));
          if (maxWeight > 0) {
            if (!prMap[ex.name]) prMap[ex.name] = { sessions: [] };
            prMap[ex.name].sessions.push({ weight: maxWeight, date: log.date });
          }
        });
      });

      const prs: PR[] = Object.entries(prMap)
        .map(([name, { sessions }]) => {
          const sorted = sessions.sort((a, b) => b.date.localeCompare(a.date));
          const best = Math.max(...sorted.map(s => s.weight));
          const previous = sorted.length > 1
            ? Math.max(...sorted.slice(1).map(s => s.weight))
            : best;
          const trend: 'up' | 'down' | 'same' =
            best > previous ? 'up' : best < previous ? 'down' : 'same';
          return { name, weight: best, trend };
        })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5);

      setStrengthPRs(prs);

      // ── Weekly volume (last 6 weeks) ──────────────────────────────────────
      const getWeekStart = (dateStr: string): string => {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        return d.toISOString().split('T')[0];
      };

      const weeks: { label: string; volume: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        const ws = getWeekStart(d.toISOString().split('T')[0]);
        weeks.push({ label: ws.slice(5).replace('-', '/'), volume: 0 });
      }
      allLogs.forEach(log => {
        const ws = getWeekStart(log.date).slice(5).replace('-', '/');
        const idx = weeks.findIndex(w => w.label === ws);
        if (idx !== -1) weeks[idx].volume += log.logged_data?.actual_volume ?? 0;
      });
      setWeeklyVolume(weeks);

      // Fire AI insight non-blocking — only if workout count changed
      fetchAiInsight(user.id, allLogs.length);

    } catch (err) {
      console.error('Error fetching insights:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAiInsight = async (userId: string, workoutCount: number) => {
    // Use cached insight if workout count hasn't changed
    if (aiCacheRef.current && aiCacheRef.current.workoutCount === workoutCount) {
      setAiInsight(aiCacheRef.current.insight);
      setAiLoading(false);
      return;
    }
    try {
      setAiLoading(true);
      const { data, error } = await supabase.functions.invoke('agent-companion', {
        body: {
          userId,
          message: 'In 2–3 sentences, give me a personalized insight about my recent training based on my workout history, effort levels, and streaks.',
          context: { screen: 'ProgressScreen' },
        },
      });
      if (!error && data?.response) {
        aiCacheRef.current = { insight: data.response, workoutCount };
        setAiInsight(data.response);
      }
    } catch (err) {
      console.error('AI insight error:', err);
    } finally {
      setAiLoading(false);
    }
  };

  // ── Effort summary sentence ────────────────────────────────────────────────
  const effortSummary = (): string => {
    if (effortDots.length === 0) return 'Log more workouts to see your effort trend.';
    const last3 = effortDots.slice(-3);
    if (last3.length === 3 && last3.every(d => d === 3)) return 'Last sessions felt very hard — consider a deload.';
    if (last3.length === 3 && last3.every(d => d === 1)) return 'Workouts feeling easy — time to level up.';
    return 'Training intensity looks balanced.';
  };

  const effortColor = (score: 1 | 2 | 3) => {
    if (score === 1) return GREEN;
    if (score === 3) return RED;
    return CHARTREUSE;
  };

  const effortLabel = (score: 1 | 2 | 3) => {
    if (score === 1) return 'Easy';
    if (score === 3) return 'Hard';
    return 'Good';
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={CHARTREUSE} />
      </View>
    );
  }

  const maxMuscleCount = Math.max(1, ...Object.values(muscleBalance));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── Brand Bar ─────────────────────────────────────────────────── */}
        <View style={styles.brandBar}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={16} color={CHARTREUSE} />
          </View>
          <Text style={styles.brandName}>SparkFit</Text>
          <Ionicons name="notifications-outline" size={22} color={WHITE} />
        </View>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={styles.headerSection}>
          <Text style={styles.title}>Insights</Text>
          <Text style={styles.subtitle}>Your training at a glance</Text>
        </View>

        {/* ── Stats Row ─────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIconCircle, { backgroundColor: CHARTREUSE + '22' }]}>
              <Ionicons name="flash" size={18} color={CHARTREUSE} />
            </View>
            <Text style={styles.statValue}>{currentStreak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconCircle, { backgroundColor: GREEN + '22' }]}>
              <Ionicons name="calendar" size={18} color={GREEN} />
            </View>
            <Text style={styles.statValue}>{workoutsThisMonth}</Text>
            <Text style={styles.statLabel}>This Month</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconCircle, { backgroundColor: ORANGE + '22' }]}>
              <Ionicons name="checkmark-circle" size={18} color={ORANGE} />
            </View>
            <Text style={styles.statValue}>{completionRate}%</Text>
            <Text style={styles.statLabel}>Completion</Text>
          </View>
        </View>

        {/* ── AI Coach Insight Card ─────────────────────────────────────── */}
        <View style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={14} color={NEON} />
            <Text style={styles.aiHeaderText}>AI Coach Insight</Text>
          </View>
          {aiLoading ? (
            <View style={styles.aiSkeleton}>
              <View style={[styles.aiSkeletonLine, { width: '100%' }]} />
              <View style={[styles.aiSkeletonLine, { width: '85%' }]} />
              <View style={[styles.aiSkeletonLine, { width: '60%' }]} />
            </View>
          ) : (
            <Text style={styles.aiBody}>
              {aiInsight || 'Log a few workouts and I\'ll give you personalized feedback.'}
            </Text>
          )}
        </View>

        {/* ── Calendar Card ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Activity Calendar</Text>
          {Platform.OS !== 'web' ? (
            <Calendar
              markedDates={markedDates}
              theme={{
                backgroundColor: 'transparent',
                calendarBackground: 'transparent',
                textSectionTitleColor: GRAY,
                dayTextColor: WHITE,
                todayTextColor: CHARTREUSE,
                selectedDayTextColor: WHITE,
                monthTextColor: WHITE,
                arrowColor: CHARTREUSE,
                textDisabledColor: '#444',
                dotColor: WHITE,
                selectedDotColor: WHITE,
              } as any}
              style={styles.calendar}
              disableAllTouchEventsForDisabledDays={true}
            />
          ) : (
            <View style={styles.calendarFallback}>
              <Text style={styles.fallbackText}>Calendar unavailable on Web</Text>
              <Text style={[styles.fallbackText, { color: CHARTREUSE, marginTop: 8 }]}>
                Total Active Days: {workoutsThisMonth}
              </Text>
            </View>
          )}
          <View style={styles.calendarLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: GREEN }]} />
              <Text style={styles.legendText}>Full workout</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: ORANGE }]} />
              <Text style={styles.legendText}>Partial</Text>
            </View>
          </View>
        </View>

        {/* ── Weekly Volume Chart ───────────────────────────────────────── */}
        {weeklyVolume.length > 0 && (() => {
          const maxVol = Math.max(1, ...weeklyVolume.map(w => w.volume));
          const currentWeekLabel = (() => {
            const d = new Date();
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff);
            return d.toISOString().split('T')[0].slice(5).replace('-', '/');
          })();
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Weekly Volume</Text>
              <Text style={styles.cardSubtitle}>Total sets per week — last 6 weeks</Text>
              <View style={styles.barsContainer}>
                {weeklyVolume.map((week, i) => {
                  const isCurrentWeek = week.label === currentWeekLabel;
                  const barH = week.volume > 0
                    ? Math.max(8, (week.volume / maxVol) * MAX_BAR_H)
                    : 4;
                  return (
                    <View key={i} style={styles.barColumn}>
                      {week.volume > 0 && (
                        <Text style={styles.barValue}>{week.volume}</Text>
                      )}
                      <View style={[
                        styles.bar,
                        {
                          height: barH,
                          backgroundColor: week.volume === 0
                            ? ROW_BG
                            : isCurrentWeek
                              ? CHARTREUSE
                              : 'rgba(207,255,0,0.4)',
                        },
                      ]} />
                      <Text style={[styles.barLabel, isCurrentWeek && styles.barLabelToday]}>
                        {week.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {/* ── Effort Trend Card ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Effort Trend</Text>
          <Text style={styles.cardSubtitle}>Last {effortDots.length || 8} sessions</Text>

          {effortDots.length === 0 ? (
            <Text style={styles.emptyText}>No sessions logged yet.</Text>
          ) : (
            <View style={styles.effortDotsRow}>
              {effortDots.map((score, i) => (
                <View key={i} style={styles.effortDotWrapper}>
                  <View style={[styles.effortDot, { backgroundColor: effortColor(score) }]} />
                  <Text style={[styles.effortDotLabel, { color: effortColor(score) }]}>
                    {effortLabel(score)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.effortSummaryRow}>
            <Ionicons name="information-circle-outline" size={14} color={GRAY} />
            <Text style={styles.effortSummaryText}>{effortSummary()}</Text>
          </View>
        </View>

        {/* ── Muscle Balance Card ───────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Muscle Groups</Text>
          <Text style={styles.cardSubtitle}>Sessions per group — last 30 days</Text>

          {MUSCLE_GROUPS.map(group => {
            const count = muscleBalance[group.name] ?? 0;
            const barWidth = count === 0 ? 0 : Math.max(6, (count / maxMuscleCount) * 100);
            return (
              <View key={group.name} style={styles.muscleRow}>
                <Text style={styles.muscleName}>{group.name}</Text>
                <View style={styles.muscleBarTrack}>
                  {count === 0 ? (
                    <View style={[styles.muscleBarFill, { width: '4%', backgroundColor: BORDER }]} />
                  ) : (
                    <View style={[styles.muscleBarFill, { width: `${barWidth}%`, backgroundColor: group.color }]} />
                  )}
                </View>
                <Text style={[styles.muscleCount, { color: count === 0 ? GRAY : WHITE }]}>
                  {count === 0 ? '—' : `${count}x`}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── Strength PRs Card (only if weight data exists) ────────────── */}
        {strengthPRs.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Personal Records</Text>
            <Text style={styles.cardSubtitle}>Best weight per exercise — all time</Text>

            {strengthPRs.map((pr, i) => (
              <View key={pr.name} style={[styles.prRow, i < strengthPRs.length - 1 && styles.prRowDivider]}>
                <View style={[styles.prRankCircle, { backgroundColor: i === 0 ? CHARTREUSE + '22' : ROW_BG }]}>
                  <Text style={[styles.prRank, { color: i === 0 ? CHARTREUSE : GRAY }]}>{i + 1}</Text>
                </View>
                <Text style={styles.prName} numberOfLines={1}>{pr.name}</Text>
                <View style={styles.prRight}>
                  <Text style={styles.prWeight}>{pr.weight} lbs</Text>
                  <Ionicons
                    name={pr.trend === 'up' ? 'trending-up' : pr.trend === 'down' ? 'trending-down' : 'remove'}
                    size={16}
                    color={pr.trend === 'up' ? GREEN : pr.trend === 'down' ? RED : GRAY}
                    style={{ marginLeft: 6 }}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Longest Streak Banner ────────────────────────────────────── */}
        <View style={styles.streakBanner}>
          <Ionicons name="trophy-outline" size={18} color={CHARTREUSE} />
          <Text style={styles.streakBannerText}>
            Longest streak: <Text style={{ color: CHARTREUSE, fontWeight: '800' }}>{longestStreak} days</Text>
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  container: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG },

  // Brand Bar
  brandBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  avatarCircle: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, borderColor: CHARTREUSE,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  brandName: { flex: 1, fontSize: 18, fontWeight: '800', color: WHITE, letterSpacing: 0.3 },

  // Header
  headerSection: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', color: WHITE, marginBottom: 4 },
  subtitle: { fontSize: 14, color: GRAY, fontWeight: '500' },

  // Stats Row
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: CARD_BG, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER, padding: 14, alignItems: 'center',
  },
  statIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: WHITE, marginBottom: 2 },
  statLabel: { fontSize: 11, fontWeight: '600', color: GRAY, textAlign: 'center' },

  // Card
  card: {
    backgroundColor: CARD_BG, borderRadius: 20, borderWidth: 1,
    borderColor: BORDER, padding: 20, marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: WHITE, marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: GRAY, fontWeight: '500', marginBottom: 16 },
  emptyText: { fontSize: 13, color: GRAY, textAlign: 'center', paddingVertical: 12 },

  // Calendar
  calendar: { borderRadius: 12 },
  calendarFallback: { padding: 20, alignItems: 'center' },
  fallbackText: { color: GRAY, fontSize: 14 },
  calendarLegend: { flexDirection: 'row', gap: 20, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: GRAY },

  // Effort Trend
  effortDotsRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  effortDotWrapper: { alignItems: 'center', gap: 4 },
  effortDot: { width: 28, height: 28, borderRadius: 14 },
  effortDotLabel: { fontSize: 9, fontWeight: '700' },
  effortSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  effortSummaryText: { fontSize: 12, color: GRAY, flex: 1 },

  // Muscle Balance
  muscleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  muscleName: { width: 78, fontSize: 13, color: WHITE, fontWeight: '600' },
  muscleBarTrack: { flex: 1, height: 8, backgroundColor: ROW_BG, borderRadius: 4, marginHorizontal: 10 },
  muscleBarFill: { height: 8, borderRadius: 4 },
  muscleCount: { width: 28, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  // PRs
  prRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  prRowDivider: { borderBottomWidth: 1, borderBottomColor: BORDER },
  prRankCircle: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  prRank: { fontSize: 12, fontWeight: '800' },
  prName: { flex: 1, fontSize: 14, color: WHITE, fontWeight: '500' },
  prRight: { flexDirection: 'row', alignItems: 'center' },
  prWeight: { fontSize: 14, fontWeight: '800', color: WHITE },

  // AI Card
  aiCard: {
    backgroundColor: CARD_BG, borderRadius: 20, borderWidth: 1,
    borderColor: BORDER, padding: 20, marginBottom: 16,
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  aiHeaderText: { fontSize: 13, fontWeight: '700', color: NEON, letterSpacing: 0.5 },
  aiBody: { fontSize: 14, color: WHITE, lineHeight: 22, fontStyle: 'italic' },
  aiSkeleton: { gap: 8 },
  aiSkeletonLine: { height: 12, backgroundColor: ROW_BG, borderRadius: 6 },

  // Volume Chart
  barsContainer: {
    flexDirection: 'row', alignItems: 'flex-end',
    height: MAX_BAR_H + 40, paddingTop: 8,
  },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: 22, borderRadius: 6, marginBottom: 6 },
  barValue: { fontSize: 10, color: WHITE, fontWeight: '700', marginBottom: 4 },
  barLabel: { fontSize: 9, color: GRAY, fontWeight: '600', textAlign: 'center' },
  barLabelToday: { color: CHARTREUSE },

  // Streak Banner
  streakBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: CARD_BG, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER, padding: 16,
  },
  streakBannerText: { fontSize: 14, color: WHITE, fontWeight: '500' },
});
