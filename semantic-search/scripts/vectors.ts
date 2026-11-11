// Cosine similarity search (handbook find_similar_listings).
//
// Every vector is scaled to length 1 when it's stored, so cosine similarity is just the dot
// product. That gives the same scores as sklearn's cosine_similarity, without Python.

export function normalize(v: ArrayLike<number>): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const len = Math.sqrt(sum);
  const out = new Float32Array(v.length);
  if (len === 0) return out;
  for (let i = 0; i < v.length; i++) out[i] = v[i] / len;
  return out;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface Match {
  row: number; // position in the index
  score: number;
}

// Scores the query against every stored vector (or only the candidate rows) and returns the
// top k, highest score first. `matrix` holds all vectors back to back, `dims` numbers each.
export function topK(
  query: Float32Array,
  matrix: Float32Array,
  dims: number,
  k = 5,
  candidates?: number[],
): Match[] {
  const rows = candidates ?? Array.from({ length: matrix.length / dims }, (_, i) => i);
  const scores: Match[] = rows.map((row) => {
    let dot = 0;
    const off = row * dims;
    for (let j = 0; j < dims; j++) dot += query[j] * matrix[off + j];
    return { row, score: dot };
  });
  scores.sort((a, b) => b.score - a.score || a.row - b.row);
  return scores.slice(0, Math.max(0, k));
}