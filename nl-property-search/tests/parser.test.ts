import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePropertyQuery, toDbFilters, type PropertyFilters } from "../scripts/parser.ts";

const EMPTY: PropertyFilters = {
  city: null, minPrice: null, maxPrice: null, beds: null, baths: null,
  sqft: null, type: null, pool: null, hasView: null, maxHoa: null,
};

const cases: [string, Partial<PropertyFilters>][] = [
  // 1. Basic search
  ["I am a first time buyer looking for a 2 bedroom condo in Sacramento under 450k",
    { city: "Sacramento", maxPrice: 450_000, beds: 2, type: "Condominium" }],
  // 2. Two sentences, two-word city, "views", "my budget is"
  ["I am moving for work. Are there any townhomes in Santa Cruz with ocean views? My budget is 1.3M",
    { city: "Santa Cruz", maxPrice: 1_300_000, type: "Townhouse", hasView: "True" }],
  // 3. Beds, baths, and minimum square feet
  ["I need a 4 bed 3 bath house in Fresno with at least 2200 sq ft",
    { city: "Fresno", beds: 4, baths: 3, sqft: 2200, type: "SingleFamilyResidence" }],
  // 4. Number written as a word, filters in a different order
  ["One bedroom is fine. I just want a condo in Long Beach under 500k",
    { city: "Long Beach", maxPrice: 500_000, beds: 1, type: "Condominium" }],
  // 5. "nothing over 700k" is a max price, not a min
  ["My parents are retiring and want a single family home in Palm Springs, nothing over 700k",
    { city: "Palm Springs", maxPrice: 700_000, type: "SingleFamilyResidence" }],
  // 6. "near" instead of "in", HOA per month (not read as the house price)
  ["Looking for a 1 bedroom condo near Oakland with HOA under $350 a month",
    { city: "Oakland", beds: 1, type: "Condominium", maxHoa: 350 }],
  // 7. HOA and price in the same message, "can't be more than"
  ["Show me condos in Chula Vista under 600k, and the HOA can't be more than 300",
    { city: "Chula Vista", maxPrice: 600_000, type: "Condominium", maxHoa: 300 }],
  // 8. Price range, no property type
  ["What is available between 550k and 750k in Bakersfield?",
    { city: "Bakersfield", minPrice: 550_000, maxPrice: 750_000 }],
  // 9. Range where only the second number has a suffix
  ["I want a 3 bedroom house in Rancho Cucamonga between 800 and 950k",
    { city: "Rancho Cucamonga", beds: 3, type: "SingleFamilyResidence", minPrice: 800_000, maxPrice: 950_000 }],
  // 10. "don't need a pool" must not set pool
  ["We have a dog, so we need a 3 bed house in Santa Rosa. We don't need a pool.",
    { city: "Santa Rosa", beds: 3, type: "SingleFamilyResidence" }],
  // 11. "review" is not a view, city stops at "Davis"
  ["I am a grad student. Send me condos in Davis so I can review them with my roommate",
    { city: "Davis", type: "Condominium" }],
  // 12. Numbers written as words, three-word city
  ["Two bedroom, two bath townhouse in San Luis Obispo",
    { city: "San Luis Obispo", beds: 2, baths: 2, type: "Townhouse" }],
  // 13. Land ("vacant lots")
  ["Are there any vacant lots in Redding under 120k? I want to build on it.",
    { city: "Redding", maxPrice: 120_000, type: "UnimprovedLand" }],
  // 14. Many filters at once
  ["We are a big family. Looking for a 6 bed home in Murrieta with a mountain view, a pool, and 3500+ sqft",
    { city: "Murrieta", beds: 6, sqft: 3500, pool: "True", hasView: "True" }],
  // 15. Nothing to filter on -> every field null
  ["I just moved to California and I am not sure what I am looking for yet", {}],
];

for (const [query, expected] of cases) {
  test(query, async () => {
    assert.deepEqual(await parsePropertyQuery(query), { ...EMPTY, ...expected });
  });
}

test("toDbFilters maps to rets_property columns and drops nulls", async () => {
  const f = await parsePropertyQuery("Looking for a 1 bedroom condo near Oakland with HOA under $350 a month");
  assert.deepEqual(toDbFilters(f), [
    { column: "L_City", op: "=", value: "Oakland" },
    { column: "L_Keyword2", op: ">=", value: 1 },
    { column: "L_Type_", op: "=", value: "Condominium" },
    { column: "AssociationFee", op: "<=", value: 350 },
  ]);
});