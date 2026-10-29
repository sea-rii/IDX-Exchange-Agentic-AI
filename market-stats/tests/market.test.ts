// Week 5 tests. They use fake data, so MySQL doesn't need to be running.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMetrics, coveredMonths, latestFullMonth, marketRead, monthlyTrend, monthsOfSupply, pctChange,
  toSale, windowFor, type SoldRow,
} from "../scripts/stats.ts";
import { buildActiveCountQuery, buildSoldRowsQuery } from "../scripts/sql.ts";
import { buildMarketReport, resolveArea, type QueryFn } from "../scripts/report.ts";

test("latest full month skips a half month at the end of the data", () => {
  assert.equal(latestFullMonth("2026-09-17"), "2026-08");
  assert.equal(latestFullMonth("2026-08-31"), "2026-08");
  assert.equal(latestFullMonth("2024-02-29"), "2024-02");
  assert.equal(latestFullMonth("2026-01-05"), "2025-12");
});

test("window looks at up to 24 full months", () => {
  const w = windowFor("2026-09-17");
  assert.equal(w.candidates.length, 24);
  assert.equal(w.candidates[0], "2024-09");
  assert.equal(w.candidates[23], "2026-08");
  assert.equal(w.from, "2024-09-01");
  assert.equal(w.to, "2026-09-01");
});

test("covered months skip a partial first month and stray typo dates", () => {
  const candidates = windowFor("2026-09-17").candidates;
  const volume = [
    { month: "2025-01", total: 1 },   // a typo date, far from the rest
    { month: "2026-03", total: 300 }, // data starts mid-March
    { month: "2026-04", total: 800 }, { month: "2026-05", total: "780" },
    { month: "2026-06", total: 820 }, { month: "2026-07", total: 820 }, { month: "2026-08", total: 740 },
  ];
  assert.deepEqual(coveredMonths(volume, candidates), ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  assert.deepEqual(coveredMonths([], candidates), []);
});

const row = (o: Partial<SoldRow>): SoldRow => ({
  closeDate: "2026-08-10", closePrice: "1000000", listPrice: "1000000", livingArea: "1000",
  dom: 10, subType: "SingleFamilyResidence", ...o,
});

test("metrics: medians, price per sqft, DOM and list-to-close", () => {
  const m = computeMetrics([
    row({ closePrice: "900000", listPrice: "1000000", livingArea: "1500", dom: 30 }),
    row({ closePrice: "1100000", listPrice: "1000000", livingArea: "1100", dom: null }),
    row({ closePrice: "1300000", listPrice: "100000", livingArea: "0", dom: 5 }), // list price typo, no sqft
  ].map(toSale));
  assert.equal(m.sales, 3);
  assert.equal(m.medianPrice, 1_100_000);
  assert.equal(Math.round(m.medianPpsf!), 800); // (600 + 1000) / 2
  assert.equal(m.medianDom, 17.5); // null DOM is skipped
  assert.equal(m.listToClose!.toFixed(1), "100.0"); // 90% and 110%, the 1300% typo is skipped
  assert.equal(m.overAskingPct, 50);
});

test("empty months show 0 sales instead of failing", () => {
  const trend = monthlyTrend([toSale(row({}))], ["2026-07", "2026-08"]);
  assert.equal(trend[0].sales, 0);
  assert.equal(trend[0].medianPrice, null);
  assert.equal(trend[1].sales, 1);
});

test("percent change and months of supply", () => {
  assert.equal(pctChange(110, 100)!.toFixed(1), "10.0");
  assert.equal(pctChange(100, 0), null);
  assert.equal(monthsOfSupply(300, 1200, 12), 3);
  assert.equal(monthsOfSupply(300, 500, 5), 3); // 5 months of data: 100 sales a month
  assert.equal(monthsOfSupply(5, 0, 12), null);
});

test("market read leans seller, buyer or mixed", () => {
  const base = computeMetrics([]);
  assert.equal(marketRead({ ...base, listToClose: 101, medianDom: 9 }, 2.5).label, "Leans seller's market");
  assert.equal(marketRead({ ...base, listToClose: 96, medianDom: 60 }, 8).label, "Leans buyer's market");
  assert.equal(marketRead({ ...base, listToClose: 99, medianDom: 25 }, 5).label, "Balanced or mixed");
});

test("SQL keeps user text in params, and only selects PostalCode when needed", () => {
  const evil = "Irvine' OR 1=1 --";
  const q = buildSoldRowsQuery({ city: evil, zip: null, type: "Condominium" }, "2024-09-01", "2026-09-01");
  assert.ok(!q.sql.includes(evil));
  assert.deepEqual(q.params, ["2024-09-01", "2026-09-01", evil, "Condominium"]);
  assert.ok(!q.sql.includes("PostalCode"));
  assert.ok(buildSoldRowsQuery({ city: "Irvine", zip: null, type: null }, "a", "b", true).sql.includes("PostalCode AS zip"));

  const a = buildActiveCountQuery({ city: "Irvine", zip: null, type: "Condominium" });
  assert.match(a.sql, /WHERE L_City = \? AND L_Type_ = \?/);
  assert.deepEqual(a.params, ["Irvine", "Condominium"]);
});

test("reads the city, ZIP and home type from the question", async () => {
  assert.deepEqual(await resolveArea({ question: "Is now a good time to buy in San Diego?" }),
    { city: "San Diego", zip: null, type: null });
  assert.deepEqual(await resolveArea({ question: "What is the average price per sq ft in Pasadena?" }),
    { city: "Pasadena", zip: null, type: null });
  assert.deepEqual(await resolveArea({ question: "How are condos doing in Irvine?" }),
    { city: "Irvine", zip: null, type: "Condominium" });
  assert.equal((await resolveArea({ question: "How is the market in 92618?" })).zip, "92618");
  // "lots" must not become a land filter
  assert.equal((await resolveArea({ question: "Are there lots of sales in Irvine?" })).type, null);
});

// Fake database built from a list of sales. Answers the same queries the real one gets.
function fakeFrom(rows: SoldRow[], activeCount: number): QueryFn {
  return (async (sql: string) => {
    if (sql.includes("MAX(CloseDate)")) return [{ latest: "2026-09-17" }];
    if (sql.includes("rets_property")) return [{ total: activeCount }];
    if (sql.includes("GROUP BY DATE_FORMAT")) {
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.closeDate.slice(0, 7), (counts.get(r.closeDate.slice(0, 7)) ?? 0) + 1);
      return [...counts].map(([month, total]) => ({ month, total }));
    }
    if (sql.includes("closeDate")) return rows;
    return [];
  }) as QueryFn;
}

// 24 months of sales, 10 a month, prices going up 1% a month.
function fakeDb(activeCount = 200): QueryFn {
  const rows: SoldRow[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(Date.UTC(2024, 8 + i, 15)); // Sep 2024 .. Aug 2026
    const date = d.toISOString().slice(0, 10);
    for (let k = 0; k < 10; k++) {
      rows.push(row({ closeDate: date, closePrice: String(Math.round(1_000_000 * 1.01 ** i) + k * 1000),
        listPrice: String(1_000_000 * 1.01 ** i), dom: 8 + k }));
    }
  }
  rows.push(row({ closeDate: "2026-09-17", closePrice: "5000000" })); // half month, left out
  return fakeFrom(rows, activeCount);
}

test("full report for a city", async () => {
  const out = await buildMarketReport({ question: "Is now a good time to buy in San Diego?" }, fakeDb());
  assert.match(out, /^Market stats: San Diego · All residential · Sep 2025 – Aug 2026/);
  assert.match(out, /Sales: 120 · Active listings now: 200 \(20\.0 months of supply\)/);
  assert.match(out, /Median price vs the 12 months before: \+12\.\d%/);
  assert.match(out, /Aug 2026 vs Jul 2026: median price \+1\.0%/);
  assert.equal(out.split("\n").filter((l) => /^20\d\d-\d\d  /.test(l)).length, 12);
  assert.match(out, /Market read: /);
  assert.match(out, /not a forecast/);
  assert.ok(!out.includes("5,000,000")); // the September half month is not counted
});

test("short data: reports only the months it has, and months of supply uses them", async () => {
  const rows: SoldRow[] = [row({ closeDate: "2026-03-25" }), row({ closeDate: "2026-03-28" })]; // partial March
  for (const month of ["04", "05", "06", "07", "08"]) {
    for (let k = 0; k < 10; k++) rows.push(row({ closeDate: `2026-${month}-10` }));
  }
  const out = await buildMarketReport({ city: "San Diego" }, fakeFrom(rows, 20));
  assert.match(out, /Apr 2026 – Aug 2026/);
  assert.match(out, /only has full months from Apr 2026, so this covers 5 months/);
  assert.match(out, /Sales: 50 · Active listings now: 20 \(2\.0 months of supply\)/); // 20 / (50 / 5)
  assert.match(out, /5-month trend/);
  assert.doesNotMatch(out, /\b0 sales/); // no empty months
  assert.match(out, /Year over year: not enough history/);
});

test("asks for a city when there is none, and says so when there are no sales", async () => {
  assert.match(await buildMarketReport({ question: "how is the market" }, fakeDb()), /Which city/);
  const full = fakeDb();
  const noSalesHere = (async (sql: string, params?: (string | number)[]) =>
    sql.includes("closeDate") ? [] : full(sql, params)) as QueryFn; // the table has data, the city has none
  assert.match(await buildMarketReport({ city: "Nowhere" }, noSalesHere), /No residential sales found for Nowhere/);
});