import { createClient } from 'npm:@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // List all auth users (service role only)
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;

    // Fetch profiles for goal/fitness_level to enrich the display label
    const userIds = users.map((u) => u.id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, goal, fitness_level, onboarding_complete')
      .in('id', userIds);

    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

    const result = users.map((u) => {
      const profile = profileMap[u.id];
      const label = [
        u.email ?? u.id.slice(0, 8),
        profile?.goal ? `· ${profile.goal}` : '',
        profile?.fitness_level ? `(${profile.fitness_level})` : '',
      ].filter(Boolean).join(' ');

      return {
        id: u.id,
        email: u.email ?? null,
        label,
        onboarding_complete: profile?.onboarding_complete ?? false,
        created_at: u.created_at,
      };
    });

    // Sort newest first
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return new Response(JSON.stringify({ users: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
