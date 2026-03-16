import { createClient } from 'npm:@supabase/supabase-js';
import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { generateText } from '../_shared/gemini.ts';
import { searchMemories, embedAndStore } from '../_shared/memory.ts';
import type { AgentRequest, AgentResponse, Memory, DayPlan } from '../_shared/types.ts';
import { normalizePlan, findTodayPlan } from '../_shared/utils.ts';

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function buildSystemPrompt(
  profile: Record<string, unknown> | null,
  memories: Memory[],
  screen: string,
  todayPlan: DayPlan | null,
  recentLogs: Record<string, unknown>[],
  streak: number,
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

  return `You are SparkFit's AI companion — warm, motivating, knowledgeable, and deeply personal.
You know the user's history and use it to make every response feel tailored to them specifically.

User profile: ${JSON.stringify(profile ?? {})}
Current screen: ${screen}
Current streak: ${streak} day${streak !== 1 ? 's' : ''}

${todayContext}

${logContext}

Relevant memories from past sessions:
${memoryContext}

Guidelines:
- Keep responses concise (2–4 sentences unless detail is truly needed).
- Use the REAL data above — today's exercises, logs, streak — to give specific, grounded answers.
- Reference their history, goals, or past workouts when relevant.
- Celebrate wins. Empathize with struggles.
- If they ask to modify a workout, tell them you're routing to the plan agent — don't invent changes.
- Never make up data. If something isn't in the context above, say "I don't have that data yet."
- If they ask "what should I do today?" — refer to Today's workout above specifically.`;
}

Deno.serve(async (req) => {
  const corsResult = handleCors(req);
  if (corsResult) return corsResult;

  try {
    const { userId, message, context } = (await req.json()) as AgentRequest;
    const supabase = getSupabaseAdmin();
    const screen = context?.screen ?? 'unknown';

    // Fetch profile, memories, plan, logs, streak, and chat history in parallel
    const [
      { data: profile },
      memories,
      { data: planRow },
      { data: recentLogs },
      { data: streakRow },
      { data: recentHistory },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      searchMemories(userId, message, 5),
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

    const geminiHistory = (recentHistory ?? [])
      .reverse()
      .map((m) => ({
        role: m.role as 'user' | 'model',
        parts: [{ text: m.content }],
      }));

    const systemPrompt = buildSystemPrompt(
      profile,
      memories,
      screen,
      todayPlan,
      (recentLogs ?? []) as Record<string, unknown>[],
      currentStreak,
    );
    const response = await generateText(systemPrompt, message, geminiHistory);

    // Persist interaction to chat_history
    await supabase.from('chat_history').insert([
      { user_id: userId, role: 'user', content: message, agent: 'companion' },
      { user_id: userId, role: 'model', content: response, agent: 'companion' },
    ]);

    // Store this interaction as a memory (fire-and-forget)
    embedAndStore(
      userId,
      `User said: "${message}" | Companion responded: "${response.slice(0, 200)}"`,
      'chat',
      { screen, timestamp: new Date().toISOString() },
    ).catch(console.error);

    return new Response(
      JSON.stringify({ response, agent: 'companion', actions: [] } as AgentResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('agent-companion error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
