import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { GoogleGenAI } from 'npm:@google/genai';

const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY") });
const MODEL_NAME = 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { profile, plan, history, userMessage } = await req.json();

    const SYSTEM_PROMPT = `
You are the SparkFit AI Coach. Your role is to provide personalized fitness advice, motivation, and answers.
Here is the user's profile context: ${JSON.stringify(profile)}
Here is the user's current workout week plan: ${JSON.stringify(plan)}

Always be concise, supportive, and reference their specific plan or goals when applicable.
Answer their questions directly without excessive conversational fluff, but maintain an energetic and friendly coach persona.
`;

    if (!history) throw new Error("Missing history");
    if (!userMessage) throw new Error("Missing user message");

    const responseStream = await ai.models.generateContentStream({
      model: MODEL_NAME,
      contents: [...history, { role: 'user', parts: [{ text: userMessage }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
      }
    });

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
