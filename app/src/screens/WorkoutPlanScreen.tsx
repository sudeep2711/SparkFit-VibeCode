import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Dumbbell, Footprints, Flame, Activity, Zap,
  Wind, Layers, Moon, Repeat, Timer, Waves,
  type LucideIcon,
} from 'lucide-react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
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
  movement_pattern?: string;
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

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

function getMuscleIcon(muscleGroup: string): LucideIcon {
  switch (muscleGroup) {
    case 'chest':
    case 'upper_body':      return Dumbbell;
    case 'back':            return Dumbbell;
    case 'shoulders':       return Dumbbell;
    case 'arms':            return Dumbbell;
    case 'legs':
    case 'glutes':
    case 'lower_body':      return Footprints;
    case 'core':            return Flame;
    case 'full_body':       return Layers;
    case 'cardio':          return Activity;
    case 'active_recovery': return Wind;
    case 'rest':            return Moon;
    default:                return Dumbbell;
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

function getIntensityLabel(effortLevel: string, muscleGroup: string): string {
  if (effortLevel === 'rest' || muscleGroup === 'rest') return 'REST DAY';
  if (muscleGroup === 'active_recovery') return 'RECOVERY';

  if (muscleGroup === 'cardio') {
    if (effortLevel === 'easy')     return 'LIGHT CARDIO';
    if (effortLevel === 'hard')     return 'HIGH INTENSITY';
    return 'CARDIO';
  }
  if (muscleGroup === 'legs' || muscleGroup === 'glutes' || muscleGroup === 'lower_body') {
    if (effortLevel === 'easy')     return 'LIGHT LEGS';
    if (effortLevel === 'hard')     return 'HEAVY LEGS';
    return 'LEG DAY';
  }
  if (muscleGroup === 'core') {
    if (effortLevel === 'easy')     return 'LIGHT CORE';
    if (effortLevel === 'hard')     return 'CORE BURN';
    return 'CORE';
  }
  if (muscleGroup === 'full_body') {
    if (effortLevel === 'easy')     return 'ACTIVE';
    return 'FULL BODY';
  }
  // strength: chest, back, shoulders, arms, upper_body, default
  if (effortLevel === 'easy')       return 'LIGHT';
  if (effortLevel === 'hard')       return 'HEAVY LIFT';
  return 'STRENGTH';
}

function getEstimatedMins(dailyPlan: DailyPlan): number {
  if (dailyPlan.estimated_total_time_mins) return dailyPlan.estimated_total_time_mins;
  const total = dailyPlan.exercises.reduce((acc, ex) => {
    return acc + (ex.estimated_time_secs ?? 180) + (ex.estimated_rest_time_secs ?? 60);
  }, 0);
  return Math.min(Math.round(total / 60), 99);
}

function getExerciseIcon(type: Exercise['type'], name: string = '', pattern: string = ''): LucideIcon {
  // Primary: use Gemini-assigned movement pattern
  switch (pattern) {
    case 'press_horizontal':  return Dumbbell;
    case 'press_vertical':    return Flame;
    case 'fly_crossover':     return Layers;
    case 'row':               return Dumbbell;
    case 'pulldown_pullup':   return Dumbbell;
    case 'curl':              return Dumbbell;
    case 'extension':         return Dumbbell;
    case 'squat_lunge':       return Footprints;
    case 'hinge_deadlift':    return Dumbbell;
    case 'raise':             return Dumbbell;
    case 'carry':             return Footprints;
    case 'plank_hold':        return Wind;
    case 'run_sprint':        return Zap;
    case 'jump_plyometric':   return Zap;
    case 'rotation_twist':    return Waves;
  }
  // Fallback for existing plans without movement_pattern
  if (type === 'interval')     return Repeat;
  if (type === 'isometric')    return Timer;
  if (type === 'calisthenics') return Layers;
  if (type === 'cardio')       return Activity;
  const n = name.toLowerCase();
  if (/bench|chest|fly|flye|pec|push.?up|dip/.test(n))                               return Dumbbell;
  if (/row|pull.?down|lat|pull.?up|chin.?up|back|rear|rhomboid/.test(n))              return Dumbbell;
  if (/shoulder|military|overhead|lateral raise|front raise/.test(n))                 return Dumbbell;
  if (/curl|bicep|hammer curl|preacher/.test(n))                                      return Dumbbell;
  if (/tricep|skull|extension|pushdown/.test(n))                                      return Dumbbell;
  if (/squat|lunge|leg press|step.?up|calf/.test(n))                                  return Footprints;
  if (/deadlift|rdl|hip thrust|hinge|good morning/.test(n))                           return Dumbbell;
  if (/plank|hollow|dead bug|wall sit|hold/.test(n))                                  return Wind;
  if (/crunch|sit.?up|ab|core|oblique/.test(n))                                       return Flame;
  if (/run|sprint|jog|treadmill/.test(n))                                             return Zap;
  if (/jump|burpee|plyometric|box/.test(n))                                           return Zap;
  if (/twist|rotation|woodchop|russian/.test(n))                                      return Waves;
  return Dumbbell;
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

// ── Types ────────────────────────────────────────────────────────
type DragItem = { key: string };

// ── Screen ───────────────────────────────────────────────────────
export const WorkoutPlanScreen = () => {
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [dateToDayMap, setDateToDayMap] = useState<Record<string, DailyPlan>>({});
  const [weekDates, setWeekDates] = useState<string[]>([]);
  const [scheduleOrder, setScheduleOrder] = useState<DragItem[]>([]);
  const [selectedDateString, setSelectedDateString] = useState<string>('');

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

        const now = new Date();
        const dayOfWeek = now.getDay();
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const startDate = new Date(now);
        startDate.setDate(now.getDate() - daysFromMonday);
        startDate.setHours(0, 0, 0, 0);
        const newDateMap: Record<string, DailyPlan> = {};
        const dates: string[] = [];

        weekPlan.forEach((dailyPlan: DailyPlan, index: number) => {
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + index);
          const dateStr = localDateStr(d);
          newDateMap[dateStr] = dailyPlan;
          dates.push(dateStr);
        });

        setDateToDayMap(newDateMap);
        setWeekDates(dates);
        setScheduleOrder(dates.map(d => ({ key: d })));

        const todayStr = localDateStr(new Date());
        const initial = newDateMap[todayStr] ? todayStr : dates[0];
        if (initial) setSelectedDateString(initial);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const todayStr = localDateStr(new Date());

  const handleDragEnd = useCallback(async (newOrder: DragItem[]) => {
    const newMap: Record<string, DailyPlan> = {};
    newOrder.forEach((item, idx) => {
      newMap[weekDates[idx]] = dateToDayMap[item.key];
    });
    setDateToDayMap(newMap);
    setScheduleOrder(newOrder);

    if (planId) {
      const newWeekPlan = weekDates.map(d => newMap[d]).filter(Boolean);
      await supabase
        .from('workout_plans')
        .update({ plan_data: { week_plan: newWeekPlan } })
        .eq('id', planId);
    }
  }, [weekDates, dateToDayMap, planId]);

  const renderScheduleItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<DragItem>) => {
    const dateStr = item.key;
    const idx = getIndex?.() ?? 0;
    const dailyPlan = dateToDayMap[dateStr];
    if (!dailyPlan) return null;
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayAbbr = DAY_ABBREVS[dateObj.getDay()];
    const dateNum = dateObj.getDate();
    const muscle = deriveMuscleGroup(dailyPlan);
    const effort = deriveEffortLevel(dailyPlan);
    const DayIcon = getMuscleIcon(muscle);
    const iconColor = getEffortColor(effort);
    const subtitle = getUpcomingSubtitle(dailyPlan);
    const isSelected = dateStr === selectedDateString;
    const isToday = dateStr === todayStr;

    const row = (
      <TouchableOpacity
        key={dateStr}
        style={[
          styles.upcomingRow,
          idx < scheduleOrder.length - 1 && styles.upcomingRowBorder,
          isSelected && styles.upcomingRowActive,
          isActive && styles.upcomingRowDragging,
        ]}
        onPress={() => setSelectedDateString(dateStr)}
        onLongPress={Platform.OS !== 'web' ? drag : undefined}
        activeOpacity={0.7}
        delayLongPress={200}
      >
        <View style={[styles.upcomingIconCircle, { backgroundColor: iconColor + '22' }]}>
          <DayIcon size={22} color={iconColor} />
        </View>
        <View style={styles.upcomingInfo}>
          <View style={styles.upcomingInfoRow}>
            <Text style={styles.upcomingFocus} numberOfLines={1}>
              {dailyPlan.focus || (dailyPlan.is_rest_day ? 'Rest Day' : 'Workout')}
            </Text>
            <Text style={styles.upcomingDay}>· {dayAbbr} {dateNum}</Text>
            {isSelected && (
              <View style={styles.upcomingActiveBadge}>
                <Text style={styles.upcomingActiveBadgeText}>
                  {isToday ? 'TODAY' : 'ACTIVE'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.upcomingSubtitle}>{subtitle}</Text>
        </View>
        <Ionicons name="reorder-two-outline" size={20} color={isActive ? CHARTREUSE : '#444'} />
      </TouchableOpacity>
    );

    if (Platform.OS === 'web') return row;
    return <ScaleDecorator activeScale={0.97}>{row}</ScaleDecorator>;
  }, [dateToDayMap, selectedDateString, todayStr, scheduleOrder]);

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

  const selectedPlan = dateToDayMap[selectedDateString];

  // Derive muscle + effort for selected day
  const selectedMuscle = selectedPlan ? deriveMuscleGroup(selectedPlan) : 'upper_body';
  const selectedEffort = selectedPlan ? deriveEffortLevel(selectedPlan) : 'moderate';
  const selectedMuscleIcon = getMuscleIcon(selectedMuscle);
  const selectedEffortColor = getEffortColor(selectedEffort);

  const renderListHeader = () => (
    <View>
      {/* ── Brand bar ────────────────────────────── */}
      <View style={styles.brandBar}>
        <View style={styles.brandLeft}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={14} color={CHARTREUSE} />
          </View>
          <Text style={styles.brandName}>SparkFit</Text>
        </View>
      </View>

      {/* ── Header ──────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.title}>Workout Plan</Text>
        <Text style={styles.subtitle}>Your AI-optimized path to peak performance.</Text>
      </View>

      {/* ── Week Day Strip ───────────────────────── */}
      <View style={styles.weekStrip}>
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
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Workout Card ─────────────────────────── */}
      {selectedPlan ? (
        <View style={styles.workoutCard}>
          <View style={styles.cardMeta}>
            <View style={[styles.workoutTypeCircle, { backgroundColor: selectedEffortColor + '22' }]}>
              {React.createElement(selectedMuscleIcon, { size: 18, color: selectedEffortColor })}
            </View>
            {!selectedPlan.is_rest_day && (
              <>
                <View style={[styles.intensityBadge, { backgroundColor: selectedEffortColor }]}>
                  <Text style={styles.intensityText}>
                    {getIntensityLabel(selectedEffort, selectedMuscle)}
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

          <Text style={styles.focusTitle}>
            {selectedPlan.focus || (selectedPlan.is_rest_day ? 'Rest Day' : 'Workout')}
          </Text>

          {selectedPlan.is_rest_day ? (
            <Text style={styles.restNote}>Active recovery or full rest — your choice.</Text>
          ) : (
            selectedPlan.exercises.map((ex, i) => (
              <View key={i} style={styles.exerciseRow}>
                <View style={styles.exerciseIconWrap}>
                  {React.createElement(getExerciseIcon(ex.type, ex.name, ex.movement_pattern ?? ''), { size: 17, color: WHITE })}
                </View>
                <View style={styles.exerciseInfo}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.exerciseDetails}>{getExerciseDetails(ex)}</Text>
                </View>
              </View>
            ))
          )}

          {!selectedPlan.is_rest_day && planId && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate('SparkAIChat', { context: { screen: 'change_workout', planId } })}
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

      {/* ── Schedule header ───────────────────────── */}
      <View style={styles.upcomingHeader}>
        <Text style={styles.upcomingTitle}>Schedule this week</Text>
        {Platform.OS !== 'web' && (
          <Text style={styles.upcomingHint}>Hold & drag to reorder</Text>
        )}
      </View>

      {Platform.OS !== 'web' && <View style={styles.upcomingListTop} />}
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderListHeader()}
          <View style={styles.upcomingList}>
            {scheduleOrder.map((item, idx) => {
              const fakeParams = {
                item,
                drag: () => {},
                isActive: false,
                getIndex: () => idx,
              } as any;
              return renderScheduleItem(fakeParams);
            })}
          </View>
          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <DraggableFlatList
        data={scheduleOrder}
        keyExtractor={(item) => item.key}
        onDragEnd={({ data }) => handleDragEnd(data)}
        renderItem={renderScheduleItem}
        ListHeaderComponent={renderListHeader}
        ListFooterComponent={<View style={styles.upcomingListBottom} />}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        containerStyle={styles.listContainer}
        activationDistance={10}
      />
    </SafeAreaView>
  );
};

// ── Styles ───────────────────────────────────────────────────────
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
    flexDirection: 'row',
    justifyContent: 'center',
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
  listContainer: {
    flex: 1,
    backgroundColor: BG,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  upcomingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WHITE,
  },
  upcomingHint: {
    fontSize: 12,
    color: GRAY,
    fontStyle: 'italic',
  },
  upcomingList: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    overflow: 'hidden',
  },
  upcomingListTop: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: 4,
  },
  upcomingListBottom: {
    backgroundColor: CARD_BG,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    height: 80,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    backgroundColor: CARD_BG,
  },
  upcomingRowDragging: {
    backgroundColor: '#222',
    shadowColor: CHARTREUSE,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
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
  upcomingRowActive: {
    backgroundColor: 'rgba(207,255,0,0.06)',
    borderLeftWidth: 3,
    borderLeftColor: CHARTREUSE,
    paddingLeft: 13,
  },
  upcomingActiveBadge: {
    backgroundColor: 'rgba(207,255,0,0.15)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  upcomingActiveBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: CHARTREUSE,
    letterSpacing: 0.8,
  },

});
