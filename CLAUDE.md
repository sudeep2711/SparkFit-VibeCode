# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the `app/` directory:

```bash
cd app

npm install          # Install dependencies
npx expo start       # Start dev server (opens Expo Go QR code)
npx expo start --ios     # iOS simulator
npx expo start --android # Android emulator
npx expo start --web     # Web browser (localhost:8081)
```

No test runner or linter is currently configured.

## Architecture Overview

SparkFit is a React Native (Expo) mobile app with a Supabase backend. AI features are powered by Google Gemini 2.5 Flash, called exclusively from Supabase Edge Functions (never directly from the client).

### Frontend (`app/`)

- **Entry:** `App.tsx` → `src/navigation/AppNavigator.tsx`
- **Supabase client:** `src/services/supabase.ts` — singleton exported as `supabase`, used directly in screens
- **State management:** Local React state + hooks only; no global store

**Navigation structure (nested):**
```
RootStack
├── Auth (stack)        → WelcomeScreen (sign up / sign in)
├── Onboarding (stack)  → AIOnboardingChatScreen (conversational onboarding → plan generation)
├── Main (bottom tabs)
│   ├── Dashboard       → today's workout, start workout button
│   ├── WorkoutPlan     → calendar view of 7-day plan
│   ├── Progress        → completion heatmap
│   └── AICoach         → general fitness chat
├── WorkoutActive       → full-screen workout execution (gesture back disabled)
├── WorkoutSummary      → post-workout feedback capture (gesture back disabled)
├── MidWorkoutChat      → modal; context-aware chat during a workout
└── ChangeWorkoutChat   → modal; request plan modifications
```

Auth state (authenticated vs. not) and onboarding completion (has a `workout_plan` row or not) determine which root is shown — this logic lives in `AppNavigator.tsx`.

### Backend (`supabase/`)

Edge Functions run on Deno and are the only layer that holds the Gemini API key. The client invokes them via `supabase.functions.invoke(...)`.

| Function | Purpose |
|---|---|
| `generate-workout-plan` | Processes onboarding transcript, calls Gemini, upserts JSONB plan into `workout_plans`, updates `profiles.ai_context_summary` |
| `generate-daily-workout` | Generates a single-day workout (post-MVP adaptive regen) |
| `chat-coach` | General AI chat; fetches user profile + plan as system context before calling Gemini |
| `chat-onboarding` | Scoped conversational agent extracting fitness params before triggering plan generation |

### Database Schema

| Table | Key columns |
|---|---|
| `profiles` | `goal`, `fitness_level`, `workout_days_per_week`, `equipment`, `ai_context_summary` (JSONB) |
| `workout_plans` | `plan_data` (JSONB — full 7-day structure with exercise names, sets, reps, `coach_tip` per movement) |
| `workout_logs` | `logged_data` (JSONB — actual execution: reps, weight, duration per set per exercise) |
| `workout_feedback` | `perceived_exertion` (int 1–10), `text_feedback` |

RLS is enabled on all tables (`auth.uid() = user_id`). Schema source of truth: `supabase_schema.sql`.

### Key Patterns

- **JSONB everywhere:** Both the AI-generated plan and the user's logged execution data are stored as JSONB, keeping the schema flexible for AI output variation.
- **AI tips come from the plan, not live calls:** `coach_tip` strings are embedded in `workout_plans.plan_data` at generation time and displayed in `WorkoutActiveScreen` without a live Gemini call.
- **Web compatibility shims:** `react-native-calendars` crashes on web; `WorkoutPlanScreen` has a fallback rendering path. React Navigation deep linking is configured in `AppNavigator.tsx`.
- **No environment variables in the app:** Supabase URL and anon key are hardcoded in `src/services/supabase.ts` (anon key is safe to expose; Gemini key lives only in Supabase Edge Function secrets).
