// Comp validation against california_sold (handbook Week 7).
// Is a listing's price backed up by what similar homes nearby actually sold for?

export const COMP_MONTHS = 6; // look back this many months from the newest sale
export const SIZE_BAND = 0.2; // comps within ±20% of the listing's sqft (same as the handbook)
export const MIN_COMPS = 3; // fewer sales than this is too thin to judge a price
export const IN_LINE_PCT = 5; // within ±5% of the comp price counts as "in line"

export interface SaleRow {
  ClosePrice: number | string | null;
  LivingArea: number | string | null;
}

export interface CompResult {
  listPrice: number | null;
  compPrice: number | null; // median $/sqft of the comps x this listing's sqft
  medianPpsf: number | null;
  compCount: number;
  deltaPct: number | null; // + means listed above the comps
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Median instead of the handbook's AVG, so one typo sale ($1 or $90M) can't drag the number.
export function assessPrice(listPrice: number | null, sqft: number | null, sales: SaleRow[]): CompResult {
  const ppsf = sales
    .map((s) => {
      const p = num(s.ClosePrice), a = num(s.LivingArea);
      return p && a && p > 0 && a > 0 ? p / a : null;
    })
    .filter((x): x is number => x !== null);
  const medianPpsf = median(ppsf);
  const enough = ppsf.length >= MIN_COMPS;
  const compPrice = enough && medianPpsf !== null && sqft && sqft > 0 ? medianPpsf * sqft : null;
  const deltaPct = compPrice && listPrice && listPrice > 0
    ? Math.round(((listPrice - compPrice) / compPrice) * 1000) / 10
    : null;
  return {
    listPrice,
    compPrice: compPrice === null ? null : Math.round(compPrice),
    medianPpsf: medianPpsf === null ? null : Math.round(medianPpsf),
    compCount: ppsf.length,
    deltaPct,
  };
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${Math.abs(n).toFixed(1)}%`;

export function formatPriceCheck(r: CompResult, sqft: number | null): string {
  if (!sqft || sqft <= 0) return "Price check: no square footage listed, so it can't be compared to sales";
  if (r.compCount < MIN_COMPS || r.compPrice === null) {
    const n = r.compCount;
    return `Price check: not enough recent sales to compare (${n === 0 ? "none" : n} found)`;
  }
  const basis = `comps say ${money(r.compPrice)} from ${r.compCount} sales at ${money(r.medianPpsf!)}/sqft`;
  if (r.listPrice === null || r.deltaPct === null) return `Price check: no list price · ${basis}`;
  const d = r.deltaPct;
  const verdict = Math.abs(d) <= IN_LINE_PCT
    ? `in line with comps (${d > 0 ? "+" : d < 0 ? "-" : ""}${pct(d)})`
    : `listed ${pct(d)} ${d > 0 ? "above" : "below"} comps`;
  return `Price check: ${verdict} · ${basis}`;
}

// "2026-08-31" minus 6 months -> "2026-02-28" (day clamped to the end of a shorter month).
export function monthsBefore(isoDay: string, months: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const total = y * 12 + (m - 1) - months;
  const ny = Math.floor(total / 12), nm = total % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function prettyDay(isoDay: string): string {
  const d = new Date(isoDay + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}