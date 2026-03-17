import { createClient } from 'npm:@supabase/supabase-js';
import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { generateJSON, generateText } from '../_shared/gemini.ts';
import { embedAndStore } from '../_shared/memory.ts';
import { normalizePlan } from '../_shared/utils.ts';
import type { AgentRequest, AgentResponse, WeekPlan, DayPlan } from '../_shared/types.ts';

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

const EXERCISE_SCHEMA = {
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

const WEEK_PLAN_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      day: { type: 'string' },
      focus: { type: 'string' },
      estimated_total_time_mins: { type: 'integer' },
      is_rest_day: { type: 'boolean' },
      exercises: { type: 'array', items: EXERCISE_SCHEMA },
    },
    required: ['day', 'focus', 'estimated_total_time_mins', 'exercises'],
  },
};

async function generateWeeklyPlan(profile: Record<string, unknown>): Promise<WeekPlan> {
  const systemPrompt = `You are a professional fitness coach. Generate a balanced 7-day workout plan.
Return a JSON array of 7 day objects. Rest days have is_rest_day: true and an empty exercises array.
Tailor exercises to the user's goal, fitness level, and equipment.
Each exercise must include a coach_tip — a short, encouraging, technique-focused tip.`;

  const userMessage = `Create a 7-day plan for:
- Goal: ${profile.goal}
- Fitness level: ${profile.fitness_level}
- Days per week: ${profile.workout_days_per_week}
- Equipment: ${profile.equipment}`;

  return generateJSON<WeekPlan>(systemPrompt, userMessage, WEEK_PLAN_SCHEMA);
}

async function swapRestDay(
  plan: WeekPlan,
  fromDayIndex: number,
  toDayIndex: number,
): Promise<WeekPlan> {
  const updated = [...plan];
  const temp = updated[fromDayIndex];
  updated[fromDayIndex] = updated[toDayIndex];
  updated[toDayIndex] = temp;
  // Reassign day names
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return updated.map((d, i) => ({ ...d, day: dayNames[i] ?? d.day }));
}

Deno.serve(async (req) => {
  const corsResult = handleCors(req);
  if (corsResult) return corsResult;

  try {
    const body = await req.json();
    const { userId, message, context, action } = body;
    const supabase = getSupabaseAdmin();

    // Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Confirm a previously proposed plan change (write to DB)
    if (action === 'confirm_plan_change') {
      const pendingPlan = context?.pendingPlan as WeekPlan | undefined;
      if (!pendingPlan) {
        return new Response(
          JSON.stringify({ response: 'No pending plan to confirm.', agent: 'plan', actions: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const { data: existingPlan } = await supabase
        .from('workout_plans')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existingPlan) {
        await supabase.from('workout_plans').update({ plan_data: pendingPlan }).eq('id', existingPlan.id);
        return new Response(
          JSON.stringify({
            response: "Done! Your updated plan has been saved.",
            actions: [{ type: 'update_plan', payload: { planId: existingPlan.id, plan: pendingPlan } }],
            agent: 'plan',
          } as AgentResponse),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } else {
        return new Response(
          JSON.stringify({ response: "Couldn't find your plan to update.", agent: 'plan', actions: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Handle explicit actions
    if (action === 'generate_weekly_plan') {
      const plan = await generateWeeklyPlan(profile);
      const { data: planRow, error } = await supabase
        .from('workout_plans')
        .insert({ user_id: userId, plan_data: plan, status: 'active' })
        .select('id')
        .single();

      if (error) throw error;

      // Store plan summary as a memory so companion can reference it
      const workoutDays = plan.filter((d: DayPlan) => !d.is_rest_day);
      const planSummary = `User received a 7-day workout plan. Workout days: ${workoutDays.map((d: DayPlan) => `${d.day} (${d.focus})`).join(', ')}. Goal: ${profile.goal}, level: ${profile.fitness_level}.`;
      embedAndStore(userId, planSummary, 'profile', { planId: planRow.id }).catch(console.error);

      return new Response(
        JSON.stringify({
          response: "I've created your personalized 7-day workout plan! Head to the Plan tab to see it.",
          actions: [{ type: 'update_plan', payload: { planId: planRow.id, plan } }],
          agent: 'plan',
        } as AgentResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch current plan (don't filter by status — legacy plans don't have it set)
    const { data: planRow } = await supabase
      .from('workout_plans')
      .select('id, plan_data')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (action === 'swap_rest_day' && planRow) {
      const { fromDayIndex, toDayIndex } = body;
      const updatedPlan = await swapRestDay(planRow.plan_data, fromDayIndex, toDayIndex);
      await supabase
        .from('workout_plans')
        .update({ plan_data: updatedPlan })
        .eq('id', planRow.id);

      return new Response(
        JSON.stringify({
          response: 'Done! I moved your rest day. Your updated schedule is ready.',
          actions: [{ type: 'update_plan', payload: { planId: planRow.id, plan: updatedPlan } }],
          agent: 'plan',
        } as AgentResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // No plan yet — can't modify
    if (!planRow) {
      return new Response(
        JSON.stringify({ response: "You don't have a workout plan yet. Complete onboarding first and I'll generate one for you!", agent: 'plan', actions: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const currentPlan: WeekPlan = normalizePlan(planRow.plan_data);
    const dayNames = currentPlan.map((d) => d.day);

    // Use Gemini JSON mode to parse what the user wants to do
    const intentSchema = {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['swap_days', 'regenerate', 'chat'] },
        day_a: { type: 'string' },
        day_b: { type: 'string' },
        response: { type: 'string' },
      },
      required: ['action', 'response'],
    };

    const intentPrompt = `You are a fitness planning agent. The user wants to modify their workout plan.

Current plan days: ${dayNames.join(', ')}
Plan: ${JSON.stringify(currentPlan.map((d) => ({ day: d.day, focus: d.focus, is_rest_day: d.is_rest_day })))}

Determine what the user wants to do:
- swap_days: swap/exchange two specific days (fill day_a and day_b with the exact day names from the plan)
- regenerate: build a completely new plan
- chat: question or general discussion, no changes needed

Return JSON with action, day_a, day_b (if swap_days), and response (your reply to the user).`;

    const intent = await generateJSON<{ action: string; day_a?: string; day_b?: string; response: string }>(
      intentPrompt,
      message ?? '',
      intentSchema,
    );

    // Execute swap_days
    if (intent.action === 'swap_days' && intent.day_a && intent.day_b) {
      const idxA = currentPlan.findIndex((d) => d.day.toLowerCase() === intent.day_a!.toLowerCase());
      const idxB = currentPlan.findIndex((d) => d.day.toLowerCase() === intent.day_b!.toLowerCase());

      if (idxA === -1 || idxB === -1) {
        return new Response(
          JSON.stringify({ response: `I couldn't find those days in your plan. Your plan has: ${dayNames.join(', ')}.`, agent: 'plan', actions: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const updatedPlan = [...currentPlan];
      // Swap workout content but keep day names in place
      const contentA = { focus: updatedPlan[idxA].focus, exercises: updatedPlan[idxA].exercises, estimated_total_time_mins: updatedPlan[idxA].estimated_total_time_mins, is_rest_day: updatedPlan[idxA].is_rest_day };
      const contentB = { focus: updatedPlan[idxB].focus, exercises: updatedPlan[idxB].exercises, estimated_total_time_mins: updatedPlan[idxB].estimated_total_time_mins, is_rest_day: updatedPlan[idxB].is_rest_day };
      updatedPlan[idxA] = { ...updatedPlan[idxA], ...contentB };
      updatedPlan[idxB] = { ...updatedPlan[idxB], ...contentA };

      // Propose the change — do NOT write to DB yet; user must confirm
      const changeSummary = `I'll swap ${intent.day_a} and ${intent.day_b}'s workouts. ${intent.response}`;
      return new Response(
        JSON.stringify({
          response: changeSummary,
          actions: [{
            type: 'propose_plan_change',
            payload: { proposed_plan: updatedPlan, change_summary: changeSummary, plan_id: planRow.id },
          }],
          agent: 'plan',
        } as AgentResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Execute regenerate
    if (intent.action === 'regenerate') {
      const newPlan = await generateWeeklyPlan(profile);
      // Propose the new plan — do NOT write to DB yet; user must confirm
      const changeSummary = `I've generated a brand-new 7-day plan for you. ${intent.response}`;
      return new Response(
        JSON.stringify({
          response: changeSummary,
          actions: [{
            type: 'propose_plan_change',
            payload: { proposed_plan: newPlan, change_summary: changeSummary, plan_id: planRow.id },
          }],
          agent: 'plan',
        } as AgentResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Chat — no changes
    return new Response(
      JSON.stringify({ response: intent.response, agent: 'plan', actions: [] } as AgentResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('agent-plan error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
