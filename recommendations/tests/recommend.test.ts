// Week 7 tests. They use a small fake index and fake rows, so they need neither OpenAI nor MySQL.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { IndexItem, ListingIndex } from "../../semantic-search/scripts/store.ts";
import { normalize } from "../../semantic-search/scripts/vectors.ts";
import type { ListingRow } from "../../mls-search/scripts/format.ts";
import { calculateSimilarityScore, pricePoints, rankSimilar, sizePoints } from "../scripts/score.ts";
import { assessPrice, formatPriceCheck, median, monthsBefore } from "../scripts/comps.ts";
import { buildCompsQuery, buildTargetByAddressQuery, likeText } from "../scripts/sql.ts";
import { parseTarget, recommend, type QueryFn } from "../scripts/engine.ts";

const item = (id: string, o: Partial<IndexItem> = {}): IndexItem => ({
  id, hash: "h" + id, city: "Pasadena", type: "SingleFamilyResidence", price: 1_000_000,
  beds: 3, baths: 2, sqft: 2000, hoa: null, ...o,
});

function makeIndex(entries: [IndexItem, number[]][]): ListingIndex {
  const dims = entries[0][1].length;
  const vectors = new Float32Array(entries.length * dims);
  entries.forEach(([, v], i) => vectors.set(normalize(v), i * dims));
  return { model: "m", dims, builtAt: "", items: entries.map(([it]) => it), vectors };
}

test("price steps match the handbook for a $1M home and scale with price", () => {
  assert.equal(pricePoints(1_000_000, 1_040_000), 20); // $40k  (< $50k)
  assert.equal(pricePoints(1_000_000, 1_100_000), 12); // $100k (< $150k)
  assert.equal(pricePoints(1_000_000, 750_000), 5); // $250k (< $300k)
  assert.equal(pricePoints(1_000_000, 1_400_000), 0);
  assert.equal(pricePoints(400_000, 440_000), 12); // $40k is 10% of a $400k condo
  assert.equal(pricePoints(null, 500_000), 0);
});

test("size steps are about 300 / 700 sqft on a 2,000 sqft home", () => {
  assert.equal(sizePoints(2000, 2250), 10);
  assert.equal(sizePoints(2000, 2600), 5);
  assert.equal(sizePoints(2000, 3000), 0);
  assert.equal(sizePoints(2000, null), 0);
});

test("the hybrid score adds up to 100 for an identical listing", () => {
  const p = calculateSimilarityScore(item("1"), item("2"), 1);
  assert.deepEqual(p, { price: 20, beds: 15, city: 15, size: 10, style: 40, total: 100 });
  const q = calculateSimilarityScore(item("1"), item("2", { city: "irvine", beds: null, price: null }), 0.5);
  assert.deepEqual(q, { price: 0, beds: 0, city: 0, size: 10, style: 20, total: 30 });
  assert.equal(calculateSimilarityScore(item("1"), item("2"), -0.3).style, 0);
});

test("ranking skips the liked listing and other home types", () => {
  const index = makeIndex([
    [item("T"), [1, 0, 0]],
    [item("A"), [0.9, 0.1, 0]], // close in every way
    [item("B", { city: "Irvine" }), [0.95, 0.05, 0]], // closer text, but another city
    [item("C", { type: "Condominium" }), [1, 0, 0]], // identical text, but a condo
    [item("D", { price: 2_000_000 }), [0, 1, 0]],
  ]);
  const ids = (k: number, sameType = true) => rankSimilar(index, 0, { k, sameType }).map((r) => index.items[r.row].id);
  assert.deepEqual(ids(10), ["A", "B", "D"]);
  assert.deepEqual(ids(1, false), ["C"]);
});

test("comp check uses the median $/sqft and the handbook delta formula", () => {
  const sales = [
    { ClosePrice: "1000000", LivingArea: "2000" }, // 500
    { ClosePrice: 1_100_000, LivingArea: 2000 }, // 550
    { ClosePrice: 1_200_000, LivingArea: 2000 }, // 600
    { ClosePrice: 1, LivingArea: 2000 }, // typo sale, median ignores it
    { ClosePrice: 1_300_000, LivingArea: null }, // no size, skipped
  ];
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
  const r = assessPrice(1_100_000, 2000, sales);
  assert.equal(r.compCount, 4);
  assert.equal(r.medianPpsf, 525);
  assert.equal(r.compPrice, 1_050_000);
  assert.equal(r.deltaPct, 4.8);
  assert.match(formatPriceCheck(r, 2000), /in line with comps \(\+4\.8%\) · comps say \$1,050,000 from 4 sales at \$525\/sqft/);
  assert.match(formatPriceCheck(assessPrice(1_260_000, 2000, sales), 2000), /listed 20\.0% above comps/);
  assert.match(formatPriceCheck(assessPrice(900_000, 2000, sales), 2000), /listed 14\.3% below comps/);
});

test("comp check says so when there are too few sales or no size", () => {
  const one = [{ ClosePrice: 1_000_000, LivingArea: 2000 }];
  assert.equal(assessPrice(1_000_000, 2000, one).compPrice, null);
  assert.match(formatPriceCheck(assessPrice(1_000_000, 2000, one), 2000), /not enough recent sales.*1 found/);
  assert.match(formatPriceCheck(assessPrice(1_000_000, 2000, []), 2000), /none found/);
  assert.match(formatPriceCheck(assessPrice(1_000_000, null, one), null), /no square footage/);
});

test("comp window counts back from the newest sale", () => {
  assert.equal(monthsBefore("2026-08-31", 6), "2026-02-28");
  assert.equal(monthsBefore("2026-03-15", 6), "2025-09-15");
});

test("comps SQL filters city, home type, size band and dates with parameters", () => {
  const q = buildCompsQuery({ city: "Pasadena", type: "Condominium", sqft: 1000, from: "2026-03-01", to: "2026-08-31", band: 0.2 });
  assert.match(q.sql, /PropertySubType = \?/);
  assert.deepEqual(q.params, ["Pasadena", "Condominium", 800, 1200, "2026-03-01", "2026-08-31"]);
  const noType = buildCompsQuery({ city: "Pasadena", type: null, sqft: 1000, from: "a", to: "b", band: 0.2 });
  assert.ok(!noType.sql.includes("PropertySubType"));
  assert.equal(noType.params.length, 5);
});

test("addresses are matched as plain text", () => {
  assert.equal(likeText("100%_St"), "%100\\%\\_St%");
  const q = buildTargetByAddressQuery("24 Willow Bend", "Irvine");
  assert.deepEqual(q.params, ["%24 Willow Bend%", "%Irvine%"]);
});

test("input is read as an MLS number or an address", () => {
  assert.deepEqual(parseTarget("MLS# OC26123456"), { kind: "id", id: "OC26123456" });
  assert.deepEqual(parseTarget("OC26123456"), { kind: "id", id: "OC26123456" });
  assert.deepEqual(parseTarget("8123456"), { kind: "id", id: "8123456" });
  assert.deepEqual(parseTarget("24 Willow Bend, Irvine, CA 92618"), { kind: "address", street: "24 Willow Bend", city: "Irvine" });
  assert.deepEqual(parseTarget("24 Willow Bend"), { kind: "address", street: "24 Willow Bend", city: null });
  assert.equal(parseTarget("  "), null);
});

// ---- end to end with a fake database ----

const card = (id: string, o: Partial<ListingRow> = {}): ListingRow => ({
  L_ListingID: id, L_DisplayId: "PF" + id, L_Address: `${id} Oak Ave`, L_City: "Pasadena", L_Zip: "91101",
  price: "1000000.00", beds: 3, baths: "2.00", sqft: 2000, type: "SingleFamilyResidence", status: "Active",
  lat: null, lng: null, YearBuilt: 1925, AssociationFee: null, DaysOnMarket: 10, PoolPrivateYN: null,
  ViewYN: null, FireplaceYN: null, PhotoCount: 20, LA1_UserFirstName: null, LA1_UserLastName: null,
  LO1_OrganizationName: null, ...o,
});

function fakeDb(rows: Record<string, ListingRow>, opts: { latest?: string | null; sales?: number } = {}) {
  const calls: string[] = [];
  const query = (async (sql: string, params: (string | number)[]) => {
    calls.push(sql);
    if (sql.includes("MAX(CloseDate)")) return [{ latest: opts.latest === undefined ? "2026-08-31" : opts.latest }];
    if (sql.includes("FROM california_sold")) {
      return Array.from({ length: opts.sales ?? 5 }, () => ({ ClosePrice: 1_000_000, LivingArea: 2000 }));
    }
    if (sql.includes("L_ListingID IN")) return params.map((p) => rows[String(p)]).filter(Boolean);
    if (sql.includes("L_DisplayId = ?")) return Object.values(rows).filter((r) => r.L_DisplayId === params[0]);
    if (sql.includes("L_Address LIKE")) return Object.values(rows).filter((r) => r.L_Address?.includes("Oak"));
    return [];
  }) as QueryFn;
  return { query, calls };
}

const index = makeIndex([
  [item("1"), [1, 0, 0]],
  [item("2"), [0.9, 0.2, 0]],
  [item("3", { price: 1_200_000 }), [0.8, 0.3, 0]],
  [item("4"), [0.95, 0.1, 0]], // same address as 1 (relisted), should be skipped
  [item("5"), [0.7, 0.4, 0]], // no longer active, not returned by the database
]);
const rows = {
  "1": card("1"), "2": card("2", { price: "1050000.00" }), "3": card("3", { price: 1_200_000 }),
  "4": card("4", { L_Address: "1 Oak Ave" }),
};

test("recommend shows the liked listing, ranked picks and a price check for each", async () => {
  const { query } = fakeDb(rows);
  const out = await recommend("MLS# PF1", { index, query }, { topK: 5 });
  assert.match(out, /^Because you liked:\n1 Oak Ave, Pasadena 91101/);
  assert.match(out, /2 similar active listings:/);
  assert.ok(out.indexOf("1. 2 Oak Ave") < out.indexOf("2. 3 Oak Ave"));
  assert.ok(!out.includes("4 Oak Ave") && !out.includes("5 Oak Ave"));
  assert.match(out, /Similarity \d+\/100: price 20\/20 · beds 15\/15 · city 15\/15 · size 10\/10/);
  assert.match(out, /in line with comps \(\+5\.0%\) · comps say \$1,000,000 from 5 sales at \$500\/sqft/);
  assert.match(out, /listed 20\.0% above comps/);
  assert.match(out, /closed Feb 28, 2026 – Aug 31, 2026\./);
});

test("recommend explains missing listings, several matches and missing sales data", async () => {
  const { query } = fakeDb(rows);
  assert.match(await recommend("MLS# NOPE1", { index, query }), /couldn't find an active listing with MLS# NOPE1/);
  assert.match(await recommend("Oak Ave, Pasadena", { index, query }), /Which one do you mean\?\n\n1\. MLS# PF1/);

  const notIndexed = { ...rows, "9": card("9") };
  assert.match(await recommend("MLS# PF9", { index, query: fakeDb(notIndexed).query }), /isn't in the embedding index/);

  const noSales = await recommend("MLS# PF1", { index, query: fakeDb(rows, { latest: null }).query });
  assert.match(noSales, /Price check: no sales data available/);
  assert.ok(!noSales.includes("Comps are"));

  const thin = await recommend("MLS# PF1", { index, query: fakeDb(rows, { sales: 2 }).query });
  assert.match(thin, /not enough recent sales to compare \(2 found\)/);
});