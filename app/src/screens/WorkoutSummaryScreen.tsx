import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { supabase } from '../services/supabase';

type SummaryNavigationProp = NativeStackNavigationProp<RootStackParamList, 'WorkoutSummary'>;

export const WorkoutSummaryScreen = () => {
  const navigation = useNavigation<SummaryNavigationProp>();
  const route = useRoute<any>();

  const { planId, stats } = route.params;

  const [feedback, setFeedback] = useState<string | null>(null);
  const [workoutNotes, setWorkoutNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    if (!feedback) {
      Alert.alert("Feedback Required", "Please let us know how the workout felt!");
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const today = new Date().toISOString().split('T')[0];

      const { data: existingLog } = await supabase
        .from('workout_logs')
        .select('id, logged_data')
        .eq('user_id', user.id)
        .eq('plan_id', planId)
        .eq('date', today)
        .maybeSingle();

      const fullCompletedIndices = Array.from({ length: stats.totalExercises }, (_, i) => i);

      const loggedData = {
        completed_indices: fullCompletedIndices,
        total_exercises: stats.totalExercises,
        feedback: feedback,
        actual_volume: stats.totalSets,
        duration_mins: stats.durationMins,
        is_partial: stats.isPartial,
        session_logs: stats.sessionLogs,
        notes: workoutNotes
      };

      if (existingLog) {
        const { error } = await supabase
          .from('workout_logs')
          .update({ logged_data: loggedData })
          .eq('id', existingLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('workout_logs')
          .insert({
            user_id: user.id,
            plan_id: planId,
            date: today,
            logged_data: loggedData
          });
        if (error) throw error;
      }

      navigation.navigate('Main');

    } catch (err: any) {
      console.error("Error saving workout:", err);
      Alert.alert("Save Error", "Could not save workout. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          <View style={styles.headerIconContainer}>
            <Ionicons name="trophy" size={80} color="#FF9500" />
          </View>
          <Text style={styles.title}>{stats.isPartial ? 'Workout Saved' : 'Workout Complete!'}</Text>
          <Text style={styles.subtitle}>{stats.isPartial ? 'Partial session logged successfully.' : 'Great job showing up today.'}</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats?.totalExercises || 0}</Text>
              <Text style={styles.statLabel}>Exercises</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats?.totalSets || 0}</Text>
              <Text style={styles.statLabel}>Total Sets</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats?.durationMins > 0 ? stats.durationMins : '<1'}m</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
          </View>

          <View style={styles.feedbackSection}>
            <Text style={styles.feedbackTitle}>How did this workout feel?</Text>
            <View style={styles.feedbackRow}>
              <TouchableOpacity
                style={[styles.feedbackBtn, feedback === 'Too Easy' && styles.feedbackBtnActive]}
                onPress={() => setFeedback('Too Easy')}
              >
                <Text style={[styles.feedbackText, feedback === 'Too Easy' && styles.feedbackTextActive]}>Too Easy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.feedbackBtn, feedback === 'Good' && styles.feedbackBtnActive]}
                onPress={() => setFeedback('Good')}
              >
                <Text style={[styles.feedbackText, feedback === 'Good' && styles.feedbackTextActive]}>Good</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.feedbackBtn, feedback === 'Too Hard' && styles.feedbackBtnActive]}
                onPress={() => setFeedback('Too Hard')}
              >
                <Text style={[styles.feedbackText, feedback === 'Too Hard' && styles.feedbackTextActive]}>Too Hard</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.notesSection}>
            <Text style={styles.feedbackTitle}>Workout Notes (Optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="How did you perform? Any PRs?"
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
              value={workoutNotes}
              onChangeText={setWorkoutNotes}
            />
          </View>

          {/* Spacer to push button above keyboard if needed, or rely on absolute footer */}
          <View style={{ height: 100 }} />

        </ScrollView>

        <View style={styles.stickyFooter}>
          <TouchableOpacity
            style={[styles.primaryButton, (!feedback || saving) && styles.primaryButtonDisabled]}
            onPress={handleFinish}
            disabled={!feedback || saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Finish & Save</Text>
                <Ionicons name="checkmark-done" size={24} color="#fff" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 40,
    alignItems: 'center',
  },

  headerIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFF4E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 32, fontWeight: '800', color: '#000', marginBottom: 8 },
  subtitle: { fontSize: 18, color: '#666', marginBottom: 30 },

  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 40,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: '#000', marginBottom: 4 },
  statLabel: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },

  feedbackSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 30,
  },
  feedbackTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 15, alignSelf: 'flex-start' },
  feedbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  feedbackBtn: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 5,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  feedbackBtnActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#34C759',
  },
  feedbackText: { fontSize: 16, fontWeight: '600', color: '#666' },
  feedbackTextActive: { color: '#34C759', fontWeight: '800' },

  notesSection: {
    width: '100%',
    marginBottom: 20,
  },
  notesInput: {
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
    minHeight: 120,
    textAlignVertical: 'top',
  },

  stickyFooter: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  primaryButton: {
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
  primaryButtonDisabled: {
    backgroundColor: '#A1A1AA',
    shadowOpacity: 0,
  },
  primaryButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});
