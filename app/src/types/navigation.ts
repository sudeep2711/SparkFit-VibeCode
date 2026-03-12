import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
  WorkoutActive: { planId: string; dailyPlan: any };
  WorkoutSummary: { planId: string; logId: string; stats: any };
  MidWorkoutChat: { exerciseName: string; currentSet: number; targetSets: number; coachTip?: string };
  ChangeWorkoutChat: { planId: string };
};

export type AuthStackParamList = {
  Welcome: undefined;
};

export type OnboardingStackParamList = {
  AIOnboardingChat: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  WorkoutPlan: undefined;
  Progress: undefined;
  AICoach: undefined;
};

// Global navigation type
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList { }
  }
}
