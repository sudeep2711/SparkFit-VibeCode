import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Import Types
import { RootStackParamList, AuthStackParamList, OnboardingStackParamList, MainTabParamList } from '../types/navigation';

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
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName: keyof typeof Ionicons.glyphMap = 'help-circle-outline';

        if (route.name === 'Dashboard') {
          iconName = focused ? 'barbell' : 'barbell-outline';
        } else if (route.name === 'Progress') {
          iconName = focused ? 'stats-chart' : 'stats-chart-outline';
        } else if (route.name === 'AICoach') {
          iconName = focused ? 'flash' : 'flash-outline';
        } else if (route.name === 'Profile') {
          iconName = focused ? 'person' : 'person-outline';
        }

        return <Ionicons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#CBFF5B',
      tabBarInactiveTintColor: '#555',
      tabBarStyle: { backgroundColor: '#0D0D0D', borderTopColor: '#1C1C1E' },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    })}
  >
    <MainTab.Screen
      name="Dashboard"
      component={DashboardScreen}
      options={{ tabBarLabel: 'WORKOUT', headerShown: false }}
    />
    <MainTab.Screen
      name="Progress"
      component={ProgressScreen}
      options={{ tabBarLabel: 'INSIGHTS', headerShown: false }}
    />
    <MainTab.Screen
      name="AICoach"
      component={AICoachScreen}
      options={{ tabBarLabel: 'SPARK AI', headerShown: false }}
    />
    <MainTab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{ tabBarLabel: 'PROFILE', headerShown: false }}
    />
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
          Progress: 'progress',
          AICoach: 'coach',
          Profile: 'profile',
        },
      },
      WorkoutPlan: 'plan',
      WorkoutActive: 'workout-active',
      WorkoutSummary: 'workout-summary',
      MidWorkoutChat: 'mid-workout-chat',
    },
  },
};

export const AppNavigator = () => {
  return (
    <NavigationContainer linking={linking as any}>
      <RootStack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Auth">
        <RootStack.Screen name="Auth" component={AuthNavigator} />
        <RootStack.Screen name="Onboarding" component={OnboardingNavigator} />
        <RootStack.Screen name="Main" component={MainTabNavigator} />

        {/* 7-Day Plan — accessed from Dashboard */}
        <RootStack.Screen name="WorkoutPlan" component={WorkoutPlanScreen} />

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
