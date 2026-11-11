// Command-line script the OpenClaw skill runs (handbook Week 6).
//
//   node semantic-search/scripts/similar.ts "charming craftsman with mountain views and character"
//   node semantic-search/scripts/similar.ts "modern home with an open floor plan in Irvine under $2M"
//   node semantic-search/scripts/similar.ts --top 10 "quiet cottage with a big garden"
//   node semantic-search/scripts/similar.ts --no-filters "craftsman in Pasadena"   # similarity only
import { parseArgs } from "node:util";
import { query, closePool } from "../../mls-search/scripts/db.ts";
import { parsePropertyQuery } from "../../nl-property-search/scripts/parser.ts";
import { embedTexts } from "./embed.ts";
import { loadIndex } from "./store.ts";
import { semanticSearch } from "./semantic.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    top: { type: "string", default: "5" },
    "no-filters": { type: "boolean", default: false },
  },
});

const text = positionals.join(" ").trim();
if (!text) {
  console.error('Usage: node semantic-search/scripts/similar.ts [--top N] [--no-filters] "<description>"');
  process.exit(1);
}

async function main() {
  const index = loadIndex();
  if (!index || !index.items.length) {
    return "The listing index hasn't been built yet. Run: node semantic-search/scripts/build-index.ts";
  }
  return semanticSearch(text, {
    index,
    query,
    parse: values["no-filters"] ? undefined : parsePropertyQuery,
    embed: async (t) =>
      (await embedTexts([t], { model: index.model, dims: index.dims })).vectors[0],
  }, { topK: Number(values.top) });
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