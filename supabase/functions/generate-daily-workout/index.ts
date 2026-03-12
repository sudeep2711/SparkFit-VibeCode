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
    const { profile, chatPreferences } = await req.json();

    console.log("Received profile:", profile);
    console.log("Received prefs:", chatPreferences);

    if (!profile || !chatPreferences) {
      throw new Error("Invalid profile or preferences provided.");
    }

    const SYSTEM_PROMPT = `
You are an expert personal trainer. 
The user was scheduled for a workout today, but they requested a change via a pre-workout chat.
Here is their long-term profile:
Goal: ${profile.goal}
Fitness Level: ${profile.fitness_level}

And here are their preferences dynamically chosen just now for TODAY's replaced workout:
Goal for today: ${chatPreferences.goal}
Available time: ${chatPreferences.time}
Equipment available: ${chatPreferences.equipment}
User Notes: ${chatPreferences.notes || 'None'}

Generate a single day workout plan (just for Today) that perfectly matches these new constraints.
Output the plan in pure JSON format only (no markdown blocks, no conversational text).
Do not include \`\`\`json\`\`\`.

The JSON must adhere strictly to this format (a SINGLE daily plan object, NOT an array of weeks):
{
  "day": "Today",
  "focus": "String description of the workout focus (e.g. Quick HIIT, Express Dumbbell Strength)",
  "exercises": [
    { 
        "name": "Exercise Name", 
        "type": "strength | cardio | interval | calisthenics | isometric",
        "sets": number (optional, for strength/calisthenics/isometric), 
        "reps": number (optional, for strength/calisthenics),
        "estimated_time_secs": number (total active time for all sets, realistic for the movement),
        "estimated_rest_time_secs": number (total rest time for all sets),
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
`;

    console.log("Calling Gemini...");
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: SYSTEM_PROMPT,
      config: {
        responseMimeType: "application/json",
        // We don't enforce schema here for flexibility, but we prompt heavily for JSON structure
      }
    });

    const text = response.text;
    console.log("RAW GEMINI TEXT:", text);

    let parsedPlan;
    try {
      // Sometimes Gemini wraps in ```json ... ``` even when told not to.
      const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedPlan = JSON.parse(cleanedText);
    } catch (e) {
      console.error("Failed to parse Gemini output:", text);
      // Return a safe fallback rather than crashing the client
      parsedPlan = {
        day: "Generated Workout",
        focus: "General Fitness",
        exercises: [
          {
            name: "Warmup & Stretch",
            type: "calisthenics",
            sets: 1,
            reps: 1,
            estimated_time_secs: 300,
            estimated_rest_time_secs: 0,
            coach_tip: "AI generation failed, please try again."
          }
        ]
      };
    }

    return new Response(JSON.stringify(parsedPlan), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Error generating daily plan:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
