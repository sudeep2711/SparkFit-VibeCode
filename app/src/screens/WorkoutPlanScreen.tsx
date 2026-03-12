import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, SafeAreaView, Platform } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { supabase } from '../services/supabase';

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
  day: string; // e.g., "Day 1"
  focus: string;
  exercises: Exercise[];
};

type PlanData = {
  week_plan: DailyPlan[];
};

export const WorkoutPlanScreen = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [planStartDate, setPlanStartDate] = useState<Date | null>(null);
  const [selectedDateString, setSelectedDateString] = useState<string>('');

  // Map of YYYY-MM-DD -> DailyPlan
  const [dateToDayMap, setDateToDayMap] = useState<Record<string, DailyPlan>>({});
  const [markedDates, setMarkedDates] = useState<any>({});

  useEffect(() => {
    fetchPlan();
  }, []);

  const fetchPlan = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError("User not authenticated");
        return;
      }

      const { data, error } = await supabase
        .from('workout_plans')
        .select('created_at, plan_data')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data && data.plan_data && data.plan_data.week_plan) {
        setPlan(data.plan_data);
        const startDate = new Date(data.created_at);
        setPlanStartDate(startDate);

        // Build the date mapping
        const newDateMap: Record<string, DailyPlan> = {};
        const newMarked: any = {};

        data.plan_data.week_plan.forEach((dailyPlan: DailyPlan, index: number) => {
          const targetDate = new Date(startDate);
          targetDate.setDate(startDate.getDate() + index);

          const dateString = targetDate.toISOString().split('T')[0];
          newDateMap[dateString] = dailyPlan;

          newMarked[dateString] = {
            marked: true,
            dotColor: '#007AFF'
          };
        });

        setDateToDayMap(newDateMap);
        setMarkedDates(newMarked);

        // Default to showing today's plan if available, else first day
        const todayStr = new Date().toISOString().split('T')[0];
        const initialDate = newDateMap[todayStr] ? todayStr : Object.keys(newDateMap)[0];
        if (initialDate) {
          handleDayPress({ dateString: initialDate } as DateData);
        }
      }
    } catch (err: any) {
      console.error("Error fetching plan:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDayPress = (day: DateData) => {
    setSelectedDateString(day.dateString);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // Combine baseline marks with the selection styling
  const currentMarkedDates = { ...markedDates };
  if (selectedDateString) {
    currentMarkedDates[selectedDateString] = {
      ...currentMarkedDates[selectedDateString],
      selected: true,
      selectedColor: '#007AFF'
    };
  }

  const selectedPlan = dateToDayMap[selectedDateString];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Your 7-Day Plan</Text>

        {error ? (
          <Text style={styles.errorText}>Error: {error}</Text>
        ) : plan ? (
          <View style={{ flex: 1 }}>
            {Platform.OS !== 'web' ? (
              <Calendar
                current={selectedDateString || undefined}
                onDayPress={handleDayPress}
                markedDates={currentMarkedDates}
                theme={{
                  todayTextColor: '#007AFF',
                  arrowColor: '#007AFF',
                  selectedDayBackgroundColor: '#007AFF',
                  selectedDayTextColor: '#ffffff',
                  dotColor: '#007AFF',
                }}
                style={styles.calendar}
              />
            ) : (
              <View style={styles.calendarFallback}>
                <Text>Calendar view is currently unavailable on Web.</Text>
                <Text style={{ marginTop: 10, color: '#007AFF' }}>Showing schedule for: {selectedDateString}</Text>
              </View>
            )}

            <View style={styles.planContainer}>
              {selectedPlan ? (
                <>
                  <Text style={styles.dayTitle}>{selectedPlan.day} - {selectedPlan.focus}</Text>
                  {selectedPlan.exercises && selectedPlan.exercises.length > 0 ? (
                    <FlatList
                      data={selectedPlan.exercises}
                      keyExtractor={(item, index) => index.toString()}
                      renderItem={({ item }) => (
                        <View style={styles.exerciseCard}>
                          <Text style={styles.exerciseName}>{item.name}</Text>
                          <Text style={styles.exerciseDetails}>{item.sets} sets x {item.reps} reps</Text>
                        </View>
                      )}
                      contentContainerStyle={{ paddingBottom: 20 }}
                    />
                  ) : (
                    <Text style={styles.restText}>Rest or Active Recovery day.</Text>
                  )}
                </>
              ) : (
                <View style={styles.centeredContainer}>
                  <Text style={styles.noPlanText}>No routine scheduled for this date.</Text>
                </View>
              )}
            </View>
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
    padding: 20,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  errorText: {
    color: 'red',
    marginTop: 10,
  },
  calendar: {
    marginBottom: 20,
    borderRadius: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  planContainer: {
    flex: 1,
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  exerciseCard: {
    backgroundColor: '#F2F2F7',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '500',
  },
  exerciseDetails: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  restText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  noPlanText: {
    fontSize: 16,
    color: '#999',
  },
  calendarFallback: {
    padding: 20,
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  }
});
