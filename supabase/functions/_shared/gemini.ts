import { GoogleGenAI } from 'npm:@google/genai';

const GEMINI_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'gemini-embedding-001';

let _client: GoogleGenAI | null = null;
let _embeddingClient: GoogleGenAI | null = null;

// Generation client — uses v1beta (required for gemini-2.5-flash)
function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

// Embedding client — uses v1 stable (required for text-embedding-004)
function getEmbeddingClient(): GoogleGenAI {
  if (!_embeddingClient) {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    _embeddingClient = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1' } });
  }
  return _embeddingClient;
}

/**
 * Generate a text response from Gemini 2.5 Flash.
 */
export async function generateText(
  systemPrompt: string,
  userMessage: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [],
): Promise<string> {
  const client = getClient();
  const chat = client.chats.create({
    model: GEMINI_MODEL,
    config: { systemInstruction: systemPrompt },
    history,
  });
  const result = await chat.sendMessage({ message: userMessage });
  return result.text ?? '';
}

/**
 * Generate a structured JSON response from Gemini 2.5 Flash.
 */
export async function generateJSON<T>(
  systemPrompt: string,
  userMessage: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const client = getClient();
  const result = await client.models.generateContent({
    model: GEMINI_MODEL,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  });
  const text = result.text ?? '{}';
  return JSON.parse(text) as T;
}

/**
 * Embed a string using Google text-embedding-004 (768 dimensions).
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.embedding?.values ?? [];
}
