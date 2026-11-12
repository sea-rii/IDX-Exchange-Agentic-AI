// Recommendation engine: a listing the user likes -> top 5 similar active listings,
// each with a price check against recent sales in california_sold.
import { formatListingCard, type ListingRow } from "../../mls-search/scripts/format.ts";
import type { ListingIndex } from "../../semantic-search/scripts/store.ts";
import { describeScore, rankSimilar, type ScoreParts } from "./score.ts";
import {
  assessPrice, COMP_MONTHS, formatPriceCheck, monthsBefore, num, prettyDay, SIZE_BAND, type SaleRow,
} from "./comps.ts";
import {
  buildCompsQuery, buildLatestSaleQuery, buildListingsByIdQuery, buildTargetByAddressQuery, buildTargetByIdQuery,
} from "./sql.ts";

export type QueryFn = <T>(sql: string, params: (string | number)[]) => Promise<T[]>;

export interface Deps {
  index: ListingIndex;
  query: QueryFn;
}

export interface RecommendOptions {
  topK?: number;
  sameType?: boolean;
}

export type TargetInput =
  | { kind: "id"; id: string }
  | { kind: "address"; street: string; city: string | null };

// "MLS# OC26123456", "OC26123456" or "123456789" -> MLS number.
// Anything else is treated as an address: "24 Willow Bend, Irvine 92618".
export function parseTarget(input: string): TargetInput | null {
  const text = input.trim();
  if (!text) return null;
  const mls = text.match(/MLS\s*(?:#|no\.?|number)?\s*:?\s*([A-Z0-9-]{2,})/i);
  if (mls) return { kind: "id", id: mls[1] };
  if (/^[A-Z]{0,5}-?\d{5,}$/i.test(text)) return { kind: "id", id: text };
  const [street, ...rest] = text.split(",").map((s) => s.trim());
  const city = rest.join(" ").replace(/\b(CA|California)\b/gi, "").replace(/\d{5}(-\d{4})?/g, "").trim();
  return { kind: "address", street, city: city || null };
}

const sameAddress = (a: ListingRow, b: ListingRow) =>
  !!a.L_Address && !!b.L_Address &&
  a.L_Address.trim().toLowerCase() === b.L_Address.trim().toLowerCase() &&
  (a.L_City ?? "").toLowerCase() === (b.L_City ?? "").toLowerCase();

const shortLine = (r: ListingRow) => {
  const price = num(r.price);
  return [
    `MLS# ${r.L_DisplayId ?? r.L_ListingID}`,
    [r.L_Address, r.L_City].filter(Boolean).join(", "),
    price !== null ? "$" + Math.round(price).toLocaleString("en-US") : null,
  ].filter(Boolean).join(" · ");
};

async function findTarget(input: TargetInput, query: QueryFn): Promise<ListingRow[]> {
  const q = input.kind === "id"
    ? buildTargetByIdQuery(input.id)
    : buildTargetByAddressQuery(input.street, input.city);
  return query<ListingRow>(q.sql, q.params);
}

interface Window { from: string; to: string }

async function priceCheck(row: ListingRow, win: Window | null, query: QueryFn): Promise<string> {
  const sqft = num(row.sqft);
  if (!win) return "Price check: no sales data available";
  if (!sqft || sqft <= 0 || !row.L_City) return formatPriceCheck(assessPrice(num(row.price), sqft, []), sqft);
  const q = buildCompsQuery({ city: row.L_City, type: row.type, sqft, from: win.from, to: win.to, band: SIZE_BAND });
  const sales = await query<SaleRow>(q.sql, q.params);
  return formatPriceCheck(assessPrice(num(row.price), sqft, sales), sqft);
}

export async function recommend(input: string, deps: Deps, opts: RecommendOptions = {}): Promise<string> {
  const k = Math.min(10, Math.max(1, Math.floor(opts.topK ?? 5)));
  const { index, query } = deps;

  // 1. Find the listing the user likes.
  const parsed = parseTarget(input);
  if (!parsed) return "Tell me the MLS number or address of a listing you like.";
  const found = await findTarget(parsed, query);
  if (!found.length) {
    return parsed.kind === "id"
      ? `I couldn't find an active listing with MLS# ${parsed.id}.`
      : `I couldn't find an active listing at "${parsed.street}". Try the MLS number from the listing card.`;
  }
  if (found.length > 1) {
    return ["More than one active listing matches. Which one do you mean?", "",
      ...found.slice(0, 5).map((r, i) => `${i + 1}. ${shortLine(r)}`)].join("\n");
  }
  const target = found[0];

  // 2. Rank every other listing with the hybrid score. A few extras are kept in case some
  //    went off the market, or are the same home listed twice.
  const targetRow = index.items.findIndex((it) => it.id === String(target.L_ListingID));
  if (targetRow < 0) {
    return "This listing isn't in the embedding index yet, so recommendations aren't available for it. " +
      "Run: node semantic-search/scripts/build-index.ts";
  }
  const ranked = rankSimilar(index, targetRow, { k: k + 10, sameType: opts.sameType ?? true });
  if (!ranked.length) return "I couldn't find any other active listings to compare with.";

  const ids = ranked.map((r) => index.items[r.row].id);
  const q = buildListingsByIdQuery(ids);
  const rows = await query<ListingRow>(q.sql, q.params);
  const byId = new Map(rows.map((r) => [String(r.L_ListingID), r]));
  const picks: { row: ListingRow; parts: ScoreParts }[] = [];
  for (const r of ranked) {
    const row = byId.get(index.items[r.row].id);
    if (!row || sameAddress(row, target)) continue;
    picks.push({ row, parts: r.parts });
    if (picks.length === k) break;
  }
  if (!picks.length) return "I couldn't find any other active listings to compare with.";

  // 3. Price check for the liked listing and each pick, against the last 6 months of sales.
  const [latest] = await query<{ latest: string | null }>(buildLatestSaleQuery().sql, []);
  const win = latest?.latest ? { from: monthsBefore(latest.latest, COMP_MONTHS), to: latest.latest } : null;
  const checks = await Promise.all([target, ...picks.map((p) => p.row)].map((r) => priceCheck(r, win, query)));

  // 4. Reply.
  const lines = [
    "Because you liked:",
    formatListingCard(target),
    checks[0],
    "",
    `${picks.length} similar active listing${picks.length === 1 ? "" : "s"}:`,
  ];
  picks.forEach((p, i) => {
    lines.push("", formatListingCard(p.row, i + 1), describeScore(p.parts), checks[i + 1]);
  });
  if (win) {
    lines.push("", `Comps are residential sales of the same home type in the same city, within ` +
      `${Math.round(SIZE_BAND * 100)}% of the size, that closed ${prettyDay(win.from)} – ${prettyDay(win.to)}.`);
  }
  return lines.join("\n");
}