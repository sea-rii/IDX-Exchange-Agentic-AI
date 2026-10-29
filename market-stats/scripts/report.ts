// Builds the market report for one question (handbook Week 5).
// The database call is passed in, so the tests can use fake data instead of MySQL.
import { parsePropertyQuery } from "../../nl-property-search/scripts/parser.ts";
import {
  buildActiveCountQuery, buildLatestDateQuery, buildMonthlyVolumeQuery, buildSoldRowsQuery,
  buildTopCitiesQuery, type Area,
} from "./sql.ts";
import {
  breakdown, computeMetrics, coveredMonths, inMonths, marketRead, monthlyTrend, monthsOfSupply,
  pctChange, shiftMonth, splitCovered, toSale, windowFor, type SoldRow,
} from "./stats.ts";
import {
  areaLabel, breakdownLine, change, int, money, monthLabel, pct1, summaryLines, trendLine, typeLabel,
} from "./format.ts";

export type QueryFn = <T>(sql: string, params?: (string | number)[]) => Promise<T[]>;

export type MarketRequest = {
  question?: string;
  city?: string | null;
  zip?: string | null;
  type?: string | null;
  by?: "zip" | "type" | null;
  top?: boolean;
};

// Only home types that exist in the residential sold data. This also stops a phrase like
// "lots of sales" from turning into a land filter.
const RESIDENTIAL_TYPES = new Set(["SingleFamilyResidence", "Condominium", "Townhouse"]);

// California ZIP codes start with 90 to 96.
const ZIP = /\b(9[0-6]\d{3})\b/;

export async function resolveArea(req: MarketRequest): Promise<Area> {
  const parsed = req.question ? await parsePropertyQuery(req.question) : null;
  const zip = req.zip ?? req.question?.match(ZIP)?.[1] ?? null;
  const parsedType = parsed?.type && RESIDENTIAL_TYPES.has(parsed.type) ? parsed.type : null;
  return {
    city: req.city ?? parsed?.city ?? null,
    zip,
    type: req.type ?? parsedType,
  };
}

const args = (b: { sql: string; params: (string | number)[] }) => [b.sql, b.params] as const;

// Which months the data covers, worked out once per question.
async function getCoverage(query: QueryFn) {
  const [{ latest }] = await query<{ latest: string | null }>(buildLatestDateQuery().sql);
  if (!latest) return null;
  const w = windowFor(latest);
  const volume = await query<{ month: string; total: number | string }>(...args(buildMonthlyVolumeQuery(w.from, w.to)));
  const covered = coveredMonths(volume, w.candidates);
  if (!covered.length) return null;
  const { recent, prior } = splitCovered(covered);
  return { ...w, recent, prior, range: `${monthLabel(recent[0])} – ${monthLabel(recent[recent.length - 1])}` };
}

export async function buildMarketReport(req: MarketRequest, query: QueryFn): Promise<string> {
  const cov = await getCoverage(query);
  if (!cov) return "There is no sold data in california_sold yet.";

  if (req.top) {
    const from = `${cov.recent[0]}-01`;
    return topCitiesReport(await query<TopRow>(...args(buildTopCitiesQuery(from, cov.to))), cov.range);
  }

  const area = await resolveArea(req);
  if (!area.city && !area.zip) return "Which city (or ZIP code) do you want market stats for?";

  const [rows, [{ total }]] = await Promise.all([
    query<SoldRow>(...args(buildSoldRowsQuery(area, cov.from, cov.to, req.by === "zip"))),
    query<{ total: number | string }>(...args(buildActiveCountQuery(area))),
  ]);

  const sales = rows.map(toSale);
  const recent = inMonths(sales, cov.recent);
  const place = areaLabel(area);
  const n = cov.recent.length;

  if (!recent.length) {
    return `No residential sales found for ${place} (${typeLabel(area.type).toLowerCase()}) from ${cov.range}. Check the spelling of the city, or try without a home type.`;
  }

  const m = computeMetrics(recent);
  const active = Number(total);
  const supply = monthsOfSupply(active, m.sales, n);
  const trend = monthlyTrend(sales, cov.recent);
  const first = trend[0];
  const last = trend[n - 1];
  const read = marketRead(m, supply);

  const lines = [
    `Market stats: ${place} · ${typeLabel(area.type)} · ${cov.range}`,
  ];
  if (n < 12) lines.push(`(The sold data only has full months from ${monthLabel(cov.recent[0])}, so this covers ${n} months.)`);
  lines.push(
    "",
    `Sales: ${int(m.sales)} · Active listings now: ${int(active)}` +
      (supply !== null ? ` (${supply.toFixed(1)} months of supply)` : ""),
    ...summaryLines(m),
  );
  if (m.sales < 10) lines.push(`Only ${m.sales} sales, so these numbers can change a lot from a few sales.`);

  lines.push("", "Change");
  if (n >= 2) {
    const before = trend[n - 2];
    lines.push(
      `${monthLabel(last.month)} vs ${monthLabel(before.month)}: median price ${change(pctChange(last.medianPrice, before.medianPrice))}, ` +
        `sales ${change(pctChange(last.sales, before.sales))}, days on market ${int(before.medianDom)} → ${int(last.medianDom)}`,
    );
  }
  const sameMonthLastYear = shiftMonth(last.month, -12);
  if (cov.prior.length) {
    const priorM = computeMetrics(inMonths(sales, cov.prior));
    const ly = monthlyTrend(sales, [sameMonthLastYear])[0];
    lines.push(`Median price vs the 12 months before: ${change(pctChange(m.medianPrice, priorM.sales ? priorM.medianPrice : null))}`);
    lines.push(
      `${monthLabel(last.month)} vs ${monthLabel(ly.month)}: median price ${change(pctChange(last.medianPrice, ly.medianPrice))}, ` +
        `sales ${change(pctChange(last.sales, ly.sales))}`,
    );
  } else if (n >= 3) {
    lines.push(`${monthLabel(last.month)} vs ${monthLabel(first.month)}: median price ${change(pctChange(last.medianPrice, first.medianPrice))}, ` +
      `median $/sqft ${change(pctChange(last.medianPpsf, first.medianPpsf))}`);
    lines.push("Year over year: not enough history in the data yet.");
  }

  lines.push("", `${n}-month trend (sales · median price · median $/sqft · median days on market)`);
  lines.push(...trend.map(trendLine));

  if (req.by === "type" || req.by === "zip") {
    const groups = breakdown(recent, (s) => (req.by === "zip" ? s.zip : s.subType));
    lines.push("", `By ${req.by === "zip" ? "ZIP code" : "home type"}`, ...groups.map(breakdownLine));
  }

  lines.push("", `Market read: ${read.label}`, ...read.reasons.map((r) => `- ${r}`), read.meaning);
  lines.push(`Based on past sales through ${monthLabel(last.month)}, not a forecast.`);
  return lines.join("\n");
}

type TopRow = {
  City: string; sold_count: number; avg_close_price: string | number; avg_price_per_sqft: string | number;
  avg_dom: string | number; list_to_close_pct: string | number;
};

function topCitiesReport(rows: TopRow[], range: string): string {
  return [
    `Top ${rows.length} cities by residential sales · ${range}`,
    "(sales · avg price · avg $/sqft · avg days on market · list-to-close)",
    "",
    ...rows.map((r, i) =>
      `${i + 1}. ${r.City}  ${int(Number(r.sold_count))} sales · ${money(Number(r.avg_close_price))} · ` +
      `${money(Number(r.avg_price_per_sqft))}/sqft · ${Number(r.avg_dom).toFixed(1)} days · ${pct1(Number(r.list_to_close_pct))}`),
  ].join("\n");
}