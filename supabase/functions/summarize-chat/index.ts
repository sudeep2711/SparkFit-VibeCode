import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { generateText } from '../_shared/gemini.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ summary: 'New conversation' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Build a condensed transcript for Gemini
    const transcript = messages
      .slice(0, 20) // limit to first 20 messages to keep it cheap
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join('\n');

    const summary = await generateText(
      'You generate ultra-short chat titles. Output ONLY a 3-6 word title summarizing the conversation topic. No quotes, no punctuation at the end, no explanation.',
      transcript,
    );

    return new Response(
      JSON.stringify({ summary: summary.trim() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('summarize-chat error:', err);
    return new Response(
      JSON.stringify({ summary: 'Chat session' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  }
});
