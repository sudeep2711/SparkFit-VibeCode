import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, SafeAreaView, ScrollView, Platform } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../services/supabase';
import { useFocusEffect } from '@react-navigation/native';

type WorkoutLog = {
  date: string;
  logged_data: {
    total_exercises: number;
    completed_indices: number[];
  };
};

export const ProgressScreen = () => {
  const [loading, setLoading] = useState(true);
  const [markedDates, setMarkedDates] = useState<any>({});
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    perfectDays: 0,
    partialDays: 0
  });

  useFocusEffect(
    React.useCallback(() => {
      fetchLogs();
    }, [])
  );

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('workout_logs')
        .select('date, logged_data')
        .eq('user_id', user.id);

      if (error) throw error;

      const newMarked: any = {};
      let perfect = 0;
      let partial = 0;

      if (data) {
        data.forEach((log: WorkoutLog) => {
          const total = log.logged_data?.total_exercises || 0;
          const completedCount = log.logged_data?.completed_indices?.length || 0;
          
          if (total > 0 && completedCount > 0) {
            if (completedCount === total) {
              perfect++;
              newMarked[log.date] = {
                selected: true,
                selectedColor: '#34C759', // Green
                marked: true,
                dotColor: '#fff',
                activeOpacity: 1
              };
            } else {
              partial++;
              newMarked[log.date] = {
                selected: true,
                selectedColor: '#FF9500', // Orange tracking
                marked: true,
                dotColor: '#fff',
                activeOpacity: 1
              };
            }
          }
        });
      }

      setStats({
        totalWorkouts: perfect + partial,
        perfectDays: perfect,
        partialDays: partial
      });
      setMarkedDates(newMarked);

    } catch (err) {
      console.error("Error fetching logs:", err);
    } finally {
      setLoading(false);
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
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Your Progress History</Text>
        
        {Platform.OS !== 'web' ? (
          <Calendar
            markedDates={markedDates}
            theme={{
              todayTextColor: '#007AFF',
              arrowColor: '#007AFF',
            }}
            style={styles.calendar}
            disableAllTouchEventsForDisabledDays={true}
          />
        ) : (
          <View style={styles.calendarFallback}>
            <Text>Calendar view is currently unavailable on Web.</Text>
            <Text style={{ marginTop: 10, color: '#007AFF' }}>Total Active Days: {stats.totalWorkouts}</Text>
          </View>
        )}

        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Activity Summary</Text>
          
          <View style={styles.statRow}>
            <View style={[styles.colorBox, { backgroundColor: '#34C759' }]} />
            <Text style={styles.statText}>Fully Completed Workouts: {stats.perfectDays}</Text>
          </View>
          
          <View style={styles.statRow}>
            <View style={[styles.colorBox, { backgroundColor: '#FF9500' }]} />
            <Text style={styles.statText}>Partially Completed: {stats.partialDays}</Text>
          </View>
          
          <View style={styles.divider} />
          
          <Text style={styles.totalText}>Total Active Days: {stats.totalWorkouts}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    padding: 20,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
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
  statsContainer: {
    backgroundColor: '#F2F2F7',
    padding: 20,
    borderRadius: 12,
  },
  statsTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  colorBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    marginRight: 10,
  },
  statText: {
    fontSize: 16,
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 15,
  },
  totalText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  calendarFallback: {
    padding: 20,
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  }
});
