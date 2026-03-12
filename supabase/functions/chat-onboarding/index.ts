import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { GoogleGenAI } from 'npm:@google/genai';

const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY") });
const MODEL_NAME = 'gemini-2.5-flash';

const COACH_SYSTEM_PROMPT = `
You are SparkFit's AI Fitness Coach.
Your goal is to onboard a user naturally through a conversation.
Ask short, encouraging questions one at a time. Do not overwhelm them with a form to fill out.

We need to learn:
1. Their main fitness goal (muscle gain, weight loss, mobility etc).
2. Their current fitness level (beginner/intermediate/advanced).
3. How many days a week they can workout.
4. What equipment they have access to.

If you DO NOT have all 4 pieces of information, continue asking questions naturally.
If you HAVE gathered all 4 pieces of information, smoothly thank them and then output a specific JSON payload surrounded by <profile> and </profile> tags.
The JSON must have this exact structure:
<profile>
{
  "goal": "string",
  "fitness_level": "string",
  "workout_days_per_week": number,
  "equipment": "string"
}
</profile>

Keep your tone energetic, supportive, and very concise.
`;

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
    const { history, userMessage } = await req.json();

    const responseStream = await ai.models.generateContentStream({
      model: MODEL_NAME,
      contents: [...history, { role: 'user', parts: [{ text: userMessage }] }],
      config: {
        systemInstruction: COACH_SYSTEM_PROMPT,
      }
    });

    // Create a readable stream to pipe back to the React Native client
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of responseStream) {
          controller.enqueue(new TextEncoder().encode(chunk.text));
        }
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain",
        "Transfer-Encoding": "chunked",
      },
    });

  } catch (err: any) {
    console.error(err);
    return new Response(String(err?.message ?? err), { status: 500, headers: corsHeaders });
  }
});
