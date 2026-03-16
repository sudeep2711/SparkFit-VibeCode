import { createClient } from '@supabase/supabase-js';

// Connected to the live Supabase Cloud Project: "sparkfit"
const supabaseUrl = 'https://pojshuemshcdllrqkhog.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanNodWVtc2hjZGxscnFraG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MjU5MDAsImV4cCI6MjA4ODUwMTkwMH0.4mZa4BK0ff2LbpTovuDZy2stW4GwNmrdpAbdii6Ghcs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Agent Types ─────────────────────────────────────────────────────────────

export interface AgentContext {
  screen?: string;
  exerciseName?: string;
  planId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface AgentAction {
  type: string;
  payload: Record<string, unknown>;
}

export interface AgentResponse {
  response: string;
  actions?: AgentAction[];
  agent?: string;
  _meta?: { intent: string; routedTo: string };
  data?: unknown;
}

// ─── Single entry point for all AI calls ─────────────────────────────────────

/**
 * Send a message to the AI orchestrator.
 * All AI interactions in the app should go through this function.
 *
 * @param message  The user's message
 * @param context  Optional context about the current screen / session
 */
export async function invokeAgent(
  message: string,
  context?: AgentContext,
): Promise<AgentResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('agent-orchestrator', {
    body: { userId: user.id, message, context: context ?? {} },
  });

  if (error) throw error;
  return data as AgentResponse;
}
