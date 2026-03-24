import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { supabase } from '../services/supabase';

// Import Types
import { RootStackParamList, AuthStackParamList, OnboardingStackParamList, MainTabParamList } from '../types/navigation';
import { CustomTabBar } from './CustomTabBar';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Import Screens
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { AIOnboardingChatScreen } from '../screens/AIOnboardingChatScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { WorkoutPlanScreen } from '../screens/WorkoutPlanScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { AICoachScreen } from '../screens/AICoachScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WorkoutActiveScreen } from '../screens/WorkoutActiveScreen';
import { WorkoutSummaryScreen } from '../screens/WorkoutSummaryScreen';
import { MidWorkoutChatScreen } from '../screens/MidWorkoutChatScreen';
import { ChangeWorkoutChatScreen } from '../screens/ChangeWorkoutChatScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
  </AuthStack.Navigator>
);

const OnboardingNavigator = () => (
  <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
    <OnboardingStack.Screen name="AIOnboardingChat" component={AIOnboardingChatScreen} />
  </OnboardingStack.Navigator>
);

const MainTabNavigator = () => (
  <MainTab.Navigator
    tabBar={(props) => <CustomTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <MainTab.Screen name="Dashboard" component={DashboardScreen} />
    <MainTab.Screen name="WorkoutPlan" component={WorkoutPlanScreen} />
    <MainTab.Screen name="Progress" component={ProgressScreen} />
    <MainTab.Screen name="AICoach" component={AICoachScreen} />
    <MainTab.Screen name="Profile" component={ProfileScreen} />
  </MainTab.Navigator>
);

const linking = {
  prefixes: ['sparkfit://', 'http://localhost:8081'],
  config: {
    screens: {
      Auth: {
        screens: {
          Welcome: 'welcome',
        },
      },
      Onboarding: {
        screens: {
          AIOnboardingChat: 'onboarding-chat',
        },
      },
      Main: {
        screens: {
          Dashboard: 'dashboard',
          WorkoutPlan: 'plan',
          Progress: 'progress',
          AICoach: 'coach',
          Profile: 'profile',
        },
      },
      WorkoutActive: 'workout-active',
      WorkoutSummary: 'workout-summary',
      MidWorkoutChat: 'mid-workout-chat',
    },
  },
};

export const AppNavigator = () => {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: 'Auth' }] });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <NavigationContainer ref={navigationRef} linking={linking as any}>
      <RootStack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Auth">
        <RootStack.Screen name="Auth" component={AuthNavigator} />
        <RootStack.Screen name="Onboarding" component={OnboardingNavigator} />
        <RootStack.Screen name="Main" component={MainTabNavigator} />

        {/* Full Screen Workout Flow */}
        <RootStack.Screen
          name="WorkoutActive"
          component={WorkoutActiveScreen}
          options={{ gestureEnabled: false }}
        />
        <RootStack.Screen
          name="WorkoutSummary"
          component={WorkoutSummaryScreen}
          options={{ gestureEnabled: false }}
        />
        <RootStack.Screen
          name="MidWorkoutChat"
          component={MidWorkoutChatScreen}
          options={{ presentation: 'modal' }}
        />
        <RootStack.Screen
          name="ChangeWorkoutChat"
          component={ChangeWorkoutChatScreen}
          options={{ presentation: 'modal' }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
};
