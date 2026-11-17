// Retrieval and grounded answers: question -> top chunks -> gpt-4o-mini answer with sources.
import { chunkLabel } from "./chunk.ts";
import type { IndexedChunk, RagIndex } from "./store.ts";

export const CHAT_MODEL = "gpt-4o-mini";
export const TOP_K = 4;
// Chunks scoring below this are treated as unrelated. If even the best chunk is below it,
// the model isn't called at all, so off-topic questions cost nothing and can't be made up.
export const MIN_SCORE = 0.15;

export const NOT_FOUND = "I couldn't find that in the indexed documents (Primer, Trestle field definitions, table schema, market summaries).";

export interface Hit {
  chunk: IndexedChunk;
  score: number;
}

const dot = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

// Saved embeddings are length 1, and the query is scaled the same way, so the dot product is the
// cosine similarity.
export function retrieve(queryVec: number[], index: RagIndex, topK = TOP_K, minScore = MIN_SCORE): Hit[] {
  const len = Math.sqrt(queryVec.reduce((s, x) => s + x * x, 0)) || 1;
  const q = queryVec.map((x) => x / len);
  return index.chunks
    .map((chunk) => ({ chunk, score: dot(q, chunk.embedding) }))
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function buildPrompt(question: string, hits: Hit[]): { system: string; user: string } {
  const context = hits
    .map((h, i) => `[${i + 1}] ${chunkLabel(h.chunk)}\n${h.chunk.text}`)
    .join("\n\n---\n\n");
  const system = [
    "You answer questions about real estate terms, MLS fields and market data for IDX Exchange.",
    "Use only the numbered context passages the user gives you. Do not use outside knowledge.",
    "After each fact, cite the passage it came from like [1] or [2].",
    "If the passages don't answer the question, reply exactly: NOT_FOUND",
    "Keep the answer short and plain. When asked for a list of columns or fields, list them all.",
  ].join("\n");
  const user = `Context:\n\n${context}\n\nQuestion: ${question}`;
  return { system, user };
}

// [1], [2][4] and [1, 3] -> the passage numbers that were cited.
export function citedNumbers(answer: string, count: number): number[] {
  const nums = new Set<number>();
  for (const m of answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of m[1].split(",")) {
      const k = Number(n.trim());
      if (k >= 1 && k <= count) nums.add(k);
    }
  }
  return [...nums].sort((a, b) => a - b);
}

export function formatAnswer(answer: string, hits: Hit[]): string {
  const text = answer.trim();
  if (!text || /^NOT_FOUND\.?$/i.test(text)) return NOT_FOUND;
  const cited = citedNumbers(text, hits.length);
  const shown = cited.length ? cited : hits.map((_, i) => i + 1);
  const lines = shown.map((n) => `[${n}] ${chunkLabel(hits[n - 1].chunk)}`);
  return `${text}\n\nSources:\n${lines.join("\n")}`;
}

export interface ChatOptions {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
}

export async function chat(system: string, user: string, opts: ChatOptions = {}): Promise<string> {
  const { apiKey = process.env.OPENAI_API_KEY, model = CHAT_MODEL, fetchFn = fetch } = opts;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing from .env");
  const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0, // same question, same answer
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (res.status === 401) throw new Error("OpenAI rejected the API key. Check OPENAI_API_KEY in .env");
  if (!res.ok) throw new Error(`OpenAI chat request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices: { message: { content: string | null } }[] };
  return body.choices[0]?.message?.content ?? "";
}

export interface RagDeps {
  index: RagIndex;
  embed: (text: string) => Promise<number[]>;
  chat: (system: string, user: string) => Promise<string>;
}

export interface AskOptions {
  topK?: number;
  minScore?: number;
  showContext?: boolean; // also print the retrieved passages and scores (for testing)
}

export async function ragAnswer(question: string, deps: RagDeps, opts: AskOptions = {}): Promise<string> {
  const { topK = TOP_K, minScore = MIN_SCORE, showContext = false } = opts;
  const hits = retrieve(await deps.embed(question), deps.index, topK, minScore);
  if (!hits.length) return NOT_FOUND;

  const { system, user } = buildPrompt(question, hits);
  const out = formatAnswer(await deps.chat(system, user), hits);
  if (!showContext) return out;

  const ctx = hits.map((h, i) =>
    `[${i + 1}] score ${h.score.toFixed(3)} · ${chunkLabel(h.chunk)}\n    ${h.chunk.text.slice(0, 160).replace(/\s+/g, " ")}…`);
  return `${out}\n\nRetrieved passages:\n${ctx.join("\n")}`;
}