import { createClient } from 'npm:@supabase/supabase-js';
import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { generateJSON } from '../_shared/gemini.ts';
import { searchMemories } from '../_shared/memory.ts';
import type { AgentRequest, AgentResponse, IntentType, Memory } from '../_shared/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['onboarding', 'modify_plan', 'modify_today', 'check_progress', 'general_chat'],
    },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  },
  required: ['intent', 'confidence', 'reasoning'],
};

async function detectIntent(
  message: string,
  memories: Memory[],
  isOnboardingComplete: boolean,
): Promise<IntentType> {
  if (!isOnboardingComplete) return 'onboarding';

  const memoryContext = memories.slice(0, 3).map((m) => m.content).join('\n');

  const systemPrompt = `You are an intent classifier for a fitness app AI assistant.
Classify the user's message into one of these intents:
- onboarding: user needs to set up their profile
- modify_plan: user wants to change their weekly workout schedule
- modify_today: user wants to change or adapt today's specific workout
- check_progress: user wants to see their progress, stats, streaks, or goal trajectory
- general_chat: general fitness questions, motivation, explanations, or anything else

Recent user context:
${memoryContext || 'No prior context.'}

Return JSON with: intent, confidence (0-1), reasoning.`;

  try {
    const result = await generateJSON<{ intent: IntentType; confidence: number; reasoning: string }>(
      systemPrompt,
      `User message: "${message}"`,
      INTENT_SCHEMA,
    );
    return result.intent;
  } catch {
    return 'general_chat';
  }
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

    // Fetch profile and check for an existing plan (handles legacy users without onboarding_complete flag)
    const [{ data: profile }, { count: planCount }] = await Promise.all([
      supabase.from('profiles').select('onboarding_complete, goal').eq('id', userId).single(),
      supabase.from('workout_plans').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    // A user is effectively onboarded if the flag is set OR they already have a goal + a plan
    const isOnboardingComplete =
      profile?.onboarding_complete === true ||
      (!!profile?.goal && (planCount ?? 0) > 0);

    // Retrieve relevant memories for intent detection
    const memories = await searchMemories(userId, message, 3).catch(() => []);

    // Detect intent
    const rawIntent = await detectIntent(message, memories, isOnboardingComplete);

    // Safety: never route to onboarding if the user already completed it
    const intent = (rawIntent === 'onboarding' && isOnboardingComplete) ? 'general_chat' : rawIntent;

    console.log(`[orchestrator] userId=${userId} intent=${intent} message="${message.slice(0, 80)}"`);

    // Route to the right specialist agent
    let agentName: string;
    switch (intent) {
      case 'onboarding':
        agentName = 'agent-onboarding';
        break;
      case 'modify_plan':
        agentName = 'agent-plan';
        break;
      case 'modify_today':
        agentName = 'agent-daily';
        break;
      case 'check_progress':
        // Progress agent (Phase 3) — fall through to companion for now
        agentName = 'agent-companion';
        break;
      case 'general_chat':
      default:
        agentName = 'agent-companion';
        break;
    }

    const payload: AgentRequest = { userId, message, context };
    const agentResponse = await routeToAgent(agentName, payload);

    // Attach routing metadata
    return new Response(
      JSON.stringify({
        ...agentResponse,
        _meta: { intent, routedTo: agentName },
      }),
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
