// Market math (handbook Week 5). No database here, so every function is easy to test.

// One sale, as it comes back from MySQL. DECIMAL columns come back as strings.
export type SoldRow = {
  closeDate: string; // "2026-08-14"
  closePrice: string | number | null;
  listPrice: string | number | null;
  livingArea: string | number | null;
  dom: string | number | null;
  subType: string | null;
  zip?: string | null;
};

export type Sale = {
  month: string; // "2026-08"
  closePrice: number | null;
  listPrice: number | null;
  livingArea: number | null;
  dom: number | null;
  subType: string | null;
  zip: string | null;
};

export type Metrics = {
  sales: number;
  medianPrice: number | null;
  avgPrice: number | null;
  medianPpsf: number | null; // price per sqft
  avgPpsf: number | null;
  medianDom: number | null;
  avgDom: number | null;
  listToClose: number | null; // close price as % of list price, averaged
  overAskingPct: number | null; // % of sales that closed above list price
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function toSale(r: SoldRow): Sale {
  return {
    month: String(r.closeDate).slice(0, 7),
    closePrice: num(r.closePrice),
    listPrice: num(r.listPrice),
    livingArea: num(r.livingArea),
    dom: num(r.dom),
    subType: r.subType ?? null,
    zip: r.zip ? String(r.zip).slice(0, 5) : null,
  };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// ---------- Months ----------

export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// The newest month that has every day in the data. If the last sale is 2026-09-17,
// September is only half there, so the latest full month is August.
export function latestFullMonth(latestDate: string): string {
  const [y, m, d] = latestDate.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const key = `${y}-${String(m).padStart(2, "0")}`;
  return d >= daysInMonth ? key : shiftMonth(key, -1);
}

// 12 full months ending at endKey, oldest first.
export function monthRange(endKey: string, count = 12): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(endKey, i - count + 1));
}

// The 24 full months ending at the latest full month (12 to report on, 12 before them for
// year over year), and the SQL date range that covers them: from <= CloseDate < to.
export function windowFor(latestDate: string) {
  const end = latestFullMonth(latestDate);
  const candidates = monthRange(end, 24);
  return { candidates, from: `${candidates[0]}-01`, to: `${shiftMonth(end, 1)}-01` };
}

// Which of the candidate months the data really covers. A month counts if the whole table
// has at least half as many sales as its busiest month. Counting back from the newest month,
// it stops at the first month that doesn't count, so a partial first month or a few sales
// with typo dates don't make the data look longer than it is.
export function coveredMonths(volume: { month: string; total: number | string }[], candidates: string[]): string[] {
  const totals = new Map(volume.map((v) => [v.month, Number(v.total)]));
  const busiest = Math.max(0, ...candidates.map((m) => totals.get(m) ?? 0));
  const covered: string[] = [];
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (busiest === 0 || (totals.get(candidates[i]) ?? 0) < busiest / 2) break;
    covered.unshift(candidates[i]);
  }
  return covered;
}

// Up to 12 months to report on, plus the 12 before them when the data goes back that far.
export function splitCovered(covered: string[]) {
  return {
    recent: covered.slice(-12),
    prior: covered.length >= 24 ? covered.slice(-24, -12) : [],
  };
}

// ---------- Metrics ----------

export function computeMetrics(sales: Sale[]): Metrics {
  const prices = sales.map((s) => s.closePrice).filter((p): p is number => p !== null && p > 0);
  const ppsf = sales
    .filter((s) => s.closePrice && s.closePrice > 0 && s.livingArea && s.livingArea > 0)
    .map((s) => s.closePrice! / s.livingArea!);
  const dom = sales.map((s) => s.dom).filter((d): d is number => d !== null && d >= 0);
  // Ratios outside 50%-200% are almost always typos in the list price, so they are skipped.
  const ratios = sales
    .filter((s) => s.closePrice && s.listPrice && s.closePrice > 0 && s.listPrice > 0)
    .map((s) => s.closePrice! / s.listPrice!)
    .filter((r) => r >= 0.5 && r <= 2);
  return {
    sales: sales.length,
    medianPrice: median(prices),
    avgPrice: mean(prices),
    medianPpsf: median(ppsf),
    avgPpsf: mean(ppsf),
    medianDom: median(dom),
    avgDom: mean(dom),
    listToClose: ratios.length ? mean(ratios)! * 100 : null,
    overAskingPct: ratios.length ? (ratios.filter((r) => r > 1).length / ratios.length) * 100 : null,
  };
}

export function inMonths(sales: Sale[], months: string[]): Sale[] {
  const set = new Set(months);
  return sales.filter((s) => set.has(s.month));
}

export function monthlyTrend(sales: Sale[], months: string[]) {
  return months.map((month) => ({ month, ...computeMetrics(sales.filter((s) => s.month === month)) }));
}

export function pctChange(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before <= 0) return null;
  return ((now - before) / before) * 100;
}

// Active listings divided by the average number of sales per month. monthCount is how many
// months the sales cover (fewer than 12 when the data is shorter than a year).
export function monthsOfSupply(activeCount: number, sales: number, monthCount: number): number | null {
  return sales > 0 && monthCount > 0 ? activeCount / (sales / monthCount) : null;
}

// Metrics for each group (ZIP or home type), biggest first.
export function breakdown(sales: Sale[], keyOf: (s: Sale) => string | null, limit = 10) {
  const groups = new Map<string, Sale[]>();
  for (const s of sales) {
    const k = keyOf(s);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({ key, ...computeMetrics(rows) }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);
}

// ---------- Market read ----------

// Three common rules of thumb. Each one that points the same way adds a point.
//   List-to-close: 100%+ favors sellers, under 98% favors buyers.
//   Months of supply: under 4 favors sellers, over 6 favors buyers.
//   Median days on market: 14 or less favors sellers, 45 or more favors buyers.
export function marketRead(m: Metrics, supply: number | null) {
  let score = 0;
  const reasons: string[] = [];
  const pct1 = (x: number) => `${x.toFixed(1)}%`;

  if (m.listToClose !== null) {
    if (m.listToClose >= 100) { score++; reasons.push(`Homes closed at ${pct1(m.listToClose)} of list price on average (100%+ favors sellers)`); }
    else if (m.listToClose < 98) { score--; reasons.push(`Homes closed at ${pct1(m.listToClose)} of list price on average (under 98% favors buyers)`); }
    else reasons.push(`Homes closed at ${pct1(m.listToClose)} of list price on average`);
  }
  if (supply !== null) {
    const s = supply.toFixed(1);
    if (supply < 4) { score++; reasons.push(`${s} months of supply (under 4 favors sellers)`); }
    else if (supply > 6) { score--; reasons.push(`${s} months of supply (over 6 favors buyers)`); }
    else reasons.push(`${s} months of supply (4 to 6 is balanced)`);
  }
  if (m.medianDom !== null) {
    const d = Math.round(m.medianDom);
    if (d <= 14) { score++; reasons.push(`Median ${d} days on market (fast)`); }
    else if (d >= 45) { score--; reasons.push(`Median ${d} days on market (slow)`); }
    else reasons.push(`Median ${d} days on market`);
  }

  if (score >= 2) return { label: "Leans seller's market", reasons,
    meaning: "Homes sell fast and close near or above asking, so buyers have less room to negotiate." };
  if (score <= -2) return { label: "Leans buyer's market", reasons,
    meaning: "Homes take longer to sell and often close under asking, so buyers have more room to negotiate." };
  return { label: "Balanced or mixed", reasons,
    meaning: "The signals don't clearly favor buyers or sellers." };
}