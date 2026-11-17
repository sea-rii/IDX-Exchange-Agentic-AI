// Saves and loads the RAG index (chunks + their embeddings) in data/rag-index/index.json.
// The index is small (a few hundred chunks), so plain JSON is fine here, unlike Week 6.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { embedText, type Chunk } from "./chunk.ts";

export const INDEX_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/rag-index");
const INDEX_FILE = "index.json";

export interface IndexedChunk extends Chunk {
  hash: string; // changes when the chunk text or label changes
  embedding: number[]; // scaled to length 1, so cosine similarity is a dot product
}

export interface RagIndex {
  model: string;
  dims: number;
  builtAt: string;
  chunks: IndexedChunk[];
}

export const hashChunk = (c: Chunk) => crypto.createHash("sha1").update(embedText(c)).digest("hex");

export function normalize(v: number[]): number[] {
  const len = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return len ? v.map((x) => x / len) : v;
}

export interface IndexPlan {
  chunks: (Chunk & { hash: string })[];
  reused: Map<number, number[]>; // chunk position -> saved embedding
  toEmbed: number[]; // chunk positions that need a new embedding
}

// Reuses saved embeddings for chunks whose text hasn't changed, so editing one document only
// pays for the chunks that changed. A different model or size means embedding everything again.
export function planIndex(chunks: Chunk[], old: RagIndex | null, model: string, dims: number): IndexPlan {
  const saved = new Map<string, number[]>();
  if (old && old.model === model && old.dims === dims) {
    for (const c of old.chunks) saved.set(c.hash, c.embedding);
  }
  const withHash = chunks.map((c) => ({ ...c, hash: hashChunk(c) }));
  const reused = new Map<number, number[]>();
  const toEmbed: number[] = [];
  withHash.forEach((c, i) => {
    const e = saved.get(c.hash);
    if (e) reused.set(i, e);
    else toEmbed.push(i);
  });
  return { chunks: withHash, reused, toEmbed };
}

export function saveIndex(index: RagIndex, dir = INDEX_DIR): void {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, INDEX_FILE + ".tmp");
  fs.writeFileSync(tmp, JSON.stringify(index));
  fs.renameSync(tmp, path.join(dir, INDEX_FILE)); // a crash mid-write can't leave a broken index
}

export function loadIndex(dir = INDEX_DIR): RagIndex | null {
  const file = path.join(dir, INDEX_FILE);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as RagIndex;
}