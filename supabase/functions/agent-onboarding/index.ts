import { createClient } from 'npm:@supabase/supabase-js';
import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { generateText } from '../_shared/gemini.ts';
import { embedAndStore } from '../_shared/memory.ts';
import type { AgentRequest, AgentResponse, ChatMessage } from '../_shared/types.ts';

const SYSTEM_PROMPT = `You are SparkFit's onboarding companion — warm, encouraging, and concise.

Your job is to gather 4 pieces of information from the user, one at a time:
1. Their fitness goal (e.g. lose weight, build muscle, improve endurance, stay active)
2. Their current fitness level (beginner, intermediate, advanced)
3. How many days per week they want to work out (1–7)
4. What equipment they have access to (gym, home with equipment, bodyweight only, specific items)

Rules:
- Ask ONE question at a time. Never stack multiple questions.
- Be conversational, not clinical. Match their energy.
- Acknowledge what they share before moving to the next question.
- Once you have ALL 4 pieces, output a JSON block wrapped in <profile></profile> tags with this exact structure:
  <profile>{"goal": "...", "fitness_level": "...", "workout_days_per_week": N, "equipment": "..."}</profile>
- After the profile tag, add a single encouraging sentence to close the conversation.
- Never output the profile tag until you have all 4 pieces confirmed.`;

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

Deno.serve(async (req) => {
  const corsResult = handleCors(req);
  if (corsResult) return corsResult;

  try {
    const { userId, message, context } = (await req.json()) as AgentRequest;
    const supabase = getSupabaseAdmin();

    // Fast path: client already collected profile data (AIOnboardingChatScreen)
    if (context?.profileData) {
      const profileData = context.profileData as Record<string, unknown>;
      const actions: AgentResponse['actions'] = [];

      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: userId,
        goal: profileData.goal,
        fitness_level: profileData.fitness_level,
        workout_days_per_week: profileData.workout_days_per_week,
        equipment: profileData.equipment,
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      });

      if (upsertError) throw new Error(`Profile save failed: ${upsertError.message}`);

      // Fire-and-forget — don't block plan generation on embedding
      embedAndStore(
        userId,
        `User profile: goal=${profileData.goal}, fitness_level=${profileData.fitness_level}, days_per_week=${profileData.workout_days_per_week}, equipment=${profileData.equipment}`,
        'profile',
        profileData,
      ).catch((e) => console.error('embedAndStore error (non-fatal):', e));

      actions.push({ type: 'save_profile', payload: profileData as Record<string, unknown> });

      const planRes = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            userId,
            message: 'Generate my initial workout plan based on my profile.',
            context: { trigger: 'onboarding_complete' },
            action: 'generate_weekly_plan',
          }),
        },
      );

      if (!planRes.ok) {
        const errText = await planRes.text();
        throw new Error(`Plan generation failed: ${errText}`);
      }

      const planData = await planRes.json();
      if (planData.actions) actions.push(...planData.actions);

      return new Response(
        JSON.stringify({ response: "Your plan is ready! Let's get to work.", actions, agent: 'onboarding' } as AgentResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Conversational path: gather profile via chat
    const { data: history } = await supabase
      .from('chat_history')
      .select('role, content')
      .eq('user_id', userId)
      .eq('agent', 'onboarding')
      .order('created_at', { ascending: true })
      .limit(20);

    const geminiHistory = (history ?? []).map((m) => ({
      role: m.role as 'user' | 'model',
      parts: [{ text: m.content }],
    }));

    const responseText = await generateText(SYSTEM_PROMPT, message, geminiHistory);

    // Save user message + response to chat_history
    await supabase.from('chat_history').insert([
      { user_id: userId, role: 'user', content: message, agent: 'onboarding' },
      { user_id: userId, role: 'model', content: responseText, agent: 'onboarding' },
    ]);

    // Check if profile extraction is complete
    const profileMatch = responseText.match(/<profile>([\s\S]*?)<\/profile>/);
    const actions: AgentResponse['actions'] = [];

    if (profileMatch) {
      try {
        const profileData = JSON.parse(profileMatch[1].trim());

        // Save to profiles table
        await supabase.from('profiles').upsert({
          id: userId,
          goal: profileData.goal,
          fitness_level: profileData.fitness_level,
          workout_days_per_week: profileData.workout_days_per_week,
          equipment: profileData.equipment,
          onboarding_complete: true,
          updated_at: new Date().toISOString(),
        });

        // Store onboarding profile as a memory
        await embedAndStore(
          userId,
          `User profile: goal=${profileData.goal}, fitness_level=${profileData.fitness_level}, days_per_week=${profileData.workout_days_per_week}, equipment=${profileData.equipment}`,
          'profile',
          profileData,
        );

        actions.push({ type: 'save_profile', payload: profileData });

        // Immediately generate the initial workout plan
        const planRes = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-plan`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              userId,
              message: 'Generate my initial workout plan based on my profile.',
              context: { trigger: 'onboarding_complete' },
              action: 'generate_weekly_plan',
            }),
          },
        );
        if (planRes.ok) {
          const planData = await planRes.json();
          if (planData.actions) actions.push(...planData.actions);
        } else {
          console.error('agent-plan call failed:', await planRes.text());
        }
      } catch (parseErr) {
        console.error('Profile parse error:', parseErr);
      }
    }

    // Strip the <profile> tags from the visible response
    const cleanResponse = responseText.replace(/<profile>[\s\S]*?<\/profile>/g, '').trim();

    return new Response(
      JSON.stringify({ response: cleanResponse, actions, agent: 'onboarding' } as AgentResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('agent-onboarding error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
