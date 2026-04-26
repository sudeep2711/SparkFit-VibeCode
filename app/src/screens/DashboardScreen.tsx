import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, TouchableOpacity } from 'react-native';
import { supabase } from '../services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

type DailyLogNavigationProp = NativeStackNavigationProp<RootStackParamList & { WorkoutPlan: undefined }, 'Main'>;

// ── Theme (matches WorkoutPlanScreen) ───────────────────────────
const BG         = '#0D0D0D';
const CARD_BG    = '#1A1A1A';
const ROW_BG     = '#242424';
const CHARTREUSE = '#CFFF00';
const WHITE      = '#FFFFFF';
const GRAY       = '#888888';
const BORDER     = '#2A2A2A';
const NEON       = '#00F5FF';
const GREEN      = '#34C759';
const STREAK_ORANGE = '#FF9500';
const ACCENT     = '#2E7BFF';  // Electric Blue for buttons

// ── Types ───────────────────────────────────────────────────────
type Exercise = {
  name: string;
  type: 'strength' | 'cardio' | 'interval' | 'calisthenics' | 'isometric';
  sets?: number;
  reps?: number;
  estimated_time_secs?: number;
  estimated_rest_time_secs?: number;
  interval_run_secs?: number;
  interval_walk_secs?: number;
  rounds?: number;
  hold_time_secs?: number;
  duration_secs?: number;
  distance_miles?: number;
  coach_tip?: string;
};

type DailyPlan = {
  day: string;
  focus: string;
  is_rest_day?: boolean;
  estimated_total_time_mins?: number;
  primary_muscle_group?: string;
  effort_level?: string;
  exercises: Exercise[];
};

// ── Helpers ─────────────────────────────────────────────────────
function deriveEffortLevel(dailyPlan: DailyPlan): string {
  if (dailyPlan.is_rest_day) return 'rest';
  if (dailyPlan.effort_level) return dailyPlan.effort_level;
  const n = dailyPlan.exercises.length;
  if (n >= 6) return 'hard';
  if (n >= 3) return 'moderate';
  return 'easy';
}

function getIntensityLabel(effortLevel: string): string {
  const effortMap: Record<string, string> = {
    hard: 'HIGH INTENSITY',
    moderate: 'MODERATE',
    easy: 'LIGHT SESSION',
    rest: 'REST DAY',
  };
  return effortMap[effortLevel] || 'WORKOUT';
}

function getEffortColor(effortLevel: string): string {
  switch (effortLevel) {
    case 'easy':     return GREEN;
    case 'moderate': return STREAK_ORANGE;
    case 'hard':     return '#FF3B30';
    case 'rest':     return GRAY;
    default:         return STREAK_ORANGE;
  }
}

function getExerciseSummary(ex: Exercise): string {
  if (ex.sets && ex.reps) return `${ex.sets} Sets of ${ex.name}`;
  if (ex.reps) return `${ex.name} (${ex.reps} Reps)`;
  if (ex.hold_time_secs) return `${ex.name} (${ex.hold_time_secs}s Hold)`;
  if (ex.duration_secs) return `${ex.name} (${Math.round(ex.duration_secs / 60)}m)`;
  if (ex.rounds) return `${ex.name} (${ex.rounds} Rounds)`;
  return ex.name;
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// Placeholder weekly calories burnt (will be replaced with real data later)
const PLACEHOLDER_CALORIES = [320, 480, 250, 550, 410, 180, 0];
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MAX_BAR_HEIGHT = 90;

// ── Screen ──────────────────────────────────────────────────────
export const DashboardScreen = () => {
  const navigation = useNavigation<DailyLogNavigationProp>();
  const [loading, setLoading] = useState(true);
  const [todayPlan, setTodayPlan] = useState<DailyPlan | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [currentStreak, setCurrentStreak] = useState(0);
  const [isCompletedToday, setIsCompletedToday] = useState(false);
  const [isPartialToday, setIsPartialToday] = useState(false);
  const [completedExerciseNames, setCompletedExerciseNames] = useState<string[]>([]);
  const [actualWorkoutMins, setActualWorkoutMins] = useState(0);
  const [actualRestMins, setActualRestMins] = useState(0);

  useEffect(() => {
    fetchPlan();
    const unsubscribe = navigation.addListener('focus', () => {
      fetchPlan();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchPlan = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError("User not authenticated");
        return;
      }

      const prefix = (user.email ?? '').split('@')[0];
      setDisplayName(prefix.charAt(0).toUpperCase() + prefix.slice(1));

      const { data: planData, error: planError } = await supabase
        .from('workout_plans')
        .select('id, plan_data')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (planError && planError.code !== 'PGRST116') {
        throw planError;
      }

      const rawPlan = planData?.plan_data;
      const weekPlan: DailyPlan[] = Array.isArray(rawPlan)
        ? rawPlan
        : Array.isArray(rawPlan?.week_plan)
          ? rawPlan.week_plan
          : [];

      supabase
        .from('streaks')
        .select('current_streak')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data: streakData }) => {
          setCurrentStreak(streakData?.current_streak ?? 0);
        });

      if (planData && weekPlan.length > 0) {
        setPlanId(planData.id);
        const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const byName = weekPlan.find((d: DailyPlan) => d.day.toLowerCase() === todayName.toLowerCase());
        const today = byName ?? weekPlan.find((d: DailyPlan) => !d.is_rest_day) ?? weekPlan[0];
        setTodayPlan(today);
        await checkTodayLogs(user.id, planData.id);
      }
    } catch (err: any) {
      console.error("Error fetching plan:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkTodayLogs = async (userId: string, currentPlanId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('workout_logs')
      .select('id, logged_data')
      .eq('user_id', userId)
      .eq('plan_id', currentPlanId)
      .eq('date', today)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching today log:", error);
    } else if (data && data.logged_data) {
      if (data.logged_data.is_partial) {
        setIsCompletedToday(false);
        setIsPartialToday(true);
      } else {
        setIsCompletedToday(true);
        setIsPartialToday(false);
      }
      if (data.logged_data.session_logs) {
        setCompletedExerciseNames(data.logged_data.session_logs.map((log: any) => log.name));
        let totalWorkoutSecs = 0;
        data.logged_data.session_logs.forEach((exerciseLog: any) => {
          exerciseLog.setsLogs.forEach((setLog: any) => {
            totalWorkoutSecs += (setLog.duration || 0);
          });
        });
        setActualWorkoutMins(Math.round(totalWorkoutSecs / 60));
        const totalDurationMins = data.logged_data.duration_mins || 0;
        setActualRestMins(Math.max(0, totalDurationMins - Math.round(totalWorkoutSecs / 60)));
      } else {
        setCompletedExerciseNames([]);
        setActualWorkoutMins(0);
        setActualRestMins(0);
      }
    } else {
      setIsCompletedToday(false);
      setIsPartialToday(false);
      setCompletedExerciseNames([]);
      setActualWorkoutMins(0);
      setActualRestMins(0);
    }
  };

  const handleStartWorkout = () => {
    if (planId && todayPlan) {
      navigation.navigate('WorkoutActive', { planId, dailyPlan: todayPlan });
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={CHARTREUSE} />
      </View>
    );
  }

  const effort = todayPlan ? deriveEffortLevel(todayPlan) : 'moderate';
  const intensityLabel = getIntensityLabel(effort);
  const effortColor = getEffortColor(effort);
  const formattedDate = getFormattedDate();
  const maxCount = Math.max(...PLACEHOLDER_CALORIES, 1);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand Bar ────────────────────────────── */}
        <View style={styles.brandBar}>
          <View style={styles.brandLeft}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={14} color={CHARTREUSE} />
            </View>
            <Text style={styles.brandName}>SparkFit</Text>
          </View>
          <TouchableOpacity>
            <Ionicons name="notifications-outline" size={22} color={GRAY} />
          </TouchableOpacity>
        </View>

        {/* ── Greeting ─────────────────────────────── */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingText}>
            Fuel your fire, {displayName}.
          </Text>
          <Text style={styles.greetingSubtext}>
            {formattedDate}{currentStreak > 0 ? ` \u2022 Day ${currentStreak} of your streak` : ''}
          </Text>
        </View>

        {error ? (
          <Text style={styles.errorText}>Error: {error}</Text>
        ) : todayPlan ? (
          <>
            {/* ── Workout Card ─────────────────────── */}
            <View style={styles.workoutCard}>
              {/* Tags */}
              <View style={styles.tagsRow}>
                <View style={[styles.intensityBadge, { backgroundColor: effortColor }]}>
                  <Text style={styles.intensityBadgeText}>{intensityLabel}</Text>
                </View>
                <Text style={styles.focusTag}>{todayPlan.focus}</Text>
              </View>

              {/* Title */}
              <Text style={styles.cardLabel}>Today's workout:</Text>
              <Text style={styles.cardTitle}>{todayPlan.focus}</Text>

              {/* Exercise Checklist */}
              {todayPlan.exercises.map((ex, i) => {
                const isExCompleted = isCompletedToday || completedExerciseNames.includes(ex.name);
                return (
                  <View
                    key={i}
                    style={[
                      styles.checklistRow,
                      i < todayPlan.exercises.length - 1 && styles.checklistRowBorder,
                    ]}
                  >
                    <View style={isExCompleted ? styles.checkCircleComplete : styles.checkCircleIncomplete}>
                      {isExCompleted && <Ionicons name="checkmark" size={14} color={BG} />}
                    </View>
                    <Text style={isExCompleted ? styles.checkTextComplete : styles.checkTextIncomplete}>
                      {getExerciseSummary(ex)}
                    </Text>
                  </View>
                );
              })}

              {/* Start Workout Button */}
              {todayPlan.exercises.length > 0 && (
                <TouchableOpacity
                  style={styles.startButton}
                  onPress={handleStartWorkout}
                  activeOpacity={0.8}
                >
                  <Text style={styles.startButtonText}>
                    {isCompletedToday || isPartialToday ? 'Restart Workout' : 'Start Workout'}
                  </Text>
                  <Ionicons
                    name={isCompletedToday || isPartialToday ? 'refresh' : 'play'}
                    size={18}
                    color={BG}
                    style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* ── AI Insight ───────────────────────── */}
            <View style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <Ionicons name="sparkles" size={18} color={NEON} />
                <Text style={styles.insightTitle}>AI Insight</Text>
              </View>
              <Text style={styles.insightQuote}>
                {isCompletedToday
                  ? '"Great job crushing your workout today! Rest up, hydrate, and prepare for tomorrow."'
                  : isPartialToday
                    ? '"Looks like you ended your workout early. You can restart or rest. Consistency is key!"'
                    : `"Today we focus on ${todayPlan.focus}. Keep your reps controlled and aim for full range of motion. You got this!"`}
              </Text>
              <TouchableOpacity
                onPress={() => (navigation as any).navigate('AICoach')}
              >
                <Text style={styles.insightLink}>VIEW FULL ANALYSIS →</Text>
              </TouchableOpacity>
            </View>

            {/* ── Activity Streak ──────────────────── */}
            <View style={styles.streakSection}>
              <View style={styles.streakHeader}>
                <Text style={styles.sectionTitle}>Activity Streak</Text>
                <View style={styles.streakBadge}>
                  <Ionicons name="flame" size={18} color={STREAK_ORANGE} />
                  <Text style={styles.streakCount}>{currentStreak} days</Text>
                </View>
              </View>

              <View style={styles.chartCard}>
                {/* Chart header with metric label */}
                <View style={styles.chartHeader}>
                  <Text style={styles.chartMetricLabel}>Calories Burnt</Text>
                  <Text style={styles.chartMetricNote}>This week</Text>
                </View>

                {/* Bars */}
                <View style={styles.barsContainer}>
                  {DAY_LABELS.map((label, i) => {
                    const count = PLACEHOLDER_CALORIES[i];
                    const barHeight = count > 0 ? Math.max((count / maxCount) * MAX_BAR_HEIGHT, 8) : 4;
                    const isToday = i === (new Date().getDay() + 6) % 7; // Mon=0
                    return (
                      <View key={i} style={styles.barColumn}>
                        <Text style={styles.barValue}>{count > 0 ? count : ''}</Text>
                        <View
                          style={[
                            styles.bar,
                            {
                              height: barHeight,
                              backgroundColor: count > 0
                                ? (isToday ? CHARTREUSE : 'rgba(207,255,0,0.5)')
                                : ROW_BG,
                            },
                          ]}
                        />
                        <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={48} color={GRAY} />
            <Text style={styles.emptyText}>No active plan yet.</Text>
            <Text style={styles.emptySubtext}>Complete onboarding to generate your workout plan.</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BG,
  },

  // Brand bar
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 8,
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ROW_BG,
    borderWidth: 1,
    borderColor: CHARTREUSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: 0.3,
  },

  // Greeting
  greetingSection: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  greetingText: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    lineHeight: 34,
  },
  greetingSubtext: {
    fontSize: 14,
    color: GRAY,
    marginTop: 6,
  },

  // Workout Card
  workoutCard: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  intensityBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  intensityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: 0.5,
  },
  focusTag: {
    fontSize: 13,
    color: GRAY,
  },
  cardLabel: {
    fontSize: 14,
    color: GRAY,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: WHITE,
    marginBottom: 16,
  },

  // Exercise Checklist
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  checklistRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  checkCircleComplete: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CHARTREUSE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkCircleIncomplete: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    marginRight: 12,
  },
  checkTextComplete: {
    fontSize: 15,
    fontWeight: '500',
    color: GRAY,
    textDecorationLine: 'line-through',
  },
  checkTextIncomplete: {
    fontSize: 15,
    fontWeight: '500',
    color: WHITE,
  },

  // Start Button
  startButton: {
    backgroundColor: CHARTREUSE,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: BG,
  },

  // AI Insight
  insightCard: {
    marginTop: 20,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  insightTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: NEON,
  },
  insightQuote: {
    fontSize: 15,
    color: GRAY,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  insightLink: {
    fontSize: 13,
    fontWeight: '700',
    color: NEON,
    letterSpacing: 0.5,
    marginTop: 14,
  },

  // Activity Streak
  streakSection: {
    marginTop: 20,
  },
  streakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WHITE,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ROW_BG,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  streakCount: {
    fontSize: 14,
    fontWeight: '700',
    color: STREAK_ORANGE,
  },
  chartCard: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartMetricLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: WHITE,
  },
  chartMetricNote: {
    fontSize: 12,
    color: GRAY,
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
  },
  barValue: {
    fontSize: 11,
    fontWeight: '600',
    color: GRAY,
    marginBottom: 4,
  },
  bar: {
    width: 22,
    borderRadius: 6,
  },
  barLabel: {
    fontSize: 11,
    color: GRAY,
    marginTop: 8,
  },
  barLabelToday: {
    color: CHARTREUSE,
    fontWeight: '700',
  },

  // Empty / Error
  errorText: {
    color: '#FF4444',
    marginTop: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: WHITE,
  },
  emptySubtext: {
    fontSize: 14,
    color: GRAY,
    textAlign: 'center',
  },
});
