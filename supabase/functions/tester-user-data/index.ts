import { createClient } from 'npm:@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { userId } = await req.json();
    if (!userId) return new Response(JSON.stringify({ error: 'userId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [
      { data: profile },
      { data: plans },
      { count: memoryCount },
      { data: recentChat },
      { data: logs },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('workout_plans').select('id, status, created_at, plan_data').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
      supabase.from('memories').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('chat_history').select('role, content, agent, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(6),
      supabase.from('workout_logs').select('id, date').eq('user_id', userId).order('date', { ascending: false }).limit(5),
    ]);

    const activePlan = plans?.[0] ?? null;
    const planSummary = activePlan ? {
      id: activePlan.id,
      status: activePlan.status,
      created_at: activePlan.created_at,
      days: (activePlan.plan_data as any[])?.map((d: any) => ({
        day: d.day,
        focus: d.focus,
        is_rest_day: d.is_rest_day ?? false,
        estimated_total_time_mins: d.estimated_total_time_mins ?? 0,
        exercises: (d.exercises ?? []).map((ex: any) => ({
          name: ex.name,
          type: ex.type,
          sets: ex.sets,
          reps: ex.reps,
          estimated_time_secs: ex.estimated_time_secs,
          coach_tip: ex.coach_tip,
        })),
      })),
    } : null;

    return new Response(JSON.stringify({
      profile,
      plan: planSummary,
      memory_count: memoryCount ?? 0,
      recent_chat: (recentChat ?? []).reverse(),
      recent_logs: logs ?? [],
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
