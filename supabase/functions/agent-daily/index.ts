import { createClient } from 'npm:@supabase/supabase-js';
import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { generateJSON, generateText } from '../_shared/gemini.ts';
import type { AgentRequest, AgentResponse, DayPlan, Exercise } from '../_shared/types.ts';
import { normalizePlan, findTodayPlan } from '../_shared/utils.ts';

const EXERCISEDB_BASE = 'https://exercisedb.p.rapidapi.com';

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function getTodayDayName(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

async function fetchExerciseGif(exerciseName: string): Promise<string | null> {
  const apiKey = Deno.env.get('EXERCISEDB_API_KEY');
  if (!apiKey) return null;

  try {
    const encoded = encodeURIComponent(exerciseName.toLowerCase());
    const res = await fetch(`${EXERCISEDB_BASE}/exercises/name/${encoded}?limit=1`, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0]?.gifUrl ?? null;
  } catch {
    return null;
  }
}

async function swapExercise(
  exercise: Exercise,
  reason: string,
  profile: Record<string, unknown>,
): Promise<Exercise> {
  const systemPrompt = `You are a fitness coach. Suggest a single substitute exercise.
Return JSON matching the exact exercise schema.`;

  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      type: { type: 'string', enum: ['strength', 'cardio', 'interval', 'calisthenics', 'isometric'] },
      sets: { type: 'integer' },
      reps: { type: 'string' },
      estimated_time_secs: { type: 'integer' },
      estimated_rest_time_secs: { type: 'integer' },
      coach_tip: { type: 'string' },
    },
    required: ['name', 'type', 'sets', 'reps', 'estimated_time_secs', 'estimated_rest_time_secs', 'coach_tip'],
  };

  const userMessage = `Replace "${exercise.name}" because: ${reason}.
User profile: goal=${profile.goal}, level=${profile.fitness_level}, equipment=${profile.equipment}.
Keep a similar muscle group and difficulty. Ensure it works with available equipment.`;

  return generateJSON<Exercise>(systemPrompt, userMessage, schema);
}

async function trimWorkout(dayPlan: DayPlan, targetMinutes: number): Promise<DayPlan> {
  if (!dayPlan.exercises.length) return dayPlan;

  // Greedily pick exercises until we hit the time budget
  const budget = targetMinutes * 60;
  let elapsed = 0;
  const selected: Exercise[] = [];

  for (const ex of dayPlan.exercises) {
    const exTime = ex.estimated_time_secs * ex.sets + ex.estimated_rest_time_secs * (ex.sets - 1);
    if (elapsed + exTime > budget) break;
    selected.push(ex);
    elapsed += exTime;
  }

  return {
    ...dayPlan,
    exercises: selected.length ? selected : [dayPlan.exercises[0]],
    estimated_total_time_mins: Math.round(elapsed / 60),
  };
}

Deno.serve(async (req) => {
  const corsResult = handleCors(req);
  if (corsResult) return corsResult;

  try {
    const body = await req.json();
    const { userId, message, context, action } = body;
    const supabase = getSupabaseAdmin();

    // Fetch profile + active plan
    const [{ data: profile }, { data: planRow }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      // Don't filter by status — legacy plans don't have this column set
      supabase
        .from('workout_plans')
        .select('id, plan_data')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    if (!planRow) {
      return new Response(
        JSON.stringify({ response: "You don't have an active plan yet. Let's create one!", agent: 'daily', actions: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const plan: DayPlan[] = normalizePlan(planRow.plan_data);
    const todayName = getTodayDayName();
    const todayPlan = findTodayPlan(plan);

    if (action === 'get_todays_workout') {
      // Optionally enrich exercises with GIF URLs
      const enriched = await Promise.all(
        (todayPlan?.exercises ?? []).map(async (ex) => ({
          ...ex,
          gifUrl: await fetchExerciseGif(ex.name),
        })),
      );
      return new Response(
        JSON.stringify({
          response: todayPlan?.is_rest_day
            ? "Today's a rest day — recovery is part of training!"
            : `Today is ${todayPlan?.focus ?? 'your workout'}. You've got ${enriched.length} exercises lined up.`,
          actions: [{ type: 'navigate_to_screen', payload: { screen: 'WorkoutActive' } }],
          agent: 'daily',
          data: { ...todayPlan, exercises: enriched },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'swap_exercise' && body.exerciseName) {
      const targetIndex = (todayPlan?.exercises ?? []).findIndex(
        (e) => e.name.toLowerCase() === body.exerciseName.toLowerCase(),
      );
      if (targetIndex === -1 || !todayPlan) {
        return new Response(
          JSON.stringify({ response: "I couldn't find that exercise in today's workout.", agent: 'daily', actions: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const swapped = await swapExercise(todayPlan.exercises[targetIndex], body.reason ?? 'user request', profile ?? {});
      todayPlan.exercises[targetIndex] = swapped;

      // Persist the updated plan
      await supabase.from('workout_plans').update({ plan_data: plan }).eq('id', planRow.id);

      return new Response(
        JSON.stringify({
          response: `Swapped! I replaced it with **${swapped.name}** — ${swapped.coach_tip}`,
          actions: [{ type: 'swap_exercise', payload: { exerciseName: swapped.name } }],
          agent: 'daily',
        } as AgentResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'trim_workout' && body.targetMinutes && todayPlan) {
      const trimmed = await trimWorkout(todayPlan, body.targetMinutes);
      const dayIndex = plan.findIndex((d) => d.day.toLowerCase() === todayName.toLowerCase());
      if (dayIndex !== -1) plan[dayIndex] = trimmed;
      await supabase.from('workout_plans').update({ plan_data: plan }).eq('id', planRow.id);

      return new Response(
        JSON.stringify({
          response: `Got it! I trimmed today's workout to fit in ${body.targetMinutes} minutes — ${trimmed.exercises.length} exercises kept.`,
          actions: [{ type: 'update_plan', payload: { plan } }],
          agent: 'daily',
        } as AgentResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch recent chat history so follow-up messages ("yes", "go ahead") have context
    const { data: recentHistory } = await supabase
      .from('chat_history')
      .select('role, content')
      .eq('user_id', userId)
      .eq('agent', 'companion')
      .order('created_at', { ascending: false })
      .limit(6);

    const historyText = recentHistory && recentHistory.length > 0
      ? [...recentHistory].reverse().map((m: Record<string, unknown>) =>
          `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`
        ).join('\n')
      : '';

    // Intent parsing so agent-daily can act decisively without asking for confirmation
    const intentSchema = {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['generate_today', 'chat'] },
        focus: { type: 'string' }, // requested workout focus, e.g. "Legs & Core"
        response: { type: 'string' },
      },
      required: ['action', 'response'],
    };

    const intentSystemPrompt = `You are SparkFit's daily workout agent.
User profile: ${JSON.stringify(profile)}
Today's workout (${todayName}): ${JSON.stringify(todayPlan)}
${historyText ? `Recent conversation:\n${historyText}\n` : ''}
Determine what the user wants:
- generate_today: user wants to replace today's workout with a different focus (include 'focus' with the muscle group/type they want, e.g. "Legs & Core", "Upper Body", "Cardio"). Also use this if the user said "yes" or "go ahead" following a question about generating a new workout. When action=generate_today, write 'response' as a brief confirmation that you ARE generating it right now (e.g. "On it! Generating your leg day now...") — do NOT ask for confirmation.
- chat: general question about today's workout, motivation, or anything that doesn't require generating a new workout.
Always fill 'response' with your reply to the user.`;

    const intent = await generateJSON<{ action: string; focus?: string; response: string }>(
      intentSystemPrompt,
      message ?? '',
      intentSchema,
    );

    // Generate a new workout for today with the requested focus
    if (intent.action === 'generate_today' && intent.focus) {
      const DAY_EXERCISE_SCHEMA = {
        type: 'object',
        properties: {
          day: { type: 'string' },
          focus: { type: 'string' },
          estimated_total_time_mins: { type: 'integer' },
          is_rest_day: { type: 'boolean' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string', enum: ['strength', 'cardio', 'interval', 'calisthenics', 'isometric'] },
                sets: { type: 'integer' },
                reps: { type: 'string' },
                estimated_time_secs: { type: 'integer' },
                estimated_rest_time_secs: { type: 'integer' },
                coach_tip: { type: 'string' },
              },
              required: ['name', 'type', 'sets', 'reps', 'estimated_time_secs', 'estimated_rest_time_secs', 'coach_tip'],
            },
          },
        },
        required: ['day', 'focus', 'estimated_total_time_mins', 'exercises'],
      };

      const newDay = await generateJSON<DayPlan>(
        `You are a professional fitness coach. Generate a single-day workout session.`,
        `Create a ${intent.focus} workout for ${todayName}. User: goal=${profile?.goal}, level=${profile?.fitness_level}, equipment=${profile?.equipment}. Include 5-7 exercises with coach tips.`,
        DAY_EXERCISE_SCHEMA,
      );

      // Replace today in the plan and save
      const dayIndex = plan.findIndex((d: DayPlan) => d.day.toLowerCase() === todayName.toLowerCase());
      if (dayIndex !== -1) {
        plan[dayIndex] = { ...newDay, day: todayName };
      } else {
        // Fallback: replace first day if today not found (legacy named days)
        plan[0] = { ...newDay, day: plan[0].day };
      }
      await supabase.from('workout_plans').update({ plan_data: plan }).eq('id', planRow.id);

      return new Response(
        JSON.stringify({
          response: `Done! I've switched today to a **${intent.focus}** workout with ${newDay.exercises.length} exercises. ${intent.response}`,
          actions: [{ type: 'update_plan', payload: { planId: planRow.id, plan } }],
          agent: 'daily',
        } as AgentResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // General chat
    return new Response(
      JSON.stringify({ response: intent.response, agent: 'daily', actions: [] } as AgentResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('agent-daily error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
