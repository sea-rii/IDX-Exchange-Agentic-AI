// Week 3 tests. These check the SQL builder and the property cards, so they run without MySQL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildActiveListingsQuery, buildActiveCountQuery, buildSoldCompsQuery, toPaging } from "../scripts/sql.ts";
import { formatListingCard, formatSoldCard, summarizeComps, type ListingRow, type SoldRow } from "../scripts/format.ts";

const empty = { city: null, minPrice: null, maxPrice: null, beds: null, baths: null,
  sqft: null, type: null, pool: null, hasView: null, maxHoa: null };

test("no filters returns only active listings", () => {
  const { sql, params } = buildActiveListingsQuery(empty);
  assert.match(sql, /WHERE L_Status = 'Active'\s+ORDER BY/);
  assert.deepEqual(params, []);
});

test("each filter adds one condition and one parameter, in order", () => {
  const { sql, params } = buildActiveListingsQuery({
    ...empty, city: "Irvine", maxPrice: 1500000, beds: 3, type: "Condominium", pool: "True",
  });
  assert.match(sql, /L_City = \? AND L_SystemPrice <= \? AND L_Keyword2 >= \? AND L_Type_ = \? AND PoolPrivateYN = \?/);
  assert.deepEqual(params, ["Irvine", 1500000, 3, "Condominium", "True"]);
});

test("filters the handbook skipped (min price, HOA) are included", () => {
  const { sql, params } = buildActiveListingsQuery({ ...empty, minPrice: 800000, maxHoa: 400 });
  assert.match(sql, /L_SystemPrice >= \?/);
  assert.match(sql, /AssociationFee <= \?/);
  assert.deepEqual(params, [800000, 400]);
});

test("user text never ends up inside the SQL string", () => {
  const sneaky = "Irvine' OR '1'='1";
  const { sql, params } = buildActiveListingsQuery({ ...empty, city: sneaky });
  assert.ok(!sql.includes(sneaky));
  assert.deepEqual(params, [sneaky]);
});

test("page 3 with 10 per page skips the first 20 rows", () => {
  const { sql } = buildActiveListingsQuery(empty, 3, 10);
  assert.match(sql, /LIMIT 10 OFFSET 20$/);
});

test("bad paging values are clamped to a safe range", () => {
  assert.deepEqual(toPaging(-4, 1000), { page: 1, limit: 25, offset: 0 });
  assert.deepEqual(toPaging("abc", "xyz"), { page: 1, limit: 10, offset: 0 });
  assert.deepEqual(toPaging(2.7, 5), { page: 2, limit: 5, offset: 5 });
});

test("count query uses the same filters without paging", () => {
  const { sql, params } = buildActiveCountQuery({ ...empty, city: "Pasadena", beds: 4 });
  assert.match(sql, /^SELECT COUNT\(\*\) AS total FROM rets_property WHERE L_Status = 'Active' AND L_City = \? AND L_Keyword2 >= \?$/);
  assert.ok(!/LIMIT/.test(sql));
  assert.deepEqual(params, ["Pasadena", 4]);
});

test("sold comps take the city as a parameter and keep months in range", () => {
  const a = buildSoldCompsQuery("Pasadena", 6);
  assert.deepEqual(a.params, ["Pasadena"]);
  assert.match(a.sql, /INTERVAL 6 MONTH/);
  assert.match(buildSoldCompsQuery("Pasadena", 999).sql, /INTERVAL 60 MONTH/);
});

const listing: ListingRow = {
  L_ListingID: 1001, L_DisplayId: "OC26123456", L_Address: "24 Willow Bend", L_City: "Irvine",
  L_Zip: "92618", price: "1249000.00", beds: 3, baths: "2.50", sqft: 1850, type: "Condominium",
  status: "Active", lat: null, lng: null, YearBuilt: 2008, AssociationFee: "385.00", DaysOnMarket: 12,
  PoolPrivateYN: "True", ViewYN: "False", FireplaceYN: "1", PhotoCount: 30,
  LA1_UserFirstName: "Maria", LA1_UserLastName: "Lopez", LO1_OrganizationName: "Coastal Homes Realty",
};

test("listing card shows price, size, features and agent", () => {
  const card = formatListingCard(listing, 1);
  assert.equal(card, [
    "1. 24 Willow Bend, Irvine 92618",
    "$1,249,000 · 3 bd · 2.5 ba · 1,850 sqft",
    "Condominium · Built 2008 · HOA $385/mo · 12 days on market",
    "Pool · Fireplace",
    "Agent: Maria Lopez · Coastal Homes Realty",
    "MLS# OC26123456",
  ].join("\n"));
});

test("listing card skips lines that have no data", () => {
  const card = formatListingCard({ ...listing, PoolPrivateYN: null, FireplaceYN: null,
    AssociationFee: null, LA1_UserFirstName: null, LA1_UserLastName: null, LO1_OrganizationName: null });
  assert.ok(!card.includes("Pool"));
  assert.ok(!card.includes("HOA"));
  assert.ok(!card.includes("Agent"));
  assert.equal(card.split("\n").length, 4);
});

const sold: SoldRow = {
  ListingKey: "S1", UnparsedAddress: "1180 Oak Knoll Ave", City: "Pasadena",
  CloseDate: new Date("2026-08-14T00:00:00Z"), ClosePrice: "1325000", OriginalListPrice: "1299000",
  ListPrice: "1250000", DaysOnMarket: 9, BedroomsTotal: 3, BathroomsTotalInteger: 2, LivingArea: "1650",
  PropertyType: "Residential", PropertySubType: "SingleFamilyResidence", YearBuilt: 1948,
  ListAgentFullName: "Daniel Kim", ListOfficeName: "Foothill Realty", BuyerOfficeName: "Arroyo Partners",
};

test("sold card compares close price to list price", () => {
  const card = formatSoldCard(sold, 1);
  assert.match(card, /Sold \$1,325,000 · 2026-08-14 · 6% over list/);
  assert.match(card, /3 bd · 2 ba · 1,650 sqft · SingleFamilyResidence/);
});

test("comps summary gives the median price and price per sqft", () => {
  const rows = [sold, { ...sold, ClosePrice: "900000", LivingArea: "1500" }, { ...sold, ClosePrice: "1100000", LivingArea: "1100" }];
  assert.equal(summarizeComps(rows), "3 sales · median $1,100,000 · median $803/sqft");
});