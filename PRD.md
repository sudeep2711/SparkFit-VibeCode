# SparkFit — Product Requirements Document

---

## 1. Product Vision

SparkFit is a personal AI fitness companion that helps people build a consistent workout habit, track real progress toward their goals, and feel supported every step of the way — like having a knowledgeable trainer and accountability buddy in your pocket.

The core insight: **most fitness apps track, but don't adapt. SparkFit acts.**

SparkFit is not just another chatbot wrapped around a workout plan. The more a user uses it, the smarter it gets about them — remembering their history, adapting their plan, celebrating their wins, and catching them before they quit.

---

## 2. Problems Being Solved

| # | Problem |
|---|---|
| 1 | Working out is intimidating for beginners — they don't know where to start |
| 2 | Plans are rigid — real life interrupts and users have no easy way to adapt |
| 3 | Generic plans don't actually get you to your specific goal |
| 4 | Most people quit in weeks 3–4 — there's no accountability or motivation layer |
| 5 | Users can't tell if they're making progress or going in the right direction |
| 6 | The timeline to a goal feels abstract — users can't quantify it |

---

## 3. Target User

- Age 18–35
- Wants to get fit but doesn't know where to start OR has tried before and quit
- Has a smartphone and goes to a gym or works out at home
- Not necessarily tech-savvy — needs the app to do the thinking for them
- Motivated by progress, streaks, and feeling seen by the product

---

## 4. Core Principles

1. **The AI companion is the superstar** — screens are predictable and reliable, the companion is the power layer on top
2. **Memory makes it personal** — RAG-powered memory means the companion remembers you across sessions
3. **Adapt, don't prescribe** — plans flex to real life, not the other way around
4. **Habit over hype** — streaks, check-ins, nudges, and milestones build long-term habit
5. **Simple on the surface** — beginners use the screens, power users use the companion

---

## 5. Feature List

| # | Feature | Category | Complexity |
|---|---|---|---|
| 1 | Predictable screens (Dashboard, Plan, Progress) | Core | Small |
| 2 | AI Companion chat (floating, always accessible) | Core | Small |
| 3 | Companion modifies workout on the fly | Core | Med |
| 4 | RAG memory (remembers your history) | Core | High |
| 5 | Multi-agent system | Core | High |
| 6 | Exercise videos/GIFs (ExerciseDB) | Core | Small |
| 7 | Workout streaks (lose streak if you skip) | Core | Small |
| 8 | Know My Equipment (tap / chat / voice) | Core | Med |
| 9 | Rest day swap ("move today to tomorrow") | Core | Small |
| 10 | "What does this mean?" — tap any term | Core | Small |
| 11 | Progressive overload suggestions | Core | Med |
| 12 | Personal records (PRs) detection & celebration | Nice | Small |
| 13 | Goal trajectory ("X weeks to your goal") | Nice | Med |
| 14 | Companion shows data/charts inline | Nice | Med |
| 15 | Proactive companion (nudges when you go quiet) | Nice | Med |
| 16 | Adaptive plan (auto-adjusts from progress data) | Nice | High |
| 17 | Weekly check-in from companion | Nice | Small |
| 18 | Strength trend charts per exercise | Nice | Med |
| 19 | Consistency score | Nice | Small |
| 20 | "Your past self" comparisons | Nice | Med |
| 21 | Milestone celebrations (25%, 50%, 75% to goal) | Nice | Small |
| 22 | Volume tracking (total weight lifted per week) | Nice | Small |
| 23 | "Ahead / behind schedule" vs goal pace | Nice | Med |
| 24 | Deload week detection (overtraining warning) | Nice | High |
| 25 | Voice interface | Dream | High |
| 26 | Scan my gym (photo → AI detects equipment) | Dream | High |

---

## 6. User Journeys

### Journey 1 — New User (Day 1)
1. Opens app, sees Welcome screen
2. AI Companion greets them conversationally
3. Onboarding Agent chats to understand: goal, fitness level, days per week, equipment
4. User sets up equipment via tap grid, chat, or photos
5. Plan Agent generates personalized 7-day plan
6. User lands on Dashboard — sees today's workout

### Journey 2 — Daily Workout
1. Opens app, Dashboard shows today's workout with exercise videos
2. Taps "Start Workout" → Workout execution screen
3. Mid-workout: companion is accessible via floating button
4. User says "no barbell today" → Daily Agent swaps exercise instantly
5. Finishes workout → logs sets, reps, weight
6. Companion celebrates, notes any PRs, updates streak

### Journey 3 — Real Life Interruption
1. User opens app, says "I only have 20 minutes today"
2. Daily Agent trims today's workout to fit
3. OR user says "can I move today to tomorrow?"
4. Plan Agent shifts the schedule, confirms with user

### Journey 4 — Progress Check
1. User asks companion "how am I doing?"
2. Progress Agent queries RAG for workout history
3. Companion responds with: streak, trend, goal trajectory, "your past self" comparison
4. Charts rendered inline in chat

### Journey 5 — At Risk of Quitting (Week 3-4)
1. User hasn't opened app in 3 days
2. Proactive companion sends nudge: "You've got a 12-day streak — don't break it"
3. User opens app, companion acknowledges the gap, adjusts expectations
4. Offers easier version of today's workout to lower the barrier

---

## 7. App Structure

### Screens (Predictable Layer)
- **Welcome** — sign in / sign up
- **Onboarding** — conversational profile setup
- **Dashboard** — today's workout, streak, coach insight
- **Workout Active** — exercise execution with timers, steppers, videos
- **Workout Summary** — post-workout stats, feedback, notes
- **Workout Plan** — 7-day calendar view
- **Progress** — heatmap, charts, goal trajectory
- **AI Companion** — persistent chat, accessible from everywhere

### Companion (Intelligence Layer)
- Floating button accessible from all screens
- Can read current screen context
- Can navigate to screens on behalf of user
- Can modify plans, show charts, surface memories
- Powered by multi-agent system underneath

---

## 8. Agent Architecture

### Overview
```
User Message
     ↓
[1] RAG Search — retrieve relevant memories
     ↓
[2] ORCHESTRATOR AGENT
    Reads message + memories, determines intent
     ↓
[3] Routes to specialist agent
     ↓
[4] Specialist runs, calls tools
     ↓
[5] Memory Agent writes interaction to RAG
     ↓
[6] Response to user
```

### Agents

#### Orchestrator Agent
- Entry point for all user messages
- Determines intent and routes to specialist
- Assembles final response
- Tools: `route_to_agent(agent, context)`

#### Onboarding Agent
- Handles new user profile setup conversationally
- Extracts: goal, fitness level, days/week, equipment
- Tools: `save_profile()`, `parse_equipment_from_text()`, `analyze_gym_photos()`

#### Plan Agent
- Generates and modifies weekly workout plans
- Handles: rest day swaps, deload detection, progressive overload, adaptive adjustments
- Tools: `generate_weekly_plan()`, `update_plan()`, `swap_rest_day()`, `get_user_history()`

#### Daily Agent
- Handles today's specific workout
- Handles: exercise swaps, time constraints, equipment constraints
- Tools: `get_todays_workout()`, `swap_exercise()`, `trim_workout()`, `fetch_exercise_video()`

#### Progress Agent
- Tracks and interprets user progress
- Handles: PRs, streaks, goal trajectory, charts, consistency
- Tools: `get_workout_logs()`, `calculate_streak()`, `calculate_goal_trajectory()`, `detect_pr()`, `generate_chart()`

#### Memory Agent
- Reads and writes to RAG vector store
- Runs automatically after every workout and chat session
- Tools: `embed_and_store()`, `search_memories()`, `summarize_session()`

#### Companion Agent
- The face of the AI — handles all direct conversation
- Has access to all other agents as tools
- Grounds responses in RAG memory
- Handles: motivation, explanations, celebrations, nudges
- Tools: all specialist agents + `navigate_to_screen()`

---

## 9. Technical Architecture

### Frontend
- **Framework:** React Native + Expo (existing)
- **Navigation:** React Navigation (existing)
- **New:** Floating companion button on all screens
- **New:** Inline chart rendering in chat
- **New:** Exercise video/GIF component (ExerciseDB API)
- **New:** Equipment tap-grid UI

### Backend
- **Platform:** Supabase (existing)
- **Runtime:** Deno Edge Functions (existing)
- **AI Model:** Google Gemini 2.5 Flash (all agents)
- **Embeddings:** Google `text-embedding-004`
- **Vector Store:** Supabase pgvector extension

### Database — New Tables

#### `memories` (RAG store)
```sql
id          uuid
user_id     uuid
content     text        -- the raw text
embedding   vector(768) -- text-embedding-004 output
type        text        -- 'workout_log' | 'chat' | 'feedback' | 'profile'
metadata    jsonb       -- date, exercise names, etc.
created_at  timestamp
```

#### `chat_history` (persistent conversation log)
```sql
id          uuid
user_id     uuid
role        text        -- 'user' | 'model'
content     text
agent       text        -- which agent responded
created_at  timestamp
```

#### `streaks`
```sql
user_id         uuid
current_streak  int
longest_streak  int
last_workout    date
updated_at      timestamp
```

### Existing Tables (kept, some extended)
- `profiles` — add `equipment_list jsonb`, `onboarding_complete bool`
- `workout_plans` — unchanged
- `workout_logs` — unchanged
- `workout_feedback` — unchanged

---

## 10. Build Phases

### Phase 1 — Core (Must Have, P0)
**Goal:** Working app with agentic backend and RAG memory

- [ ] Enable pgvector on Supabase, create `memories` table
- [ ] Build Memory Agent (embed + retrieve)
- [ ] Build Orchestrator + Companion Agent with RAG context
- [ ] Build Plan Agent (replaces `generate-workout-plan` edge function)
- [ ] Build Daily Agent (replaces `generate-daily-workout` edge function)
- [ ] Build Onboarding Agent (replaces rigid state machine)
- [ ] Integrate ExerciseDB GIFs into workout execution screen
- [ ] Add workout streak tracking
- [ ] Add Know My Equipment tap grid
- [ ] Add rest day swap via companion
- [ ] Fix `verify_jwt` bug on `generate-workout-plan`
- [ ] Add persistent `chat_history` table

### Phase 2 — Nice to Have
**Goal:** Habit and tracking layer

- [ ] Progress Agent (PRs, goal trajectory, consistency score)
- [ ] Inline charts in companion chat
- [ ] Proactive nudges via CRON job
- [ ] Weekly check-in from companion
- [ ] "Your past self" comparisons
- [ ] Milestone celebrations
- [ ] Adaptive plan auto-adjustment

### Phase 3 — Dream
**Goal:** Wow features

- [ ] Voice interface (speech-to-text + text-to-speech)
- [ ] Scan my gym (Gemini vision → equipment detection)

---

## 11. Success Metrics

| Metric | Target |
|---|---|
| Day 7 retention | > 60% |
| Average streak length | > 5 days |
| Workouts logged per active user/week | > 3 |
| Companion messages per session | > 2 |
| Plan completion rate | > 70% |
