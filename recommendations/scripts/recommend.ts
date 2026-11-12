// Command the recommendation skill runs.
//
//   node recommendations/scripts/recommend.ts "OC26123456"
//   node recommendations/scripts/recommend.ts "MLS# OC26123456"
//   node recommendations/scripts/recommend.ts "24 Willow Bend, Irvine"
//   node recommendations/scripts/recommend.ts --top 10 "OC26123456"
//   node recommendations/scripts/recommend.ts --any-type "OC26123456"   # also compare other home types
import { parseArgs } from "node:util";
import { query, closePool } from "../../mls-search/scripts/db.ts";
import { loadIndex } from "../../semantic-search/scripts/store.ts";
import { recommend } from "./engine.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    top: { type: "string", default: "5" },
    "any-type": { type: "boolean", default: false },
  },
});

const text = positionals.join(" ").trim();
if (!text) {
  console.error('Usage: node recommendations/scripts/recommend.ts [--top N] [--any-type] "<MLS# or address>"');
  process.exit(1);
}

async function main() {
  const index = loadIndex();
  if (!index || !index.items.length) {
    return "The listing index hasn't been built yet. Run: node semantic-search/scripts/build-index.ts";
  }
  return recommend(text, { index, query }, { topK: Number(values.top), sameType: !values["any-type"] });
}

try {
  console.log(await main());
} catch (err) {
  const e = err as { code?: string; message?: string };
  if (e.code === "ECONNREFUSED") console.error("Can't reach MySQL. Is it running? Try: brew services start mysql");
  else if (e.code === "ER_ACCESS_DENIED_ERROR") console.error("MySQL login failed. Check MYSQL_USER and MYSQL_PASSWORD in .env");
  else console.error("Error:", e.message);
  process.exitCode = 1;
} finally {
  await closePool();
}