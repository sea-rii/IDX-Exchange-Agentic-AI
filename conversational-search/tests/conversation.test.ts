// Week 4 tests. Each test plays a full conversation through handleMessage().
// A small fake parser and a fake listings table stand in for Week 2 and MySQL,
// so these run without the database and without OpenAI.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PropertyFilters } from "../../nl-property-search/scripts/parser.ts";
import type { ListingRow } from "../../mls-search/scripts/format.ts";
import { handleMessage, type Deps } from "../scripts/agent.ts";
import { createMemoryStore, createFileStore, getSession, SESSION_TIMEOUT_MS } from "../scripts/session.ts";
import { parseMoney, parseCityAnswer, parseType, isSkip } from "../scripts/answers.ts";

// ---------- fake Week 2 parser (only handles full sentences, like the real one) ----------
async function fakeParse(q: string): Promise<PropertyFilters> {
  const f: PropertyFilters = { city: null, minPrice: null, maxPrice: null, beds: null, baths: null,
    sqft: null, type: null, pool: null, hasView: null, maxHoa: null };
  const city = q.match(/\b(?:in|near) ([A-Z][a-z]+(?: [A-Z][a-z]+)*)/);
  if (city) f.city = city[1];
  const price = q.match(/under \$?([\d.]+)\s*(m|k)\b/i);
  if (price) f.maxPrice = Number(price[1]) * (price[2].toLowerCase() === "m" ? 1_000_000 : 1_000);
  const beds = q.match(/(\d+)\+?\s*(?:-\s*)?(?:bed|beds|bedroom|bedrooms)\b/i);
  if (beds) f.beds = Number(beds[1]);
  if (/\bcondos?\b/i.test(q)) f.type = "Condominium";
  else if (/\btownhomes?\b/i.test(q)) f.type = "Townhouse";
  else if (/\bsingle family\b|\bhouses?\b/i.test(q)) f.type = "SingleFamilyResidence";
  if (/\bwith a pool\b/i.test(q)) f.pool = "True";
  return f;
}

// ---------- fake rets_property ----------
let id = 1000;
function row(city: string, type: string, price: number, beds: number, pool = false, photos = 10): ListingRow {
  id++;
  return {
    L_ListingID: id, L_DisplayId: String(id), L_Address: `${id} Main St`, L_City: city, L_Zip: "92604",
    price: String(price), beds, baths: "2.00", sqft: 1500, type, status: "Active", lat: null, lng: null,
    YearBuilt: 1990, AssociationFee: 0, DaysOnMarket: 10, PoolPrivateYN: pool ? "True" : "False",
    ViewYN: "False", FireplaceYN: "False", PhotoCount: photos,
    LA1_UserFirstName: null, LA1_UserLastName: null, LO1_OrganizationName: null,
  };
}

const TABLE: ListingRow[] = [
  // 8 Irvine single family homes, 3+ beds, under $1.2M (2 with a pool)
  ...[900_000, 950_000, 1_000_000, 1_050_000, 1_100_000, 1_150_000, 1_180_000, 1_190_000]
    .map((p, i) => row("Irvine", "SingleFamilyResidence", p, 3 + (i % 2), i < 2, i)),
  row("Irvine", "SingleFamilyResidence", 1_500_000, 4),  // over budget
  row("Irvine", "SingleFamilyResidence", 800_000, 2),    // too few beds
  row("Irvine", "Condominium", 700_000, 3),
  row("Irvine", "Condominium", 650_000, 2, true),
  row("Tustin", "Condominium", 600_000, 2),
  row("Tustin", "Townhouse", 750_000, 3),
];

async function fakeSearch(f: Partial<PropertyFilters>, page = 1, limit = 5) {
  const rows = TABLE.filter((r) =>
    (!f.city || r.L_City === f.city) &&
    (f.maxPrice == null || Number(r.price) <= f.maxPrice) &&
    (f.minPrice == null || Number(r.price) >= f.minPrice) &&
    (f.beds == null || Number(r.beds) >= f.beds) &&
    (!f.type || r.type === f.type) &&
    (!f.pool || r.PoolPrivateYN === f.pool),
  ).sort((a, b) => Number(a.price) - Number(b.price));
  const totalPages = Math.ceil(rows.length / limit);
  return { rows: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, totalPages };
}

function chat(deps?: Partial<Deps>) {
  const d: Deps = { store: createMemoryStore(), parse: fakeParse, search: fakeSearch, ...deps };
  return { deps: d, say: (text: string, user = "user1") => handleMessage(user, text, d) };
}

const cardCount = (reply: string) => (reply.match(/^\d+\. /gm) ?? []).length;

// ---------- conversations ----------

test("handbook example: asks budget, then type, then returns results", async () => {
  const { say } = chat();
  assert.match(await say("Find homes in Irvine"), /What is your budget\?/);
  assert.match(await say("Under $1.2M"), /condo, townhome, or single family\?/);
  const r = await say("Single family with at least 3 beds");
  assert.match(r, /Single family homes in Irvine · 3\+ beds · up to \$1\.2M/);
  assert.match(r, /8 matches · page 1 of 2/);
  assert.equal(cardCount(r), 5);
  assert.match(r, /1\. 1001 Main St, Irvine 92604\n\$900,000 · 3 bd · 2 ba · 0 photos\nMLS# 1001/);
});

test("short answers work: bare city, bare price, bare type", async () => {
  const { say } = chat();
  assert.match(await say("I want to buy a home"), /Which city/);
  assert.match(await say("irvine"), /Got it: Homes in Irvine\. What is your budget\?/);
  assert.match(await say("1.2m"), /up to \$1\.2M\. Any preferences/);
  const r = await say("a house");
  assert.match(r, /Single family homes in Irvine · up to \$1\.2M\n9 matches/);
});

test("all details in the first message searches right away", async () => {
  const { say } = chat();
  const r = await say("3 bed houses in Irvine under 1.2M");
  assert.match(r, /8 matches/);
});

test("skipping a question moves to the next one", async () => {
  const { say } = chat();
  await say("Find homes in Irvine");
  assert.match(await say("no preference"), /condo, townhome, or single family\?/);
  assert.match(await say("any"), /12 matches/);
});

test('"just show me" searches with what we have', async () => {
  const { say } = chat();
  await say("Find homes in Tustin");
  assert.match(await say("just show me"), /Homes in Tustin\n2 matches/);
});

test("after results, a new detail refines the same search", async () => {
  const { say } = chat();
  await say("3 bed houses in Irvine under 1.2M");
  const r = await say("only ones with a pool");
  assert.match(r, /Single family homes in Irvine · 3\+ beds · up to \$1\.2M · with a pool\n2 matches/);
  const r2 = await say("actually under 950k");
  assert.match(r2, /up to \$950K · with a pool\n2 matches/);
});

test('"more" shows the next page and stops at the last page', async () => {
  const { say } = chat();
  await say("3 bed houses in Irvine under 1.2M");
  const r = await say("more");
  assert.match(r, /page 2 of 2/);
  assert.equal(cardCount(r), 3);
  assert.match(r, /^6\. /m); // numbering continues from page 1
  const last = await say("more");
  assert.match(last, /That's all 8 results/);
  assert.doesNotMatch(last, /"more"/);
});

test('"start over" clears filters, and can start a new search in the same message', async () => {
  const { say, deps } = chat();
  await say("3 bed houses in Irvine under 1.2M");
  assert.match(await say("start over"), /starting a new search\. Which city/);
  assert.equal(getSession(deps.store, "user1").city, undefined);
  const r = await say("start over, condos in Tustin");
  assert.match(r, /Got it: Condos in Tustin\. What is your budget\?/);
});

test("a city with no listings is not saved", async () => {
  const { say, deps } = chat();
  assert.match(await say("homes in Irvin"), /don't have any active listings in Irvin/);
  assert.equal(getSession(deps.store, "user1").city, undefined);
  assert.match(await say("Irvine"), /Got it: Homes in Irvine/);
});

test('"what about Tustin" switches city and keeps the other filters', async () => {
  const { say } = chat();
  await say("condos in Irvine under 1.2M");
  const r = await say("what about Tustin?");
  assert.match(r, /Condos in Tustin · up to \$1\.2M\n1 match /);
});

test('"any price" removes the budget', async () => {
  const { say } = chat();
  await say("3 bed houses in Irvine under 1.2M");
  assert.match(await say("any price"), /Single family homes in Irvine · 3\+ beds\n9 matches/);
});

test("no matches gives a clear message", async () => {
  const { say } = chat();
  await say("condos in Tustin under 100k");
  const r = await say("just show me");
  assert.match(r, /No active listings match: Condos in Tustin · up to \$100K/);
});

test("messages it can't read get the question again", async () => {
  const { say } = chat();
  await say("Find homes in Irvine");
  assert.match(await say("hmm let me think about it"), /didn't catch that\. What is your budget\?/);
});

test("each user has their own session", async () => {
  const { say } = chat();
  await say("Find homes in Irvine", "+15550001");
  await say("Find homes in Tustin", "+15550002");
  assert.match(await say("just show me", "+15550001"), /Homes in Irvine/);
  assert.match(await say("just show me", "+15550002"), /Homes in Tustin/);
});

test("a session older than 30 minutes starts fresh", () => {
  const store = createMemoryStore();
  store.set("u", { city: "Irvine", conversationStep: 3, asked: [], searched: true, page: 1,
    updatedAt: Date.now() - SESSION_TIMEOUT_MS - 1 });
  assert.equal(getSession(store, "u").city, undefined);
});

test("file store keeps the session between separate runs", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-"));
  const run = (text: string) =>
    handleMessage("+15551234567", text, { store: createFileStore(dir), parse: fakeParse, search: fakeSearch });
  await run("Find homes in Irvine");
  await run("Under $1.2M");
  assert.match(await run("Single family with at least 3 beds"), /8 matches/);
  assert.ok(!fs.readdirSync(dir)[0].includes("5551234567")); // phone number is not the file name
  fs.rmSync(dir, { recursive: true });
});

test("a filter given while we wait for the city is kept, not read as a city", async () => {
  const { say, deps } = chat();
  assert.match(await say("Under $1.2M"), /Got it: Homes · up to \$1\.2M\. Which city/);
  assert.match(await say("with a pool"), /Got it: Homes · up to \$1\.2M · with a pool\. Which city/);
  assert.equal(getSession(deps.store, "user1").city, undefined);
  assert.match(await say("Irvine"), /Got it: Homes in Irvine · up to \$1\.2M · with a pool\. Any preferences/);
});

test('a tiny price from "at least 3 beds" is dropped', async () => {
  // Same mistake the real Week 2 parser makes: "at least 3" also becomes minPrice 3.
  const parse = async (q: string) => ({ ...(await fakeParse(q)), ...(/at least 3 beds/.test(q) ? { minPrice: 3 } : {}) });
  const { say } = chat({ parse });
  await say("Find homes in Irvine");
  await say("Under $1.2M");
  const r = await say("Single family with at least 3 beds");
  assert.match(r, /Single family homes in Irvine · 3\+ beds · up to \$1\.2M\n8 matches/);
});

test("short answer readers", () => {
  assert.equal(parseMoney("1.2M"), 1_200_000);
  assert.equal(parseMoney("under $900k"), 900_000);
  assert.equal(parseMoney("1,250,000"), 1_250_000);
  assert.equal(parseMoney("1.5 million"), 1_500_000);
  assert.equal(parseMoney("3 beds under 800k"), 800_000);
  assert.equal(parseMoney("3"), null);
  assert.equal(parseCityAnswer("newport beach"), "Newport Beach");
  assert.equal(parseCityAnswer("in irvine, CA"), "Irvine");
  assert.equal(parseCityAnswer("any"), null);
  assert.equal(parseCityAnswer("a condo"), null);
  assert.equal(parseCityAnswer("with a pool"), null);
  assert.equal(parseCityAnswer("3 beds"), null);
  assert.equal(parseType("townhouse"), "Townhouse");
  assert.equal(parseType("single-family"), "SingleFamilyResidence");
  assert.ok(isSkip("Doesn't matter"));
  assert.ok(!isSkip("under 1M"));
});