// Hybrid similarity score (handbook Week 7).
// 60 points come from structured fields (price, beds, city, size) and 40 from the Week 6
// embeddings (how close the two listings' descriptions are in meaning).
import type { IndexItem, ListingIndex } from "../../semantic-search/scripts/store.ts";

export interface ScoreParts {
  price: number; // out of 20
  beds: number; // out of 15
  city: number; // out of 15
  size: number; // out of 10
  style: number; // out of 40
  total: number; // out of 100
}

// Difference as a share of the liked listing's value, or null when either side is missing.
export function relDiff(target: number | null, candidate: number | null): number | null {
  if (target === null || candidate === null || target <= 0 || candidate <= 0) return null;
  return Math.abs(target - candidate) / target;
}

// The handbook uses $50k / $150k / $300k. Those are 5% / 15% / 30% of a $1M home, so the same
// steps are used as percentages. That way a $400k condo and a $5M house are judged the same way.
export function pricePoints(target: number | null, candidate: number | null): number {
  const d = relDiff(target, candidate);
  if (d === null) return 0;
  if (d < 0.05) return 20;
  if (d < 0.15) return 12;
  if (d < 0.3) return 5;
  return 0;
}

// Handbook: 300 / 700 sqft, which is about 15% / 35% of a 2,000 sqft home.
export function sizePoints(target: number | null, candidate: number | null): number {
  const d = relDiff(target, candidate);
  if (d === null) return 0;
  if (d < 0.15) return 10;
  if (d < 0.35) return 5;
  return 0;
}

const sameText = (a: string | null, b: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function calculateSimilarityScore(target: IndexItem, candidate: IndexItem, cosine: number): ScoreParts {
  const price = pricePoints(target.price, candidate.price);
  const beds = target.beds !== null && target.beds === candidate.beds ? 15 : 0;
  const city = sameText(target.city, candidate.city) ? 15 : 0;
  const size = sizePoints(target.sqft, candidate.sqft);
  const style = 40 * Math.max(0, Math.min(1, cosine));
  const round = (n: number) => Math.round(n * 100) / 100;
  return { price, beds, city, size, style: round(style), total: round(price + beds + city + size + style) };
}

export interface Ranked {
  row: number; // position in the embedding index
  parts: ScoreParts;
}

export interface RankOptions {
  k?: number;
  sameType?: boolean; // only compare against the same home type (on by default)
}

// Scores the liked listing against every other listing in the index and returns the best k.
// Vectors in the index are already scaled to length 1, so cosine similarity is a dot product.
export function rankSimilar(index: ListingIndex, targetRow: number, opts: RankOptions = {}): Ranked[] {
  const { items, vectors, dims } = index;
  const k = Math.max(0, opts.k ?? 5);
  const sameType = opts.sameType ?? true;
  const target = items[targetRow];
  const tOff = targetRow * dims;
  const out: Ranked[] = [];

  for (let row = 0; row < items.length; row++) {
    const item = items[row];
    if (row === targetRow || item.id === target.id) continue;
    if (sameType && target.type && !sameText(item.type, target.type)) continue;
    let dot = 0;
    const off = row * dims;
    for (let j = 0; j < dims; j++) dot += vectors[tOff + j] * vectors[off + j];
    out.push({ row, parts: calculateSimilarityScore(target, item, dot) });
  }

  out.sort((a, b) => b.parts.total - a.parts.total || a.row - b.row);
  return out.slice(0, k);
}

export function describeScore(p: ScoreParts): string {
  const n = (x: number) => String(Math.round(x));
  return `Similarity ${n(p.total)}/100: price ${p.price}/20 · beds ${p.beds}/15 · ` +
    `city ${p.city}/15 · size ${p.size}/10 · style ${n(p.style)}/40`;
}