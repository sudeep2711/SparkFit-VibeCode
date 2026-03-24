import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../services/supabase';

// ── Theme ────────────────────────────────────────────────────────
const BG         = '#0D0D0D';
const CARD_BG    = '#1A1A1A';
const ROW_BG     = '#242424';
const ICON_BG    = '#2E2E2E';
const CHARTREUSE = '#CFFF00';
const WHITE      = '#FFFFFF';
const GRAY       = '#888888';
const BORDER     = '#2A2A2A';
const NEON       = '#00F5FF';

// ── Types ────────────────────────────────────────────────────────
type Exercise = {
  name: string;
  type: 'strength' | 'cardio' | 'interval' | 'calisthenics' | 'isometric';
  sets?: number;
  reps?: number | string;
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

type PlanData = {
  week_plan: DailyPlan[];
};

// ── Helpers ──────────────────────────────────────────────────────
const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function deriveMuscleGroup(dailyPlan: DailyPlan): string {
  if (dailyPlan.is_rest_day) return 'rest';
  if (dailyPlan.primary_muscle_group) return dailyPlan.primary_muscle_group;
  const f = (dailyPlan.focus || '').toLowerCase();
  if (f.includes('rest')) return 'rest';
  if (f.includes('recover') || f.includes('mobility') || f.includes('stretch') || f.includes('active')) return 'active_recovery';
  if (f.includes('run') || f.includes('cardio') || f.includes('endurance') || f.includes('zone')) return 'cardio';
  if (f.includes('leg') || f.includes('squat') || f.includes('deadlift') || f.includes('lower') || f.includes('glute') || f.includes('hamstring')) return 'legs';
  if (f.includes('core') || f.includes('abs') || f.includes('plank')) return 'core';
  if (f.includes('chest') || f.includes('push') || f.includes('tricep')) return 'chest';
  if (f.includes('back') || f.includes('pull') || f.includes('row') || f.includes('lat') || f.includes('bicep')) return 'back';
  if (f.includes('shoulder')) return 'shoulders';
  if (f.includes('full') || f.includes('total')) return 'full_body';
  return 'upper_body';
}

function deriveEffortLevel(dailyPlan: DailyPlan): string {
  if (dailyPlan.is_rest_day) return 'rest';
  if (dailyPlan.effort_level) return dailyPlan.effort_level;
  const n = dailyPlan.exercises.length;
  if (n >= 6) return 'hard';
  if (n >= 3) return 'moderate';
  return 'easy';
}

function getMuscleIcon(muscleGroup: string): keyof typeof Ionicons.glyphMap {
  switch (muscleGroup) {
    case 'chest':
    case 'shoulders':
    case 'arms':
    case 'back':
    case 'upper_body':      return 'barbell';
    case 'legs':
    case 'glutes':
    case 'lower_body':      return 'footsteps';
    case 'core':            return 'body';
    case 'full_body':       return 'person';
    case 'cardio':          return 'pulse';
    case 'active_recovery': return 'star';
    case 'rest':            return 'moon';
    default:                return 'barbell';
  }
}

function getEffortColor(effortLevel: string): string {
  switch (effortLevel) {
    case 'easy':     return '#34C759';
    case 'moderate': return '#FF9500';
    case 'hard':     return '#FF3B30';
    case 'rest':     return '#888888';
    default:         return '#FF9500';
  }
}

function getIntensityLabel(effortLevel: string): string {
  switch (effortLevel) {
    case 'easy':     return 'LIGHT';
    case 'moderate': return 'MODERATE';
    case 'hard':     return 'HIGH INTENSITY';
    case 'rest':     return 'REST DAY';
    default:         return 'MODERATE';
  }
}

function getEstimatedMins(dailyPlan: DailyPlan): number {
  if (dailyPlan.estimated_total_time_mins) return dailyPlan.estimated_total_time_mins;
  const total = dailyPlan.exercises.reduce((acc, ex) => {
    return acc + (ex.estimated_time_secs ?? 180) + (ex.estimated_rest_time_secs ?? 60);
  }, 0);
  return Math.min(Math.round(total / 60), 99);
}

function getExerciseIcon(type: Exercise['type']): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'strength':
    case 'calisthenics': return 'barbell';
    case 'cardio':       return 'footsteps';
    case 'interval':     return 'timer';
    case 'isometric':    return 'pause-circle';
    default:             return 'body';
  }
}

function getExerciseDetails(ex: Exercise): string {
  if (ex.sets && ex.reps)  return `${ex.sets} sets × ${ex.reps} reps`;
  if (ex.sets)             return `${ex.sets} sets`;
  if (ex.duration_secs)    return `${Math.round(ex.duration_secs / 60)} min`;
  if (ex.rounds)           return `${ex.rounds} rounds`;
  return '';
}

function getUpcomingSubtitle(dailyPlan: DailyPlan): string {
  if (dailyPlan.is_rest_day) return 'Rest & recovery';
  if (dailyPlan.exercises.length === 0) return 'No exercises scheduled';
  const mins = getEstimatedMins(dailyPlan);
  return `${dailyPlan.exercises.length} exercises · ${mins} min`;
}

// ── Screen ───────────────────────────────────────────────────────
export const WorkoutPlanScreen = () => {
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [dateToDayMap, setDateToDayMap] = useState<Record<string, DailyPlan>>({});
  const [weekDates, setWeekDates] = useState<string[]>([]);
  const [selectedDateString, setSelectedDateString] = useState<string>('');

  const weekScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    fetchPlan();
  }, []);

  const fetchPlan = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('User not authenticated'); return; }

      const { data, error: dbError } = await supabase
        .from('workout_plans')
        .select('id, created_at, plan_data')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (dbError && dbError.code !== 'PGRST116') throw dbError;

      // Support both { week_plan: [...] } (modern) and direct array (legacy) formats
      const rawPlan = data?.plan_data;
      const weekPlan: DailyPlan[] | null = rawPlan?.week_plan ?? (Array.isArray(rawPlan) ? rawPlan : null);

      if (weekPlan) {
        setPlan({ week_plan: weekPlan });
        setPlanId(data.id);

        const startDate = new Date(data.created_at);
        const newDateMap: Record<string, DailyPlan> = {};
        const dates: string[] = [];

        weekPlan.forEach((dailyPlan: DailyPlan, index: number) => {
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + index);
          const dateStr = d.toISOString().split('T')[0];
          newDateMap[dateStr] = dailyPlan;
          dates.push(dateStr);
        });

        setDateToDayMap(newDateMap);
        setWeekDates(dates);

        const todayStr = new Date().toISOString().split('T')[0];
        const initial = newDateMap[todayStr] ? todayStr : dates[0];
        if (initial) setSelectedDateString(initial);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={CHARTREUSE} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: '#FF4444' }}>Error: {error}</Text>
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: GRAY }}>No active plan yet.</Text>
      </View>
    );
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const selectedPlan = dateToDayMap[selectedDateString];
  const upcomingDays = weekDates.filter(d => d !== selectedDateString);

  // Derive muscle + effort for selected day
  const selectedMuscle = selectedPlan ? deriveMuscleGroup(selectedPlan) : 'upper_body';
  const selectedEffort = selectedPlan ? deriveEffortLevel(selectedPlan) : 'moderate';
  const selectedMuscleIcon = getMuscleIcon(selectedMuscle);
  const selectedEffortColor = getEffortColor(selectedEffort);

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Brand bar ────────────────────────────── */}
          <View style={styles.brandBar}>
            <View style={styles.brandLeft}>
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={14} color={CHARTREUSE} />
              </View>
              <Text style={styles.brandName}>SparkFit</Text>
            </View>
            <Ionicons name="notifications-outline" size={22} color={GRAY} />
          </View>

          {/* ── Header ──────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.title}>Workout Plan</Text>
            <Text style={styles.subtitle}>Your AI-optimized path to peak performance.</Text>
          </View>

          {/* ── Week Day Strip ───────────────────────── */}
          <ScrollView
            ref={weekScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.weekStrip}
            nestedScrollEnabled
          >
            {weekDates.map((dateStr) => {
              const dateObj = new Date(dateStr + 'T00:00:00');
              const dayAbbr = DAY_ABBREVS[dateObj.getDay()];
              const dateNum = dateObj.getDate();
              const isSelected = dateStr === selectedDateString;
              const isToday = dateStr === todayStr;

              return (
                <TouchableOpacity
                  key={dateStr}
                  onPress={() => setSelectedDateString(dateStr)}
                  style={styles.dayCell}
                  activeOpacity={0.7}
                >
                  <View style={[styles.dayPill, isSelected && styles.dayPillSelected]}>
                    <Text style={[styles.dayAbbr, isSelected && styles.dayAbbrSelected]}>
                      {dayAbbr}
                    </Text>
                    <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>
                      {dateNum}
                    </Text>
                    {isToday && (
                      <Text style={[styles.todayBadge, isSelected && styles.todayBadgeSelected]}>
                        TODAY
                      </Text>
                    )}
                    {isSelected && !isToday && (
                      <View style={styles.dotSelected} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── Workout Card ─────────────────────────── */}
          {selectedPlan ? (
            <View style={styles.workoutCard}>
              {/* Top row: muscle icon + intensity badge + duration */}
              <View style={styles.cardMeta}>
                <View style={[styles.workoutTypeCircle, { backgroundColor: selectedEffortColor + '22' }]}>
                  <Ionicons name={selectedMuscleIcon} size={18} color={selectedEffortColor} />
                </View>
                {!selectedPlan.is_rest_day && (
                  <>
                    <View style={[styles.intensityBadge, { backgroundColor: selectedEffortColor }]}>
                      <Text style={styles.intensityText}>
                        {getIntensityLabel(selectedEffort)}
                      </Text>
                    </View>
                    <View style={styles.durationPill}>
                      <Ionicons name="time-outline" size={13} color={GRAY} />
                      <Text style={styles.durationText}>
                        {getEstimatedMins(selectedPlan)}M
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {/* Focus title */}
              <Text style={styles.focusTitle}>
                {selectedPlan.focus || (selectedPlan.is_rest_day ? 'Rest Day' : 'Workout')}
              </Text>

              {/* Exercise rows */}
              {selectedPlan.is_rest_day ? (
                <Text style={styles.restNote}>Active recovery or full rest — your choice.</Text>
              ) : (
                selectedPlan.exercises.map((ex, i) => (
                  <View key={i} style={styles.exerciseRow}>
                    <View style={styles.exerciseIconWrap}>
                      <Ionicons name={getExerciseIcon(ex.type)} size={17} color={WHITE} />
                    </View>
                    <View style={styles.exerciseInfo}>
                      <Text style={styles.exerciseName}>{ex.name}</Text>
                      <Text style={styles.exerciseDetails}>{getExerciseDetails(ex)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#444" />
                  </View>
                ))
              )}

              {/* Edit Workout */}
              {!selectedPlan.is_rest_day && planId && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => navigation.navigate('ChangeWorkoutChat', { planId })}
                  activeOpacity={0.75}
                >
                  <Ionicons name="pencil-outline" size={15} color={GRAY} />
                  <Text style={styles.editButtonText}>Edit Workout</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.workoutCard}>
              <Text style={{ color: GRAY }}>No workout scheduled for this day.</Text>
            </View>
          )}

          {/* ── Upcoming Week ─────────────────────────── */}
          <View style={styles.upcomingHeader}>
            <Text style={styles.upcomingTitle}>Upcoming Week</Text>
            <Text style={styles.addDay}>+ ADD DAY</Text>
          </View>

          <View style={styles.upcomingList}>
            {upcomingDays.map((dateStr, idx) => {
              const dailyPlan = dateToDayMap[dateStr];
              if (!dailyPlan) return null;
              const dateObj = new Date(dateStr + 'T00:00:00');
              const dayAbbr = DAY_ABBREVS[dateObj.getDay()];
              const dateNum = dateObj.getDate();
              const muscle = deriveMuscleGroup(dailyPlan);
              const effort = deriveEffortLevel(dailyPlan);
              const iconName = getMuscleIcon(muscle);
              const iconColor = getEffortColor(effort);
              const subtitle = getUpcomingSubtitle(dailyPlan);

              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[
                    styles.upcomingRow,
                    idx < upcomingDays.length - 1 && styles.upcomingRowBorder,
                  ]}
                  onPress={() => setSelectedDateString(dateStr)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.upcomingIconCircle, { backgroundColor: iconColor + '22' }]}>
                    <Ionicons name={iconName} size={22} color={iconColor} />
                  </View>
                  <View style={styles.upcomingInfo}>
                    <View style={styles.upcomingInfoRow}>
                      <Text style={styles.upcomingFocus} numberOfLines={1}>
                        {dailyPlan.focus || (dailyPlan.is_rest_day ? 'Rest Day' : 'Workout')}
                      </Text>
                      <Text style={styles.upcomingDay}>· {dayAbbr} {dateNum}</Text>
                    </View>
                    <Text style={styles.upcomingSubtitle}>{subtitle}</Text>
                  </View>
                  <Ionicons name="reorder-two-outline" size={20} color="#444" />
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>

      {/* ── Floating AI Coach FAB ─────────────────── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AICoach')}
        activeOpacity={0.85}
      >
        <Ionicons name="hardware-chip-outline" size={24} color="#111" />
      </TouchableOpacity>
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: 0.3,
  },

  // Header
  header: {
    paddingTop: 8,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: WHITE,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: GRAY,
  },

  // Week strip
  weekStrip: {
    paddingBottom: 24,
    gap: 8,
  },
  dayCell: {
    alignItems: 'center',
  },
  dayPill: {
    width: 48,
    minHeight: 72,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 2,
    backgroundColor: 'transparent',
  },
  dayPillSelected: {
    backgroundColor: CHARTREUSE,
  },
  dayAbbr: {
    fontSize: 10,
    fontWeight: '600',
    color: GRAY,
    letterSpacing: 0.3,
  },
  dayAbbrSelected: {
    color: '#111',
  },
  dayNum: {
    fontSize: 20,
    fontWeight: '700',
    color: WHITE,
  },
  dayNumSelected: {
    color: '#111',
  },
  todayBadge: {
    fontSize: 8,
    fontWeight: '700',
    color: CHARTREUSE,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  todayBadgeSelected: {
    color: '#111',
  },
  dotSelected: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#111',
    marginTop: 3,
  },

  // Workout card
  workoutCard: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 20,
    marginBottom: 28,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  workoutTypeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intensityBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  intensityText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111',
    letterSpacing: 0.5,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  durationText: {
    fontSize: 13,
    fontWeight: '600',
    color: GRAY,
  },
  focusTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: WHITE,
    marginBottom: 16,
    lineHeight: 30,
  },
  restNote: {
    fontSize: 15,
    color: GRAY,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ROW_BG,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  exerciseIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ICON_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: WHITE,
  },
  exerciseDetails: {
    fontSize: 13,
    color: GRAY,
    marginTop: 2,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ROW_BG,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
    gap: 8,
  },
  editButtonText: {
    fontSize: 14,
    color: GRAY,
    fontWeight: '500',
  },

  // Upcoming Week
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  upcomingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WHITE,
  },
  addDay: {
    fontSize: 14,
    fontWeight: '600',
    color: CHARTREUSE,
  },
  upcomingList: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    overflow: 'hidden',
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  upcomingRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  upcomingIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingInfo: {
    flex: 1,
  },
  upcomingInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  upcomingFocus: {
    fontSize: 15,
    fontWeight: '600',
    color: WHITE,
    flexShrink: 1,
  },
  upcomingDay: {
    fontSize: 13,
    color: GRAY,
    flexShrink: 0,
  },
  upcomingSubtitle: {
    fontSize: 13,
    color: GRAY,
    marginTop: 2,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
});
