import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { embedAndStore, searchMemories, getRecentMemories, summariseMessages } from '../_shared/memory.ts';
import type { AgentRequest, AgentResponse, MemoryType } from '../_shared/types.ts';

Deno.serve(async (req) => {
  const corsResult = handleCors(req);
  if (corsResult) return corsResult;

  try {
    const body = await req.json();
    const { action, userId, content, type, metadata, query, limit, messages } = body;

    switch (action) {
      case 'embed_and_store': {
        const id = await embedAndStore(userId, content, type as MemoryType, metadata ?? {});
        return new Response(JSON.stringify({ success: !!id, id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'search_memories': {
        const memories = await searchMemories(userId, query, limit ?? 5);
        return new Response(JSON.stringify({ memories }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_recent': {
        const memories = await getRecentMemories(userId, limit ?? 10, type as MemoryType | undefined);
        return new Response(JSON.stringify({ memories }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'summarise_session': {
        const summary = summariseMessages(messages ?? []);
        // Store summary as a 'chat' memory
        const id = await embedAndStore(userId, summary, 'chat', { summarised: true });
        return new Response(JSON.stringify({ success: !!id, summary }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (err) {
    console.error('agent-memory error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
