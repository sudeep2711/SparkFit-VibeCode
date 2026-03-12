import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

type WorkoutActiveNavigationProp = NativeStackNavigationProp<RootStackParamList, 'WorkoutActive'>;

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

export type LoggedExercise = {
  name: string;
  type: 'strength' | 'cardio' | 'interval' | 'calisthenics' | 'isometric';
  setsLogs: {
    weight?: number;
    reps?: number;
    duration?: number;
    distance_miles?: number;
    completed_rounds?: number;
  }[];
};

export const WorkoutActiveScreen = () => {
  const navigation = useNavigation<WorkoutActiveNavigationProp>();
  const route = useRoute<any>();

  const { planId, dailyPlan } = route.params;
  const exercises: Exercise[] = dailyPlan.exercises || [];

  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);

  const [sessionLogs, setSessionLogs] = useState<LoggedExercise[]>([]);
  const [currentExerciseLog, setCurrentExerciseLog] = useState<{
    weight?: number;
    reps?: number;
    duration?: number;
    distance_miles?: number;
    completed_rounds?: number;
  }[]>([]);

  // Rest Timer State
  const [isResting, setIsResting] = useState(false);
  const [restTime, setRestTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Set Timer State
  const [setDuration, setSetDuration] = useState(0);

  // Custom Tracker States
  const [currentRound, setCurrentRound] = useState(1);
  const [intervalState, setIntervalState] = useState<'run' | 'walk'>('run');
  const [intervalTimeRemaining, setIntervalTimeRemaining] = useState(0);
  const [holdTimeRemaining, setHoldTimeRemaining] = useState(0);
  const [distanceMiles, setDistanceMiles] = useState(0);

  // Total Workout Timer State
  const [totalWorkoutTime, setTotalWorkoutTime] = useState(0);

  const currentExercise = exercises[exerciseIndex];
  const isLastExercise = exerciseIndex === exercises.length - 1;
  const isLastSet = currentSet >= (currentExercise?.sets || 1);

  useEffect(() => {
    if (currentExercise) {
      setReps(currentExercise.reps || 10);

      if (currentExercise.type === 'interval') {
        setCurrentRound(1);
        setIntervalState('run');
        setIntervalTimeRemaining(currentExercise.interval_run_secs || 60);
      } else if (currentExercise.type === 'isometric') {
        setHoldTimeRemaining(currentExercise.hold_time_secs || 60);
      }
    }
  }, [currentExercise, currentSet]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isResting && restTime > 0 && !isPaused) {
      interval = setInterval(() => {
        setRestTime((prev) => prev - 1);
      }, 1000);
    } else if (isResting && restTime <= 0 && !isPaused) {
      finishRest();
    }
    return () => clearInterval(interval);
  }, [isResting, restTime, isPaused]);

  // Overall workout and current set timers
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!isPaused) {
      interval = setInterval(() => {
        setTotalWorkoutTime((prev) => prev + 1);
        if (!isResting) {
          setSetDuration((prev) => prev + 1);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPaused, isResting]);

  // Specialized Timers for Interval and Isometric
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!isPaused && !isResting && currentExercise) {
      interval = setInterval(() => {
        if (currentExercise.type === 'isometric') {
          setHoldTimeRemaining(prev => Math.max(0, prev - 1));
        } else if (currentExercise.type === 'interval') {
          setIntervalTimeRemaining(prev => {
            if (prev <= 1) return 0;
            return prev - 1;
          });
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPaused, isResting, currentExercise]);

  // Handle Interval State Switching
  useEffect(() => {
    // NOTE: We don't trigger handleNextSet automatically right here because it can cause a 
    // bad render cycle if state updates eagerly. But we CAN switch between run/walk states.
    if (currentExercise?.type === 'interval' && intervalTimeRemaining === 0 && !isPaused && !isResting) {
      if (intervalState === 'run') {
        setIntervalState('walk');
        setIntervalTimeRemaining(currentExercise.interval_walk_secs || 120);
      } else {
        // finished a walk, so round is done
        if (currentRound < (currentExercise.rounds || 1)) {
          setCurrentRound(prev => prev + 1);
          setIntervalState('run');
          setIntervalTimeRemaining(currentExercise.interval_run_secs || 60);
        }
        // If currentRound >= rounds, it just sits at 0, ready for user to click Complete Exercise
      }
    }
  }, [intervalTimeRemaining, intervalState, currentExercise, currentRound, isPaused, isResting]);

  const handleExit = () => {
    const currentLogs = [...sessionLogs];
    if (currentExerciseLog.length > 0) {
      currentLogs.push({
        name: currentExercise.name,
        type: currentExercise.type,
        setsLogs: currentExerciseLog
      });
    }

    const totalSets = currentLogs.reduce((acc, curr) => acc + curr.setsLogs.length, 0);
    const stats = {
      totalExercises: currentLogs.length,
      totalSets: totalSets,
      durationMins: Math.round(totalWorkoutTime / 60),
      isPartial: true,
      sessionLogs: currentLogs
    };

    if (Platform.OS === 'web') {
      if (window.confirm("End Workout Early?\\nAre you sure you want to end your workout? Your current progress will be saved as partial.")) {
        if (totalSets > 0) {
          navigation.replace('WorkoutSummary', { planId, logId: '', stats });
        } else {
          navigation.navigate('Main');
        }
      }
    } else {
      Alert.alert(
        "End Workout Early?",
        "Are you sure you want to end your workout? Your current progress will be saved as partial.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "End Workout",
            style: "destructive",
            onPress: () => {
              if (totalSets > 0) {
                navigation.replace('WorkoutSummary', { planId, logId: '', stats });
              } else {
                navigation.navigate('Main');
              }
            }
          }
        ]
      );
    }
  };

  const handleRestart = () => {
    if (Platform.OS === 'web') {
      if (window.confirm("Restart Workout?\\nThis will erase all sets logged so far and start the workout from the beginning. Are you sure?")) {
        setExerciseIndex(0);
        setCurrentSet(1);
        setSessionLogs([]);
        setCurrentExerciseLog([]);
        setIsResting(false);
        setRestTime(0);
        setIsPaused(false);
        setSetDuration(0);
        setTotalWorkoutTime(0);
      }
    } else {
      Alert.alert(
        "Restart Workout?",
        "This will erase all sets logged so far and start the workout from the beginning. Are you sure?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restart", style: "destructive", onPress: () => {
              setExerciseIndex(0);
              setCurrentSet(1);
              setSessionLogs([]);
              setCurrentExerciseLog([]);
              setIsResting(false);
              setRestTime(0);
              setIsPaused(false);
              setSetDuration(0);
              setTotalWorkoutTime(0);
            }
          }
        ]
      );
    }
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const handleNextSet = () => {
    const newLog = [...currentExerciseLog, {
      weight,
      reps,
      duration: setDuration,
      distance_miles: distanceMiles,
      completed_rounds: currentRound
    }];
    setCurrentExerciseLog(newLog);

    if (isLastSet) {
      const updatedSessionLogs = [...sessionLogs, {
        name: currentExercise.name,
        type: currentExercise.type,
        setsLogs: newLog
      }];
      setSessionLogs(updatedSessionLogs);

      if (isLastExercise) {
        const totalSets = updatedSessionLogs.reduce((acc, curr) => acc + curr.setsLogs.length, 0);
        const stats = {
          totalExercises: updatedSessionLogs.length,
          totalSets: totalSets,
          durationMins: Math.round(totalWorkoutTime / 60),
          isPartial: false,
          sessionLogs: updatedSessionLogs
        };

        setTimeout(() => {
          navigation.replace('WorkoutSummary', {
            planId,
            logId: '',
            stats: stats
          });
        }, 500);

      } else {
        setExerciseIndex(prev => prev + 1);
        setCurrentSet(1);
        setCurrentExerciseLog([]);
      }
    } else {
      setCurrentSet(prev => prev + 1);
      setRestTime(currentExercise.estimated_rest_time_secs ?? 90);
      setIsResting(true);
      setIsPaused(false);
      setSetDuration(0);
    }
  };

  const finishRest = () => {
    setIsResting(false);
    setRestTime(0);
    setSetDuration(0);
  };

  const adjustRestTime = (amount: number) => {
    setRestTime(prev => Math.max(0, prev + amount));
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!currentExercise) return <SafeAreaView style={styles.safeArea} />;

  const HeaderControls = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={handleExit} style={styles.iconButton}>
        <Ionicons name="close" size={28} color="#000" />
      </TouchableOpacity>

      <View style={styles.centerHeaderControl}>
        <View style={styles.progressBarContainer}>
          {exercises.map((_, idx) => {
            let fillPercentage = 0;
            if (idx < exerciseIndex) {
              fillPercentage = 100;
            } else if (idx === exerciseIndex) {
              fillPercentage = ((currentSet - 1) / (exercises[idx].sets || 1)) * 100;
            }
            return (
              <View key={idx} style={styles.progressSegmentBackground}>
                <View style={[styles.progressSegmentFill, { width: `${fillPercentage}%` }]} />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.rightHeaderControls}>
        <Text style={styles.totalTimerText}>{formatTime(totalWorkoutTime)}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('MidWorkoutChat', {
          exerciseName: currentExercise.name,
          currentSet: currentSet,
          targetSets: currentExercise.sets || 1,
          coachTip: currentExercise?.coach_tip
        })} style={styles.iconButton}>
          <Ionicons name="chatbubble-ellipses" size={26} color="#007AFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={togglePause} style={styles.iconButton}>
          <Ionicons name={isPaused ? "play" : "pause"} size={26} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRestart} style={styles.iconButton}>
          <Ionicons name="refresh" size={26} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isResting) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <HeaderControls />
        <View style={styles.restContainer}>
          <Text style={styles.restHeader}>Rest Period</Text>

          <View style={[styles.timerCircle, isPaused && styles.timerCirclePaused]}>
            <Text style={[styles.timerText, isPaused && styles.timerTextPaused]}>
              {formatTime(restTime)}
            </Text>
            {isPaused && <Text style={styles.pausedLabel}>PAUSED</Text>}
          </View>

          <View style={styles.restControls}>
            <TouchableOpacity style={styles.timeAdjustBtn} onPress={() => adjustRestTime(-15)}>
              <Text style={styles.timeAdjustText}>-15s</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.timeAdjustBtn} onPress={() => adjustRestTime(15)}>
              <Text style={styles.timeAdjustText}>+15s</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.upNextCard}>
            <Text style={styles.upNextTitle}>UP NEXT</Text>
            <Text style={styles.upNextDetail}>
              {currentExercise.name} - Set {currentSet}
            </Text>
          </View>

          <View style={styles.stickyFooter}>
            <TouchableOpacity style={styles.skipButton} onPress={finishRest} activeOpacity={0.8}>
              <Text style={styles.skipButtonText}>Skip Rest</Text>
              <Ionicons name="play-forward" size={24} color="#000" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <HeaderControls />

      {isPaused && (
        <View style={styles.pausedBanner}>
          <Ionicons name="pause" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.pausedBannerText}>Workout Paused</Text>
        </View>
      )}

      <View style={[styles.container, isPaused && { opacity: 0.5 }]}>
        <Text style={styles.exerciseName}>{currentExercise.name}</Text>
        <View style={styles.targetBadge}>
          <Text style={styles.targetText}>
            Target: {currentExercise.sets} Sets x {currentExercise.reps} Reps
          </Text>
        </View>

        {currentExercise.coach_tip && (
          <View style={styles.coachTipContainer}>
            <Ionicons name="bulb" size={18} color="#007AFF" />
            <Text style={styles.coachTipText}>Coach: {currentExercise.coach_tip}</Text>
          </View>
        )}

        <View style={styles.activeSetBadge}>
          <Text style={styles.activeSetText}>
            {currentExercise.type === 'interval'
              ? `Round ${currentRound} of ${currentExercise.rounds || 1}`
              : currentExercise.type === 'cardio'
                ? 'Cardio Session'
                : `Set ${currentSet} of ${currentExercise.sets || 1}`
            }
          </Text>
        </View>

        {(!currentExercise.type || currentExercise.type === 'strength') && (
          <>
            <View style={styles.stepperContainer}>
              <Text style={styles.stepperLabel}>Weight (lbs)</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => setWeight(Math.max(0, weight - 5))} disabled={isPaused}>
                  <Ionicons name="remove" size={32} color={isPaused ? "#ccc" : "#000"} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{weight}</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => setWeight(weight + 5)} disabled={isPaused}>
                  <Ionicons name="add" size={32} color={isPaused ? "#ccc" : "#000"} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.stepperContainer}>
              <Text style={styles.stepperLabel}>Reps Completed</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => setReps(Math.max(0, reps - 1))} disabled={isPaused}>
                  <Ionicons name="remove" size={32} color={isPaused ? "#ccc" : "#000"} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{reps}</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => setReps(reps + 1)} disabled={isPaused}>
                  <Ionicons name="add" size={32} color={isPaused ? "#ccc" : "#000"} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {currentExercise.type === 'calisthenics' && (
          <View style={styles.stepperContainer}>
            <Text style={styles.stepperLabel}>Reps Completed</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setReps(Math.max(0, reps - 1))} disabled={isPaused}>
                <Ionicons name="remove" size={32} color={isPaused ? "#ccc" : "#000"} />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{reps}</Text>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setReps(reps + 1)} disabled={isPaused}>
                <Ionicons name="add" size={32} color={isPaused ? "#ccc" : "#000"} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {currentExercise.type === 'cardio' && (
          <View style={styles.stepperContainer}>
            <Text style={styles.stepperLabel}>Distance (Miles)</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setDistanceMiles(Math.max(0, distanceMiles - 0.1))} disabled={isPaused}>
                <Ionicons name="remove" size={32} color={isPaused ? "#ccc" : "#000"} />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{distanceMiles.toFixed(1)}</Text>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setDistanceMiles(distanceMiles + 0.1)} disabled={isPaused}>
                <Ionicons name="add" size={32} color={isPaused ? "#ccc" : "#000"} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {currentExercise.type === 'isometric' && (
          <View style={styles.centeredTimerContainer}>
            <Text style={styles.stepperLabel}>Hold Time Remaining</Text>
            <Text style={styles.heroTimerText}>{formatTime(holdTimeRemaining)}</Text>
          </View>
        )}

        {currentExercise.type === 'interval' && (
          <View style={[styles.centeredTimerContainer, intervalState === 'walk' && styles.restIntervalContainer]}>
            <Text style={styles.stepperLabel}>{intervalState === 'run' ? 'WORK (Run)' : 'REST (Walk)'}</Text>
            <Text style={styles.heroTimerText}>{formatTime(intervalTimeRemaining)}</Text>
          </View>
        )}

        <View style={styles.setDurationBadge}>
          <Ionicons name="timer-outline" size={16} color="#666" style={{ marginRight: 4 }} />
          <Text style={styles.setDurationText}>Set Time: {formatTime(setDuration)}</Text>
        </View>

        <View style={styles.stickyFooter}>
          <TouchableOpacity
            style={[styles.primaryButton, isPaused && styles.primaryButtonDisabled]}
            onPress={isPaused ? togglePause : handleNextSet}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {isPaused ? "Resume Workout" : isLastSet && isLastExercise ? "Complete Workout" : isLastSet ? "Complete Exercise" : "Log Set & Rest"}
            </Text>
            <Ionicons name={isPaused ? "play" : "checkmark-circle"} size={24} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  iconButton: { padding: 4 },
  centerHeaderControl: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  progressBarContainer: {
    flexDirection: 'row',
    width: '100%',
    height: 6,
    gap: 4,
    justifyContent: 'center',
  },
  progressSegmentBackground: {
    flex: 1,
    height: '100%',
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressSegmentFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 3,
  },
  rightHeaderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  totalTimerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    fontVariant: ['tabular-nums'],
  },

  pausedBanner: {
    backgroundColor: '#FF9500',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  pausedBannerText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  exerciseName: { fontSize: 32, fontWeight: '800', marginTop: 20, textAlign: 'center' },
  targetBadge: {
    backgroundColor: '#F2F2F7',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 10,
    marginBottom: 15,
  },
  targetText: { fontSize: 16, fontWeight: '600', color: '#333' },
  coachTipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5F1FF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    marginHorizontal: 10,
  },
  coachTipText: {
    flex: 1,
    fontSize: 14,
    color: '#0047AB',
    fontWeight: '500',
    marginLeft: 8,
  },

  activeSetBadge: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  activeSetText: { fontSize: 22, fontWeight: '700', color: '#007AFF' },

  stepperContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#E5E5EA',
    alignItems: 'center',
  },
  stepperLabel: { fontSize: 18, fontWeight: '600', color: '#8E8E93', marginBottom: 15 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  stepperBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: {
    fontSize: 48,
    fontWeight: '800',
    width: 120,
    textAlign: 'center',
    color: '#000',
  },

  centeredTimerContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 30,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restIntervalContainer: {
    borderColor: '#FF9500',
    backgroundColor: '#FFF8F0',
  },
  heroTimerText: {
    fontSize: 64,
    fontWeight: '800',
    color: '#000',
    marginTop: 10,
    fontVariant: ['tabular-nums'],
  },

  setDurationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  setDurationText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
    backgroundColor: '#FF9500',
  },
  primaryButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },

  restContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 40,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  restHeader: { fontSize: 24, fontWeight: '600', color: '#666', marginBottom: 40 },
  timerCircle: {
    width: width * 0.6,
    height: width * 0.6,
    borderRadius: width * 0.3,
    borderWidth: 8,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  timerCirclePaused: {
    borderColor: '#FF9500',
  },
  timerText: { fontSize: 64, fontWeight: '800', color: '#000' },
  timerTextPaused: { color: '#FF9500' },
  pausedLabel: { fontSize: 18, fontWeight: '800', color: '#FF9500', marginTop: -10 },

  restControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 200,
    marginBottom: 40,
  },
  timeAdjustBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  timeAdjustText: { fontSize: 18, fontWeight: '600', color: '#000' },
  upNextCard: {
    backgroundColor: '#F9F9F9',
    padding: 20,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  upNextTitle: { fontSize: 14, fontWeight: '800', color: '#8E8E93', letterSpacing: 1, marginBottom: 8 },
  upNextDetail: { fontSize: 20, fontWeight: '600', color: '#000' },
  skipButton: {
    backgroundColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 30,
  },
  skipButtonText: { color: '#000', fontSize: 20, fontWeight: 'bold' }
});
