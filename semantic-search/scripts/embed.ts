// Calls the OpenAI embeddings API (handbook get_embedding), using Node's built-in fetch.
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

// Load the .env file at the repo root, no matter which folder the script is run from.
const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

export const EMBED_MODEL = "text-embedding-3-small";
// 512 instead of the default 1536 keeps the index about 3x smaller and faster to search.
export const EMBED_DIMS = 512;
// Price of text-embedding-3-small per 1M tokens, only used for the cost estimate.
export const USD_PER_MILLION_TOKENS = 0.02;

export interface EmbedOptions {
  model?: string;
  dims?: number;
  apiKey?: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
}

export interface EmbedResult {
  vectors: number[][];
  tokens: number;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Rough token count (about 4 characters per token), for the estimate only.
export const estimateTokens = (texts: string[]) =>
  Math.ceil(texts.reduce((sum, t) => sum + t.length, 0) / 4);

export const estimateCost = (tokens: number) => (tokens / 1_000_000) * USD_PER_MILLION_TOKENS;

// Groups texts into API requests: at most maxItems texts and about maxChars characters each,
// so one request stays well under OpenAI's per-request token limit.
export function makeBatches(texts: string[], maxItems = 500, maxChars = 600_000): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let chars = 0;
  texts.forEach((t, i) => {
    if (current.length && (current.length >= maxItems || chars + t.length > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(i);
    chars += t.length;
  });
  if (current.length) batches.push(current);
  return batches;
}

export async function embedTexts(texts: string[], opts: EmbedOptions = {}): Promise<EmbedResult> {
  const {
    model = EMBED_MODEL, dims = EMBED_DIMS, apiKey = process.env.OPENAI_API_KEY,
    fetchFn = fetch, sleep = wait, retries = 5,
  } = opts;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing from .env");

  const input = texts.map((t) => t.replace(/\n/g, " ").trim() || " ");
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input, dimensions: dims }),
    });

    if (res.ok) {
      const body = (await res.json()) as {
        data: { index: number; embedding: number[] }[];
        usage?: { total_tokens?: number };
      };
      const vectors: number[][] = new Array(texts.length);
      for (const d of body.data) vectors[d.index] = d.embedding;
      return { vectors, tokens: body.usage?.total_tokens ?? 0 };
    }

    const detail = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("OpenAI rejected the API key. Check OPENAI_API_KEY in .env");
    const canRetry = res.status === 429 || res.status >= 500;
    if (!canRetry || attempt >= retries) {
      throw new Error(`OpenAI embeddings request failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    await sleep(1000 * 2 ** attempt); // 1s, 2s, 4s, ...
  }
}