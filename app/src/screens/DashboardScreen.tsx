import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, SafeAreaView, TouchableOpacity } from 'react-native';
import { supabase } from '../services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

type DailyLogNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

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
  exercises: Exercise[];
};

export const DashboardScreen = () => {
  const navigation = useNavigation<DailyLogNavigationProp>();
  const [loading, setLoading] = useState(true);
  const [todayPlan, setTodayPlan] = useState<DailyPlan | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Streak
  const [currentStreak, setCurrentStreak] = useState(0);

  // Track if a workout was completed today
  const [isCompletedToday, setIsCompletedToday] = useState(false);
  const [isPartialToday, setIsPartialToday] = useState(false);
  const [completedExerciseNames, setCompletedExerciseNames] = useState<string[]>([]);

  // Time tracking stats
  const [actualWorkoutMins, setActualWorkoutMins] = useState(0);
  const [actualRestMins, setActualRestMins] = useState(0);

  // Use focus effect or simple interval/refresh mechanism if needed, 
  // but for now fetchPlan on mount is fine (could add pull-to-refresh later)
  useEffect(() => {
    fetchPlan();

    // Listen for focus to re-fetch in case they just finished a workout
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

      // Normalise plan_data — handle both flat array and legacy { week_plan: [...] } format
      const rawPlan = planData?.plan_data;
      const weekPlan: DailyPlan[] = Array.isArray(rawPlan)
        ? rawPlan
        : Array.isArray(rawPlan?.week_plan)
          ? rawPlan.week_plan
          : [];

      // Fetch streak (non-blocking)
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

        // Find today's plan by day name (handles "Monday") or fall back to first active day
        const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const byName = weekPlan.find((d: DailyPlan) => d.day.toLowerCase() === todayName.toLowerCase());
        const today = byName ?? weekPlan.find((d: DailyPlan) => !d.is_rest_day) ?? weekPlan[0];
        setTodayPlan(today);

        // Check for today's logs
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

        // Calculate actual times from session logs
        let totalWorkoutSecs = 0;
        let totalSetsCount = 0;

        data.logged_data.session_logs.forEach((exerciseLog: any) => {
          exerciseLog.setsLogs.forEach((setLog: any) => {
            totalWorkoutSecs += (setLog.duration || 0);
            totalSetsCount++;
          });
        });

        setActualWorkoutMins(Math.round(totalWorkoutSecs / 60));
        // Calculate actual rest based on exact duration_mins minus workout_mins
        // Or approx: total Sets * 90s, but exact is better if total duration is accurate
        const totalDurationMins = data.logged_data.duration_mins || 0;
        const calcRestMins = Math.max(0, totalDurationMins - Math.round(totalWorkoutSecs / 60));

        setActualRestMins(calcRestMins);

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
      navigation.navigate('WorkoutActive', {
        planId: planId,
        dailyPlan: todayPlan
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Today's Workout</Text>
          {currentStreak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakEmoji}>🔥</Text>
              <Text style={styles.streakText}>{currentStreak}</Text>
            </View>
          )}
        </View>

        {error ? (
          <Text style={styles.errorText}>Error: {error}</Text>
        ) : todayPlan ? (
          <View style={styles.planContainer}>

            {/* Time Tracking Grid */}
            {(() => {
              let sumActiveSecs = 0;
              let sumRestSecs = 0;

              todayPlan.exercises.forEach(ex => {
                const sets = ex.sets || 1;
                sumActiveSecs += (ex.estimated_time_secs ?? Math.round(sets * 45));
                sumRestSecs += (ex.estimated_rest_time_secs ?? Math.round((sets > 1 ? sets - 1 : 0) * 90));
              });

              const estWorkoutMins = Math.round(sumActiveSecs / 60);
              const estRestMins = Math.round(sumRestSecs / 60);

              const showActual = isCompletedToday || isPartialToday;

              return (
                <View style={styles.metricsGrid}>
                  <View style={styles.metricColumn}>
                    <Text style={styles.metricColumnHeader}>Estimated</Text>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricValue}>{estWorkoutMins}m</Text>
                      <Text style={styles.metricLabel}>Workout</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricValue}>{estRestMins}m</Text>
                      <Text style={styles.metricLabel}>Rest</Text>
                    </View>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricColumn}>
                    <Text style={styles.metricColumnHeader}>Actual</Text>
                    <View style={styles.metricBox}>
                      <Text style={[styles.metricValue, showActual ? styles.metricValueActive : styles.metricValueInactive]}>
                        {showActual ? `${actualWorkoutMins}m` : '--'}
                      </Text>
                      <Text style={styles.metricLabel}>Workout</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Text style={[styles.metricValue, showActual ? styles.metricValueActive : styles.metricValueInactive]}>
                        {showActual ? `${actualRestMins}m` : '--'}
                      </Text>
                      <Text style={styles.metricLabel}>Rest</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* AI Coach Insight Card */}
            <View style={[styles.insightCard, isCompletedToday ? styles.insightCardCompleted : (isPartialToday ? styles.insightCardPartial : null)]}>
              <View style={styles.insightHeader}>
                <Ionicons name="sparkles" size={20} color={isCompletedToday ? "#34C759" : "#FF9500"} style={{ marginRight: 8 }} />
                <Text style={[styles.insightTitle, isCompletedToday ? styles.insightTitleCompleted : (isPartialToday ? styles.insightTitlePartial : null)]}>
                  {isCompletedToday ? "Workout Complete!" : (isPartialToday ? "Partial Workout" : "Coach Insight")}
                </Text>
              </View>
              <Text style={styles.insightText}>
                {isCompletedToday
                  ? "Great job crushing your workout today! Rest up, hydrate, and prepare for tomorrow."
                  : isPartialToday
                    ? "Looks like you ended your workout early. You can restart or rest. Consistency is key!"
                    : `Today we focus on ${todayPlan.focus}. Keep your reps controlled and aim for full range of motion. You got this!`}
              </Text>
            </View>

            <View style={styles.subTitleRow}>
              <Text style={styles.subTitle}>Exercises</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('WorkoutPlan')}
                  style={styles.viewPlanButton}
                >
                  <Text style={styles.viewPlanText}>View 7-Day Plan →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigation.navigate('ChangeWorkoutChat', { planId: planId || '' })}
                  style={styles.changeWorkoutButton}
                >
                  <Ionicons name="refresh-circle" size={18} color="#007AFF" />
                  <Text style={styles.changeWorkoutText}>New Workout</Text>
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={todayPlan.exercises}
              showsVerticalScrollIndicator={false}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => {
                const isExCompleted = isCompletedToday || completedExerciseNames.includes(item.name);
                return (
                  <View style={[styles.exerciseCard, isExCompleted && styles.exerciseCardCompletedStyle]}>
                    <View style={styles.exerciseIndexBadge}>
                      {isExCompleted ? (
                        <Ionicons name="checkmark" size={20} color="#34C759" />
                      ) : (
                        <Text style={styles.exerciseIndexText}>{index + 1}</Text>
                      )}
                    </View>
                    <View style={styles.exerciseContent}>
                      <Text style={[styles.exerciseName, isExCompleted && styles.exerciseNameCompleted]}>{item.name}</Text>
                      <Text style={styles.exerciseDetails}>
                        Target: {item.sets ? `${item.sets} sets x ` : ''}{item.reps ? `${item.reps} reps` : ''} {item.duration_secs ? `${Math.round(item.duration_secs / 60)}m` : ''} {item.rounds ? `${item.rounds} rounds` : ''}
                      </Text>
                      <Text style={styles.exerciseTimeDetails}>
                        Est. Time: {Math.round((item.estimated_time_secs ?? ((item.sets || 1) * 45)) / 60)}m | Rest: {Math.round((item.estimated_rest_time_secs ?? (((item.sets || 1) > 1 ? (item.sets || 1) - 1 : 0) * 90)) / 60)}m
                      </Text>
                    </View>
                  </View>
                );
              }}
              contentContainerStyle={{ paddingBottom: 100 }}
            />

            {todayPlan.exercises && todayPlan.exercises.length > 0 && (
              <View style={styles.stickyFooter} pointerEvents="box-none">
                <TouchableOpacity
                  style={styles.startButton}
                  onPress={handleStartWorkout}
                  activeOpacity={0.8}
                >
                  <Text style={styles.startButtonText}>
                    {isCompletedToday ? "Restart Workout" : (isPartialToday ? "Restart Workout" : "Start Workout")}
                  </Text>
                  <Ionicons
                    name={isCompletedToday || isPartialToday ? "refresh" : "arrow-forward"}
                    size={24} color="#fff" style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.subtitle}>No active plan yet. Go to Onboarding to create one.</Text>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FFD59E',
  },
  streakEmoji: {
    fontSize: 18,
    marginRight: 4,
  },
  streakText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E65100',
  },
  subTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  subTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  viewPlanButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  viewPlanText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 13,
  },
  changeWorkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5F1FF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  changeWorkoutText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 4,
  },

  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    backgroundColor: '#F9F9F9',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EEE',
    justifyContent: 'space-around',
  },
  metricColumn: {
    flex: 1,
    alignItems: 'center',
  },
  metricColumnHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8E8E93',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
    marginHorizontal: 16,
  },
  metricBox: {
    alignItems: 'center',
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
  },
  metricValueActive: {
    color: '#007AFF', // Or green if preferred
  },
  metricValueInactive: {
    color: '#D1D1D6',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 2,
  },
  errorText: {
    color: 'red',
    marginTop: 10,
  },
  planContainer: {
    flex: 1,
  },
  insightCard: {
    backgroundColor: '#FFF4E5',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  insightCardCompleted: {
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E65100',
  },
  insightTitleCompleted: {
    color: '#2E7D32',
  },
  insightCardPartial: {
    backgroundColor: '#FFF8E1',
    borderColor: '#FFE082',
  },
  insightTitlePartial: {
    color: '#FF8F00',
  },
  insightText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  exerciseCard: {
    flexDirection: 'row',
    backgroundColor: '#F9F9F9',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  exerciseCardCompletedStyle: {
    backgroundColor: '#F0FFF0',
    borderColor: '#E0F0E0',
  },
  exerciseIndexBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  exerciseIndexText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  exerciseContent: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  exerciseNameCompleted: {
    color: '#666',
    textDecorationLine: 'line-through',
  },
  exerciseDetails: {
    fontSize: 15,
    color: '#666',
  },
  exerciseTimeDetails: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  }
});
