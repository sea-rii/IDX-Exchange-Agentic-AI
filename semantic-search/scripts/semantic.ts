// Semantic property search: free-text description -> top 5 most similar active listings.
import type { PropertyFilters } from "../../nl-property-search/scripts/parser.ts";
import { formatListingCard, type ListingRow } from "../../mls-search/scripts/format.ts";
import type { ListingIndex } from "./store.ts";
import { normalize, topK } from "./vectors.ts";
import { candidateRows, describeFilters, hasHardFilters } from "./filters.ts";
import { buildListingsByIdQuery } from "./sql.ts";

export type CardRow = ListingRow & { L_Remarks: string | null };
export type QueryFn = <T>(sql: string, params: (string | number)[]) => Promise<T[]>;

export interface SearchDeps {
  index: ListingIndex;
  embed: (text: string) => Promise<number[]>;
  query: QueryFn;
  parse?: (text: string) => Promise<Partial<PropertyFilters>>; // left out with --no-filters
}

export interface SearchOptions {
  topK?: number;
}

// First ~200 characters of the description, cut at a word, so the user sees why it matched.
export function snippet(remarks: string | null, max = 200): string | null {
  const text = (remarks ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > 100 ? cut.lastIndexOf(" ") : max).replace(/[,;:.\s]+$/, "") + "...";
}

export function formatMatch(row: CardRow, score: number, n: number): string {
  const desc = snippet(row.L_Remarks);
  return [
    formatListingCard(row, n),
    `Match score: ${score.toFixed(2)}`,
    desc && `"${desc}"`,
  ].filter(Boolean).join("\n");
}

export async function semanticSearch(question: string, deps: SearchDeps, opts: SearchOptions = {}) {
  const k = Math.min(25, Math.max(1, Math.floor(opts.topK ?? 5)));
  const text = question.trim();
  if (!text) return "Describe the kind of home you're looking for.";
  const { index } = deps;

  // 1. Optional hard filters from the Week 2 parser.
  const filters = deps.parse ? await deps.parse(text) : {};
  const useFilters = hasHardFilters(filters);
  const candidates = useFilters ? candidateRows(index.items, filters) : undefined;
  if (candidates && !candidates.length) {
    return `No active listings match ${describeFilters(filters)}. Try a wider price range or another city.`;
  }

  // 2. Embed the question and rank. A few extras are kept in case some went off the market.
  const queryVec = normalize(await deps.embed(text));
  if (queryVec.length !== index.dims) {
    throw new Error(`The query embedding has ${queryVec.length} numbers but the index uses ${index.dims}`);
  }
  const matches = topK(queryVec, index.vectors, index.dims, k + 10, candidates);

  // 3. Look up the full rows, keep the similarity order.
  const ids = matches.map((m) => index.items[m.row].id);
  const { sql, params } = buildListingsByIdQuery(ids);
  const rows = await deps.query<CardRow>(sql, params);
  const byId = new Map(rows.map((r) => [String(r.L_ListingID), r]));
  const found = matches
    .map((m) => ({ row: byId.get(index.items[m.row].id), score: m.score }))
    .filter((x): x is { row: CardRow; score: number } => !!x.row)
    .slice(0, k);

  if (!found.length) return "None of the matching listings are still active. Rebuild the index with build-index.ts.";

  const searched = (candidates ?? index.items).length;
  const header = [
    `Top ${found.length} active listings most similar to "${text}"`,
    useFilters && `Filters from your message: ${describeFilters(filters)}`,
    `(compared against ${searched.toLocaleString("en-US")} listings, highest match first)`,
  ].filter(Boolean).join("\n");

  return [header, ...found.map((f, i) => formatMatch(f.row, f.score, i + 1))].join("\n\n");
}