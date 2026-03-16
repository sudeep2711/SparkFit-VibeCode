import { createClient } from 'npm:@supabase/supabase-js';
import { embedText } from './gemini.ts';
import type { Memory, MemoryType } from './types.ts';

function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

/**
 * Embed text and store it as a memory for the given user.
 */
export async function embedAndStore(
  userId: string,
  content: string,
  type: MemoryType,
  metadata: Record<string, unknown> = {},
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const embedding = await embedText(content);

  const { data, error } = await supabase
    .from('memories')
    .insert({
      user_id: userId,
      content,
      embedding: `[${embedding.join(',')}]`,
      type,
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    console.error('embedAndStore error:', error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Search memories by vector similarity for a given user.
 */
export async function searchMemories(
  userId: string,
  query: string,
  limit = 5,
  typeFilter?: MemoryType,
): Promise<Memory[]> {
  const supabase = getSupabaseAdmin();
  const embedding = await embedText(query);

  let rpcQuery = supabase.rpc('match_memories', {
    query_embedding: `[${embedding.join(',')}]`,
    match_user_id: userId,
    match_count: limit,
  });

  const { data, error } = await rpcQuery;

  if (error) {
    console.error('searchMemories error:', error.message);
    return [];
  }

  let results = (data ?? []) as Memory[];
  if (typeFilter) {
    results = results.filter((m) => m.type === typeFilter);
  }
  return results;
}

/**
 * Fetch the N most recent memories for a user (no vector search, just recency).
 */
export async function getRecentMemories(
  userId: string,
  limit = 10,
  typeFilter?: MemoryType,
): Promise<Memory[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('memories')
    .select('id, user_id, content, type, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (typeFilter) {
    query = query.eq('type', typeFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('getRecentMemories error:', error.message);
    return [];
  }
  return (data ?? []) as Memory[];
}

/**
 * Summarise a set of chat messages into a single compact text for storage.
 */
export function summariseMessages(
  messages: { role: string; content: string }[],
): string {
  return messages
    .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n');
}
