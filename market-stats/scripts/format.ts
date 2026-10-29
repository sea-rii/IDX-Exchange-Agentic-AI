// Turns the market numbers into the text reply.
import type { Metrics } from "./stats.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
export const money = (n: number | null) => (n === null ? "n/a" : `$${Math.round(n).toLocaleString("en-US")}`);
export const int = (n: number | null) => (n === null ? "n/a" : Math.round(n).toLocaleString("en-US"));
export const pct1 = (n: number | null) => (n === null ? "n/a" : `${n.toFixed(1)}%`);
export const change = (n: number | null) => {
  if (n === null) return "n/a";
  const s = n.toFixed(1);
  if (s === "0.0" || s === "-0.0") return "0.0%"; // tiny changes round to 0, not "-0.0%"
  return `${n > 0 ? "+" : ""}${s}%`;
};

const TYPE_LABELS: Record<string, string> = {
  SingleFamilyResidence: "Single family homes",
  Condominium: "Condos",
  Townhouse: "Townhomes",
};
export const typeLabel = (t: string | null) => (t ? TYPE_LABELS[t] ?? t : "All residential");

export function areaLabel(a: { city: string | null; zip: string | null }) {
  return [a.city, a.zip && `ZIP ${a.zip}`].filter(Boolean).join(" ");
}

export function summaryLines(m: Metrics): string[] {
  return [
    `Median price: ${money(m.medianPrice)} (avg ${money(m.avgPrice)})`,
    `Price per sqft: median ${money(m.medianPpsf)} (avg ${money(m.avgPpsf)})`,
    `Days on market: median ${int(m.medianDom)} (avg ${int(m.avgDom)})`,
    `List-to-close: ${pct1(m.listToClose)} of list price · ${pct1(m.overAskingPct)} sold over asking`,
  ];
}

// "2025-09  98 sales · $910,000 · $630/sqft · 12 days"
export function trendLine(row: { month: string } & Metrics): string {
  if (!row.sales) return `${row.month}  0 sales`;
  return `${row.month}  ${row.sales} sales · ${money(row.medianPrice)} · ${money(row.medianPpsf)}/sqft · ${int(row.medianDom)} days`;
}

// "Condominium  120 sales · median $700,000 · $600/sqft · 20 days · 99.5% of list"
export function breakdownLine(row: { key: string } & Metrics): string {
  return `${row.key}  ${row.sales} sales · median ${money(row.medianPrice)} · ${money(row.medianPpsf)}/sqft · ${int(row.medianDom)} days · ${pct1(row.listToClose)} of list`;
}