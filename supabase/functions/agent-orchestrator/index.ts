import { createClient } from 'npm:@supabase/supabase-js';
import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { generateJSON } from '../_shared/gemini.ts';
import { searchMemories, embedAndStore } from '../_shared/memory.ts';
import { normalizePlan, findTodayPlan } from '../_shared/utils.ts';
import type { AgentRequest, AgentResponse, Memory, DayPlan, WeekPlan } from '../_shared/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

// Single Gemini call: classify intent AND generate response
const UNIFIED_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['onboarding', 'modify_plan', 'modify_today', 'check_progress', 'general_chat'],
    },
    should_delegate: { type: 'boolean' },
    delegate_to: { type: 'string' },   // 'agent-plan' | 'agent-daily' | 'agent-onboarding'
    response: { type: 'string' },
  },
  required: ['intent', 'should_delegate', 'response'],
};

function buildUnifiedSystemPrompt(
  profile: Record<string, unknown> | null,
  memories: Memory[],
  screen: string,
  todayPlan: DayPlan | null,
  recentLogs: Record<string, unknown>[],
  streak: number,
  recentHistory: { role: string; content: string }[],
): string {
  const memoryContext = memories.length
    ? memories.map((m) => `- ${m.content}`).join('\n')
    : 'No prior memories yet.';

  // Summarise today's workout
  let todayContext = 'No workout planned for today (rest day or plan not set).';
  if (todayPlan) {
    if (todayPlan.is_rest_day) {
      todayContext = `Today (${todayPlan.day}) is a rest day. Focus: ${todayPlan.focus || 'Recovery'}.`;
    } else {
      const exList = (todayPlan.exercises ?? [])
        .map((e: Record<string, unknown>) => `  • ${e.name} — ${e.sets ?? '?'} sets x ${e.reps ?? '?'} reps`)
        .join('\n');
      todayContext = `Today (${todayPlan.day}) — ${todayPlan.focus}:\n${exList || '  (no exercises)'}`;
    }
  }

  // Summarise recent log history
  let logContext = 'No recent workout logs.';
  if (recentLogs.length > 0) {
    const logLines = recentLogs.slice(0, 5).map((log: Record<string, unknown>) => {
      const ld = (log.logged_data as Record<string, unknown>) ?? {};
      const date = log.date as string ?? 'unknown date';
      const isPartial = ld.is_partial ? ' (partial)' : '';
      const exCount = ld.total_exercises ?? 0;
      const sets = ld.actual_volume ?? 0;
      const mins = ld.duration_mins ?? 0;
      const feedback = ld.feedback as string ?? '';
      return `  • ${date}${isPartial}: ${exCount} exercises, ${sets} sets, ${mins} mins — felt "${feedback}"`;
    });
    logContext = `Recent workouts:\n${logLines.join('\n')}`;
  }

  // Format recent chat history as text (generateJSON has no history parameter)
  const historyText = recentHistory.length > 0
    ? recentHistory
        .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n')
    : '';

  return `You are SparkFit's AI companion — warm, motivating, knowledgeable, and deeply personal.
You know the user's history and use it to make every response feel tailored to them specifically.

User profile: ${JSON.stringify(profile ?? {})}
Current screen: ${screen}
Current streak: ${streak} day${streak !== 1 ? 's' : ''}

${todayContext}

${logContext}

Relevant memories from past sessions:
${memoryContext}

${historyText ? `Recent conversation:\n${historyText}\n` : ''}
Guidelines:
- Keep responses concise (2–4 sentences unless detail is truly needed).
- Use the REAL data above — today's exercises, logs, streak — to give specific, grounded answers.
- Reference their history, goals, or past workouts when relevant.
- Celebrate wins. Empathize with struggles.
- Never make up data. If something isn't in the context above, say "I don't have that data yet."
- If they ask "what should I do today?" — refer to Today's workout above specifically.

Intent + Routing Rules:
Classify this message and decide if you can respond directly or must delegate.

Set should_delegate=false and provide a FULL response for:
- general_chat: fitness questions, motivation, explanations, anything conversational
- check_progress: questions about their stats, streak, recent workouts (answer using the data above)

Set should_delegate=true and write a brief 1-sentence handoff in 'response' for:
- modify_plan: user wants to change their weekly schedule (swap days across the week, regenerate the full plan) → set delegate_to="agent-plan"
- modify_today: user wants to change what they do TODAY specifically (e.g. "do legs today", "skip today", "replace today's workout") → set delegate_to="agent-daily". IMPORTANT: if the message contains "today" in the context of wanting a different workout, classify as modify_today even if it references the weekly plan.
- onboarding: user needs profile setup → set delegate_to="agent-onboarding"

Also: if the recent conversation shows a specialist agent asked a yes/no question and the user replied affirmatively ("yes", "sure", "go ahead", "do it"), route to the same specialist agent the prior exchange used.`;
}

async function routeToAgent(
  agentName: string,
  payload: AgentRequest & Record<string, unknown>,
): Promise<AgentResponse> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${agentName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${agentName} error ${res.status}: ${text}`);
  }

  return res.json();
}

Deno.serve(async (req) => {
  const corsResult = handleCors(req);
  if (corsResult) return corsResult;

  try {
    const { userId, message, context } = (await req.json()) as AgentRequest;

    if (!userId || !message) {
      return new Response(JSON.stringify({ error: 'userId and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabaseAdmin();

    // Phase 1: Onboarding check + full profile fetch (single query, reused below)
    const [{ data: profile }, { count: planCount }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('workout_plans').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    const isOnboardingComplete =
      profile?.onboarding_complete === true ||
      (!!profile?.goal && (planCount ?? 0) > 0);

    // Phase 2a: Fast path — not onboarded
    if (!isOnboardingComplete) {
      const agentResponse = await routeToAgent('agent-onboarding', { userId, message, context });
      return new Response(
        JSON.stringify({ ...agentResponse, _meta: { intent: 'onboarding', routedTo: 'agent-onboarding' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Phase 2b: Fast path — explicit confirm_plan_change bypasses classification
    // (prevents "confirm" being misclassified; pendingPlan would bloat Gemini prompt)
    if (context?.action === 'confirm_plan_change') {
      const agentResponse = await routeToAgent('agent-plan', {
        userId,
        message,
        context,
        action: 'confirm_plan_change',
      });
      return new Response(
        JSON.stringify({ ...agentResponse, _meta: { intent: 'modify_plan', routedTo: 'agent-plan' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Phase 3: Fetch all context in parallel (profile already fetched above — skip re-fetch)
    const [
      memories,
      { data: planRow },
      { data: recentLogs },
      { data: streakRow },
      { data: recentHistory },
    ] = await Promise.all([
      searchMemories(userId, message, 5).catch(() => [] as Memory[]),
      supabase
        .from('workout_plans')
        .select('plan_data')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('workout_logs')
        .select('date, logged_data')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(7),
      supabase
        .from('streaks')
        .select('current_streak')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('chat_history')
        .select('role, content')
        .eq('user_id', userId)
        .eq('agent', 'companion')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const plan = planRow ? normalizePlan(planRow.plan_data) : [];
    const todayPlan = plan.length > 0 ? (findTodayPlan(plan) ?? null) : null;
    const currentStreak = (streakRow as Record<string, unknown> | null)?.current_streak as number ?? 0;
    const chronologicalHistory = [...(recentHistory ?? [])].reverse();
    const screen = context?.screen ?? 'unknown';

    // Phase 4: Single Gemini call — classify intent AND generate response
    const systemPrompt = buildUnifiedSystemPrompt(
      profile,
      memories,
      screen,
      todayPlan,
      (recentLogs ?? []) as Record<string, unknown>[],
      currentStreak,
      chronologicalHistory,
    );

    const unified = await generateJSON<{
      intent: string;
      should_delegate: boolean;
      delegate_to?: string;
      response: string;
    }>(systemPrompt, `User message: "${message}"`, UNIFIED_SCHEMA);

    console.log(`[orchestrator] userId=${userId} intent=${unified.intent} delegate=${unified.should_delegate} screen=${screen}`);

    // Phase 5a: No delegation — respond directly (general_chat, check_progress)
    if (!unified.should_delegate) {
      // Persist to chat_history with agent='companion' for history continuity
      await supabase.from('chat_history').insert([
        { user_id: userId, role: 'user', content: message, agent: 'companion' },
        { user_id: userId, role: 'model', content: unified.response, agent: 'companion' },
      ]);

      // Fire-and-forget memory storage
      embedAndStore(
        userId,
        `User said: "${message}" | AI responded: "${unified.response.slice(0, 200)}"`,
        'chat',
        { screen, timestamp: new Date().toISOString() },
      ).catch(console.error);

      return new Response(
        JSON.stringify({
          response: unified.response,
          agent: 'orchestrator',
          actions: [],
          _meta: { intent: unified.intent, routedTo: 'orchestrator' },
        } as AgentResponse & { _meta: unknown }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Phase 5b: Delegate to specialist agent
    const agentName = unified.delegate_to ?? 'agent-companion';
    const payload: AgentRequest = { userId, message, context };
    const agentResponse = await routeToAgent(agentName, payload);

    // Persist delegated exchange so the next turn has context (prevents "yes" misclassification)
    supabase.from('chat_history').insert([
      { user_id: userId, role: 'user', content: message, agent: 'companion' },
      { user_id: userId, role: 'model', content: agentResponse.response, agent: 'companion' },
    ]).then(() => {}).catch(console.error);

    return new Response(
      JSON.stringify({ ...agentResponse, _meta: { intent: unified.intent, routedTo: agentName } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('agent-orchestrator error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
