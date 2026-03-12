import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { GoogleGenAI } from 'npm:@google/genai';

const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY") });
const MODEL_NAME = 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { profile } = await req.json();

    if (!profile || !profile.goal) {
      throw new Error("Invalid profile provided.");
    }

    const SYSTEM_PROMPT = `
You are an expert personal trainer. 
The user has provided their fitness profile:
Goal: ${profile.goal}
Fitness Level: ${profile.fitness_level}
Days per week: ${profile.workout_days_per_week}
Equipment: ${profile.equipment}

Generate a ${profile.workout_days_per_week}-day workout plan.
Output the plan in pure JSON format only (no markdown blocks, no conversational text).
Do not include \`\`\`json\`\`\`.

The JSON must adhere strictly to this format:
{
  "week_plan": [
    {
      "day": "Day 1",
      "focus": "String description of muscle group or cardio",
      "exercises": [
        { 
            "name": "Exercise Name", 
            "type": "strength | cardio | interval | calisthenics | isometric",
            "sets": number (optional, for strength/calisthenics/isometric), 
            "reps": number (optional, for strength/calisthenics),
            "estimated_time_secs": number (total active time for all sets, realistic for the movement and experience level),
            "estimated_rest_time_secs": number (total rest time for all sets, realistic for the movement and experience level),
            "interval_run_secs": number (optional, for interval type),
            "interval_walk_secs": number (optional, for interval type),
            "rounds": number (optional, for interval type),
            "hold_time_secs": number (optional, for isometric type),
            "duration_secs": number (optional, for cardio type),
            "distance_miles": number (optional, for cardio type),
            "coach_tip": "A short, 1-sentence tip on form or motivation specific to this exercise"
        }
      ]
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: SYSTEM_PROMPT,
      config: {
        responseMimeType: "application/json",
      }
    });

    const outputText = response.text || "{}";

    return new Response(outputText, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
