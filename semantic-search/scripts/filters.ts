// Hard filters from the Week 2 parser, applied before the similarity search.
//
// Embeddings are good at style and feel ("charming craftsman") but bad at numbers and exact
// places. So if the message names a city, price, beds, baths, size, home type or HOA limit,
// only listings that match are ranked. Pool and view are left to the embedding, since
// "mountain views" in a description is exactly what semantic search is for.
import type { PropertyFilters } from "../../nl-property-search/scripts/parser.ts";
import type { IndexItem } from "./store.ts";

const same = (a: string | null, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();
const has = (v: unknown) => v !== null && v !== undefined && v !== "";

export function hasHardFilters(f: Partial<PropertyFilters>): boolean {
  return [f.city, f.minPrice, f.maxPrice, f.beds, f.baths, f.sqft, f.type, f.maxHoa].some(has);
}

// Positions in the index that pass every filter (same rules as the Week 3 SQL: a listing
// with no value for a filtered field doesn't match).
export function candidateRows(items: IndexItem[], f: Partial<PropertyFilters>): number[] {
  const out: number[] = [];
  items.forEach((it, i) => {
    if (has(f.city) && !same(it.city, f.city!)) return;
    if (has(f.type) && !same(it.type, f.type!)) return;
    if (has(f.minPrice) && !(it.price !== null && it.price >= f.minPrice!)) return;
    if (has(f.maxPrice) && !(it.price !== null && it.price <= f.maxPrice!)) return;
    if (has(f.beds) && !(it.beds !== null && it.beds >= f.beds!)) return;
    if (has(f.baths) && !(it.baths !== null && it.baths >= f.baths!)) return;
    if (has(f.sqft) && !(it.sqft !== null && it.sqft >= f.sqft!)) return;
    if (has(f.maxHoa) && !(it.hoa !== null && it.hoa <= f.maxHoa!)) return;
    out.push(i);
  });
  return out;
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export function describeFilters(f: Partial<PropertyFilters>): string {
  return [
    has(f.city) && f.city,
    has(f.type) && f.type,
    has(f.minPrice) && `from ${money(f.minPrice!)}`,
    has(f.maxPrice) && `up to ${money(f.maxPrice!)}`,
    has(f.beds) && `${f.beds}+ beds`,
    has(f.baths) && `${f.baths}+ baths`,
    has(f.sqft) && `${f.sqft!.toLocaleString("en-US")}+ sqft`,
    has(f.maxHoa) && `HOA up to ${money(f.maxHoa!)}/mo`,
  ].filter(Boolean).join(" · ");
}