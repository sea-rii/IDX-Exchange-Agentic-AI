// Week 6 tests. They use fake embeddings and fake rows, so they need neither OpenAI nor MySQL.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildListingText, MAX_CHARS, type ListingTextRow } from "../scripts/text.ts";
import { cosine, normalize, topK } from "../scripts/vectors.ts";
import { embedTexts, estimateCost, makeBatches } from "../scripts/embed.ts";
import {
  fillVector, loadIndex, planIndex, readyIndex, saveIndex, toIndexEntry, type IndexItem, type ListingIndex,
} from "../scripts/store.ts";
import { candidateRows, describeFilters, hasHardFilters } from "../scripts/filters.ts";
import { buildIndexSourceQuery, buildListingsByIdQuery } from "../scripts/sql.ts";
import { semanticSearch, snippet, type CardRow } from "../scripts/semantic.ts";

const row = (o: Partial<ListingTextRow> = {}): ListingTextRow => ({
  L_ListingID: 101, L_Type_: "SingleFamilyResidence", L_City: "Pasadena", L_Keyword2: 3,
  LM_Dec_3: "2.00", LM_Int2_3: 1650, YearBuilt: 1924, L_SystemPrice: "1450000.00",
  AssociationFee: null, L_Remarks: "Charming craftsman\nwith  original built-ins.", ...o,
});

test("listing text follows the handbook layout on one line", () => {
  assert.equal(buildListingText(row()),
    "SingleFamilyResidence in Pasadena, CA. 3 beds, 2 baths. 1650 sq ft. Built 1924. " +
    "Price: $1,450,000. Charming craftsman with original built-ins.");
});

test("listing text skips missing fields instead of writing None", () => {
  const t = buildListingText(row({ L_Keyword2: null, LM_Dec_3: null, YearBuilt: null, L_Remarks: null }));
  assert.equal(t, "SingleFamilyResidence in Pasadena, CA. 1650 sq ft. Price: $1,450,000.");
  assert.ok(!/None|null|undefined/.test(t));
  assert.equal(buildListingText(row({ L_Type_: null, L_City: null, LM_Int2_3: null, L_SystemPrice: null,
    L_Keyword2: null, LM_Dec_3: null, YearBuilt: null, L_Remarks: "  " })), "Residential listing.");
});

test("very long descriptions are cut at 8000 characters", () => {
  assert.equal(buildListingText(row({ L_Remarks: "word ".repeat(5000) })).length, MAX_CHARS);
});

test("cosine similarity matches the math, and normalized vectors make it a dot product", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosine([1, 2, 3], [2, 4, 6]) - 1) < 1e-9);
  const a = normalize([3, 4]), b = normalize([4, 3]);
  assert.ok(Math.abs(a[0] * b[0] + a[1] * b[1] - cosine([3, 4], [4, 3])) < 1e-6);
  assert.deepEqual([...normalize([0, 0])], [0, 0]);
});

test("topK returns the highest scores first and respects candidates", () => {
  const m = new Float32Array([...normalize([1, 0]), ...normalize([0, 1]), ...normalize([1, 1])]);
  const q = normalize([1, 0.1]);
  assert.deepEqual(topK(q, m, 2, 2).map((x) => x.row), [0, 2]);
  assert.deepEqual(topK(q, m, 2, 5, [1, 2]).map((x) => x.row), [2, 1]);
  assert.equal(topK(q, m, 2, 10).length, 3);
});

test("batches stay under the item and character limits", () => {
  const texts = ["a".repeat(10), "b".repeat(10), "c".repeat(10), "d".repeat(25), "e"];
  assert.deepEqual(makeBatches(texts, 2, 1000), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(makeBatches(texts, 10, 30), [[0, 1, 2], [3, 4]]);
  assert.deepEqual(makeBatches(texts, 10, 25), [[0, 1], [2], [3], [4]]);
  assert.ok(Math.abs(estimateCost(11_000_000) - 0.22) < 1e-9);
});

function fakeResponse(status: number, body: unknown) {
  return { ok: status === 200, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

test("embedTexts sends the model and size, and puts results back in order", async () => {
  let sent: any;
  const fetchFn = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return fakeResponse(200, { data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }],
      usage: { total_tokens: 12 } });
  }) as unknown as typeof fetch;
  const r = await embedTexts(["first\nline", "second"], { apiKey: "test", dims: 2, fetchFn });
  assert.deepEqual(sent, { model: "text-embedding-3-small", input: ["first line", "second"], dimensions: 2 });
  assert.deepEqual(r.vectors, [[1, 0], [0, 1]]);
  assert.equal(r.tokens, 12);
});

test("embedTexts waits and retries on a rate limit, but not on a bad key", async () => {
  let calls = 0;
  const waits: number[] = [];
  const flaky = (async () => (++calls < 3 ? fakeResponse(429, {}) :
    fakeResponse(200, { data: [{ index: 0, embedding: [1] }] }))) as unknown as typeof fetch;
  await embedTexts(["x"], { apiKey: "t", dims: 1, fetchFn: flaky, sleep: async (ms) => { waits.push(ms); } });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);

  const badKey = (async () => fakeResponse(401, {})) as unknown as typeof fetch;
  await assert.rejects(embedTexts(["x"], { apiKey: "t", fetchFn: badKey }), /API key/);
  await assert.rejects(embedTexts(["x"], { apiKey: "" }), /OPENAI_API_KEY/);
});

const item = (id: string, o: Partial<IndexItem> = {}): IndexItem => ({
  id, hash: "h" + id, city: "Pasadena", type: "SingleFamilyResidence", price: 1_000_000,
  beds: 3, baths: 2, sqft: 1500, hoa: null, ...o,
});

test("update only re-embeds new or changed listings and drops sold ones", () => {
  const old: ListingIndex = { model: "m", dims: 2, builtAt: "", items: [item("1"), item("2"), item("3")],
    vectors: new Float32Array([1, 0, 0, 1, 0.6, 0.8]) };
  const plan = planIndex([item("1"), item("2", { hash: "changed" }), item("4")], old, "m", 2);
  assert.equal(plan.reused, 1);
  assert.deepEqual(plan.toEmbed, [1, 2]);
  assert.equal(plan.removed, 1);
  assert.deepEqual([...plan.vectors.subarray(0, 2)], [1, 0]);

  assert.equal(planIndex([item("1")], old, "m", 3).toEmbed.length, 1); // new size: embed again
});

test("a stopped build saves only finished listings, and the index loads back the same", () => {
  const plan = planIndex([item("1"), item("2"), item("3")], null, "m", 2);
  fillVector(plan, 0, [3, 4], 2);
  fillVector(plan, 2, [0, 5], 2);
  const index = readyIndex(plan, "m", 2);
  assert.deepEqual(index.items.map((i) => i.id), ["1", "3"]);
  assert.deepEqual([...index.vectors].map((x) => +x.toFixed(2)), [0.6, 0.8, 0, 1]);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emb-"));
  saveIndex(index, dir);
  const back = loadIndex(dir)!;
  assert.deepEqual(back.items, index.items);
  assert.deepEqual([...back.vectors], [...index.vectors]);
  assert.equal(loadIndex(path.join(dir, "missing")), null);
  assert.throws(() => fillVector(plan, 1, [1, 2, 3], 2), /Expected 2/);
});

test("index entries keep a hash that changes when the description changes", () => {
  const a = toIndexEntry(row(), "m", 2), b = toIndexEntry(row({ L_Remarks: "New paint." }), "m", 2);
  assert.equal(a.item.id, "101");
  assert.equal(a.item.price, 1_450_000);
  assert.notEqual(a.item.hash, b.item.hash);
  assert.equal(a.item.hash, toIndexEntry(row(), "m", 2).item.hash);
});

test("hard filters work like the Week 3 SQL, and pool or view don't count as hard filters", () => {
  const items = [item("1"), item("2", { city: "Irvine" }), item("3", { price: 2_000_000 }),
    item("4", { beds: null }), item("5", { hoa: 300, type: "Condominium" })];
  assert.deepEqual(candidateRows(items, { city: "pasadena", maxPrice: 1_500_000 }), [0, 3, 4]);
  assert.deepEqual(candidateRows(items, { beds: 3 }), [0, 1, 2, 4]);
  assert.deepEqual(candidateRows(items, { maxHoa: 400 }), [4]);
  assert.deepEqual(candidateRows(items, { type: "Condominium" }), [4]);
  assert.equal(hasHardFilters({ city: null, pool: "True", hasView: "True" }), false);
  assert.equal(describeFilters({ city: "Pasadena", maxPrice: 1_500_000, beds: 3 }),
    "Pasadena · up to $1,500,000 · 3+ beds");
});

test("SQL keeps user values in parameters", () => {
  const src = buildIndexSourceQuery("Irvine' OR '1'='1");
  assert.ok(!src.sql.includes("OR '1'"));
  assert.match(src.sql, /L_Status = 'Active' AND L_City = \?/);
  const byId = buildListingsByIdQuery(["7", "9"]);
  assert.match(byId.sql, /L_ListingID IN \(\?, \?\)/);
  assert.match(byId.sql, /L_Remarks/);
  assert.deepEqual(byId.params, ["7", "9"]);
  assert.throws(() => buildListingsByIdQuery([]));
});

test("snippet cuts long descriptions at a word", () => {
  assert.equal(snippet(null), null);
  assert.equal(snippet("Short one."), "Short one.");
  const s = snippet("Lovely ".repeat(60))!;
  assert.ok(s.length <= 203 && s.endsWith("Lovely..."));
});

// Fake embedding: counts a few words, so "craftsman" questions land near craftsman listings.
const VOCAB = ["craftsman", "mountain", "modern", "glass", "beach", "cottage", "garden", "view"];
const fakeEmbed = async (t: string) => VOCAB.map((w) => (t.toLowerCase().match(new RegExp(w, "g")) ?? []).length + 0.01);

const DESCRIPTIONS: Record<string, [string, string]> = {
  "1": ["Pasadena", "Charming craftsman with mountain view and original woodwork."],
  "2": ["Pasadena", "Modern glass box with clean lines."],
  "3": ["Irvine", "Craftsman style home with mountain views from the porch."],
  "4": ["Pasadena", "Beach cottage feel with a garden."],
  "5": ["Pasadena", "Restored craftsman, mountain views, big garden."],
  "6": ["Pasadena", "Craftsman with mountain views. (now sold)"],
};

async function fakeIndex(): Promise<ListingIndex> {
  const ids = Object.keys(DESCRIPTIONS);
  const plan = planIndex(ids.map((id) => item(id, { city: DESCRIPTIONS[id][0] })), null, "fake", VOCAB.length);
  for (const [i, id] of ids.entries()) fillVector(plan, i, await fakeEmbed(DESCRIPTIONS[id][1]), VOCAB.length);
  return readyIndex(plan, "fake", VOCAB.length);
}

const card = (id: string): CardRow => ({
  L_ListingID: Number(id), L_DisplayId: "MLS" + id, L_Address: `${id} Oak St`, L_City: DESCRIPTIONS[id][0],
  L_Zip: "91101", price: "1000000.00", beds: 3, baths: "2.00", sqft: 1500, type: "SingleFamilyResidence",
  status: "Active", lat: null, lng: null, YearBuilt: 1925, AssociationFee: null, DaysOnMarket: 8,
  PoolPrivateYN: null, ViewYN: null, FireplaceYN: null, PhotoCount: 20,
  LA1_UserFirstName: null, LA1_UserLastName: null, LO1_OrganizationName: null, L_Remarks: DESCRIPTIONS[id][1],
});

// Fake database: returns rows for the requested ids, in a shuffled order, and listing 6 is no longer active.
const fakeQuery = async <T>(_sql: string, params: (string | number)[]) =>
  params.map(String).filter((id) => id !== "6").reverse().map(card) as T[];

test("semantic search ranks by meaning, keeps the order, and skips listings no longer active", async () => {
  const out = await semanticSearch("charming craftsman with mountain views", {
    index: await fakeIndex(), embed: fakeEmbed, query: fakeQuery,
  }, { topK: 3 });
  const order = [...out.matchAll(/^\d\. (\d) Oak St/gm)].map((m) => m[1]);
  assert.deepEqual(order, ["1", "3", "5"]);
  assert.match(out, /^Top 3 active listings most similar to "charming craftsman with mountain views"/);
  assert.match(out, /compared against 6 listings/);
  assert.match(out, /Match score: 0\.\d\d/);
  assert.match(out, /"Charming craftsman with mountain view and original woodwork\."/);
  assert.ok(!out.includes("6 Oak St"));
});

test("a city in the message limits the search to that city", async () => {
  const out = await semanticSearch("craftsman with mountain views in Irvine", {
    index: await fakeIndex(), embed: fakeEmbed, query: fakeQuery,
    parse: async (t) => ({ city: /Irvine/.test(t) ? "Irvine" : null }),
  });
  assert.match(out, /Filters from your message: Irvine/);
  assert.match(out, /compared against 1 listings/);
  assert.match(out, /1\. 3 Oak St/);

  const none = await semanticSearch("craftsman in Fresno", {
    index: await fakeIndex(), embed: fakeEmbed, query: fakeQuery, parse: async () => ({ city: "Fresno" }),
  });
  assert.match(none, /^No active listings match Fresno/);
});