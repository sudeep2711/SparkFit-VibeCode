# SparkFit MVP Status Report
**Date:** March 7, 2026 - 5:01 PM

## 1. Project Foundation
- **Tech Stack Chosen:** React Native (Expo) for mobile & web cross-platform support, Supabase Backend, Google Gemini AI.
- **Node.js Environment:** Configured. (Note: Currently using v20.11.1; Expo throws a soft warning asking to upgrade to v20.19.4 later, but everything works).
- **Expo App Instantiated:** Running successfully at `localhost:8081`. 
- **Web Build Fixed:** Resolved a fatal crash caused by `react-native-url-polyfill`. The `WelcomeScreen` (Auth) successfully renders in the browser.

## 2. Database Schema (Supabase)
The MVP database structure is fully mapped out in raw SQL (stored in `supabase_schema.sql`). 
We have designed the following tables:
1. `profiles`: Stores user settings, goals, limits, and fitness stats. Automatically creates a row when a new user signs up in Supabase Auth.
2. `workout_plans`: Stores generated AI weekly plans.
3. `workout_logs`: Stores daily check-ins (what weight was lifted, how many reps).
4. `workout_feedback`: Stores post-workout "vibes" (e.g. "Too hard", "felt easy") to feed back into the AI loop.

## 3. Core App Navigation
We built the scaffolding for a multi-stack navigation flow:
- **Auth Stack:** `WelcomeScreen` is live and simulates signing up and signing in with Supabase Auth logic written.
- **Onboarding Flow:** `AIOnboardingChatScreen` logic is built.
- **Main App Stack (Bottom Tabs):** Created empty UI structures for `DashboardScreen`, `WorkoutPlanScreen`, `DailyLogScreen`, `ProgressScreen`, `AICoachScreen`, and `ProfileScreen`.

## 4. Gemini AI Integration (Current Focus)
- Installed the official `@google/genai` JavaScript SDK.
- Configured a **Supabase Edge Function** (`supabase/functions/chat-onboarding/index.ts`) written in Deno. This function is designed to:
   1. securely hold the Gemini API key in the backend.
   2. use `gemini-2.5-flash` for high-speed conversational responses.
   3. Stream the AI text back to the mobile app token-by-token.
- Written the entire UI for the `AIOnboardingChatScreen`.

### 🚨 Current Blocker
To test the AI Chat system, we must run the Supabase backend.
- We installed the **Supabase Local Dev CLI** (`brew install supabase`).
- We securely stored the Gemini API Key inside `.env.local`.
- When trying to start the backend with `supabase start`, it failed because **Docker Desktop** is not currently running on the Macbook. Docker is an absolute requirement for Supabase to run its Postgres database locally.

### Next Step Options:
1.  **Install/Start Docker:** We install and boot up Docker on the Mac so the local testing backend can mount.
2.  **Bypass Local Dev:** Instead of running the backend on the physical computer, we can create a live project on supabase.com right now and deploy our code there.
