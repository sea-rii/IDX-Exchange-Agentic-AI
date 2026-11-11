// Saves and loads the embedding index in data/embeddings/:
//   listings.json  model, size, and one entry per listing (id, text hash, a few fields to filter on)
//   listings.bin   all vectors back to back as 32-bit floats, in the same order as the entries
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { normalize } from "./vectors.ts";
import { buildListingText, num, type ListingTextRow } from "./text.ts";

export const DEFAULT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "../../data/embeddings");

export interface IndexItem {
  id: string;
  hash: string; // changes when the listing text changes, so only those get re-embedded
  city: string | null;
  type: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  hoa: number | null;
}

export interface ListingIndex {
  model: string;
  dims: number;
  builtAt: string;
  items: IndexItem[];
  vectors: Float32Array; // items.length * dims numbers
}

export const textHash = (text: string, model: string, dims: number) =>
  crypto.createHash("sha1").update(`${model}|${dims}|${text}`).digest("hex");

// One database row -> the text to embed and its index entry.
export function toIndexEntry(r: ListingTextRow, model: string, dims: number) {
  const text = buildListingText(r);
  const item: IndexItem = {
    id: String(r.L_ListingID),
    hash: textHash(text, model, dims),
    city: r.L_City?.trim() || null,
    type: r.L_Type_?.trim() || null,
    price: num(r.L_SystemPrice),
    beds: num(r.L_Keyword2),
    baths: num(r.LM_Dec_3),
    sqft: num(r.LM_Int2_3),
    hoa: num(r.AssociationFee),
  };
  return { text, item };
}

export function saveIndex(index: ListingIndex, dir = DEFAULT_DIR): void {
  if (index.vectors.length !== index.items.length * index.dims) {
    throw new Error("Index is broken: vector count doesn't match the listing count");
  }
  fs.mkdirSync(dir, { recursive: true });
  const { vectors, ...meta } = index;
  // Write to temp files first, then rename, so a crash never leaves a half-written index.
  const bin = path.join(dir, "listings.bin"), json = path.join(dir, "listings.json");
  fs.writeFileSync(bin + ".tmp", Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength));
  fs.writeFileSync(json + ".tmp", JSON.stringify({ ...meta, count: index.items.length }));
  fs.renameSync(bin + ".tmp", bin);
  fs.renameSync(json + ".tmp", json);
}

export function loadIndex(dir = DEFAULT_DIR): ListingIndex | null {
  const bin = path.join(dir, "listings.bin"), json = path.join(dir, "listings.json");
  if (!fs.existsSync(bin) || !fs.existsSync(json)) return null;
  const meta = JSON.parse(fs.readFileSync(json, "utf8"));
  const buf = fs.readFileSync(bin);
  // Copy into a fresh buffer so the floats are aligned in memory.
  const vectors = new Float32Array(new Uint8Array(buf).buffer);
  if (vectors.length !== meta.items.length * meta.dims) {
    throw new Error("The embedding index is damaged. Run build-index.ts with --rebuild");
  }
  return { model: meta.model, dims: meta.dims, builtAt: meta.builtAt, items: meta.items, vectors };
}

export interface Plan {
  items: IndexItem[];
  vectors: Float32Array;
  ready: boolean[]; // true when the vector is already filled in
  toEmbed: number[]; // positions that still need an embedding
  reused: number;
  removed: number;
}

// Compares the current listings with the saved index. Unchanged listings keep their old vector,
// new or changed ones are queued, and listings that are no longer active are dropped.
export function planIndex(
  current: IndexItem[],
  old: ListingIndex | null,
  model: string,
  dims: number,
): Plan {
  const sameSetup = old && old.model === model && old.dims === dims;
  const oldRows = new Map<string, number>();
  if (sameSetup) old.items.forEach((it, i) => oldRows.set(it.id, i));

  const vectors = new Float32Array(current.length * dims);
  const ready: boolean[] = [];
  const toEmbed: number[] = [];
  let reused = 0;

  current.forEach((item, i) => {
    const o = oldRows.get(item.id);
    if (sameSetup && o !== undefined && old.items[o].hash === item.hash) {
      vectors.set(old.vectors.subarray(o * dims, (o + 1) * dims), i * dims);
      ready.push(true);
      reused++;
    } else {
      ready.push(false);
      toEmbed.push(i);
    }
  });

  const currentIds = new Set(current.map((c) => c.id));
  const removed = old ? old.items.filter((it) => !currentIds.has(it.id)).length : 0;
  return { items: current, vectors, ready, toEmbed, reused, removed };
}

export function fillVector(plan: Plan, pos: number, embedding: number[], dims: number): void {
  if (embedding.length !== dims) throw new Error(`Expected ${dims} numbers, got ${embedding.length}`);
  plan.vectors.set(normalize(embedding), pos * dims);
  plan.ready[pos] = true;
}

// Keeps only the listings that have a vector, so a stopped build still leaves a usable index.
export function readyIndex(plan: Plan, model: string, dims: number): ListingIndex {
  const keep = plan.ready.flatMap((r, i) => (r ? [i] : []));
  const vectors = new Float32Array(keep.length * dims);
  keep.forEach((pos, j) => vectors.set(plan.vectors.subarray(pos * dims, (pos + 1) * dims), j * dims));
  return {
    model, dims, builtAt: new Date().toISOString(),
    items: keep.map((pos) => plan.items[pos]), vectors,
  };
}