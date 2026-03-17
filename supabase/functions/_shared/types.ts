// Shared types for all SparkFit agents

export interface AgentRequest {
  userId: string;
  message: string;
  context?: AgentContext;
}

export interface AgentContext {
  screen?: string;          // current screen the user is on
  exerciseName?: string;    // for mid-workout context
  planId?: string;          // active plan id
  sessionId?: string;       // chat session id for grouping history
  pendingPlan?: WeekPlan;   // carries proposed plan through confirmation round-trip
  [key: string]: unknown;
}

export interface AgentResponse {
  response: string;
  actions?: AgentAction[];
  agent?: string;
}

export interface AgentAction {
  type: ActionType;
  payload: Record<string, unknown>;
}

export type ActionType =
  | 'navigate_to_screen'
  | 'update_plan'
  | 'swap_exercise'
  | 'trim_workout'
  | 'save_profile'
  | 'show_chart'
  | 'update_streak'
  | 'propose_plan_change';

export interface Memory {
  id: string;
  user_id: string;
  content: string;
  type: MemoryType;
  metadata: Record<string, unknown>;
  created_at: string;
  similarity?: number;
}

export type MemoryType = 'workout_log' | 'chat' | 'feedback' | 'profile';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  agent?: string;
}

export interface UserProfile {
  id: string;
  goal?: string;
  fitness_level?: string;
  workout_days_per_week?: number;
  equipment?: string;
  equipment_list?: string[];
  ai_context_summary?: string;
  onboarding_complete?: boolean;
}

export interface Exercise {
  name: string;
  type: 'strength' | 'cardio' | 'interval' | 'calisthenics' | 'isometric';
  sets: number;
  reps: number | string;
  estimated_time_secs: number;
  estimated_rest_time_secs: number;
  coach_tip: string;
  weight?: number;
  duration_secs?: number;
}

export interface DayPlan {
  day: string;
  focus: string;
  estimated_total_time_mins: number;
  exercises: Exercise[];
  is_rest_day?: boolean;
}

export type WeekPlan = DayPlan[];

export type IntentType =
  | 'onboarding'
  | 'modify_plan'
  | 'modify_today'
  | 'check_progress'
  | 'general_chat'
  | 'unknown';
