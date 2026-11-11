// Builds (or updates) the embedding index for active listings. Run this once, then again
// whenever the MLS data changes. Only new or changed listings are sent to OpenAI.
//
//   node semantic-search/scripts/build-index.ts --dry-run        # cost estimate only, no API calls
//   node semantic-search/scripts/build-index.ts --city Pasadena  # small test index, one city
//   node semantic-search/scripts/build-index.ts                  # every active listing
//   node semantic-search/scripts/build-index.ts --rebuild        # ignore the saved index
import { parseArgs } from "node:util";
import { query, closePool } from "../../mls-search/scripts/db.ts";
import { buildIndexSourceQuery } from "./sql.ts";
import type { ListingTextRow } from "./text.ts";
import { EMBED_DIMS, EMBED_MODEL, embedTexts, estimateCost, estimateTokens, makeBatches } from "./embed.ts";
import { fillVector, loadIndex, planIndex, readyIndex, saveIndex, toIndexEntry } from "./store.ts";

const { values } = parseArgs({
  options: {
    city: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    rebuild: { type: "boolean", default: false },
  },
});

const SAVE_EVERY = 20; // batches between saves, so a stopped run keeps its progress

async function main() {
  const source = buildIndexSourceQuery(values.city);
  const rows = await query<ListingTextRow>(source.sql, source.params);
  await closePool();
  if (!rows.length) {
    console.log(values.city ? `No active listings in ${values.city}.` : "No active listings found.");
    return;
  }

  const entries = rows.map((r) => toIndexEntry(r, EMBED_MODEL, EMBED_DIMS));
  const old = values.rebuild ? null : loadIndex();
  const plan = planIndex(entries.map((e) => e.item), old, EMBED_MODEL, EMBED_DIMS);
  const texts = plan.toEmbed.map((pos) => entries[pos].text);
  const tokens = estimateTokens(texts);

  console.log(`${rows.length.toLocaleString("en-US")} active listings${values.city ? ` in ${values.city}` : ""}`);
  console.log(`  ${plan.reused.toLocaleString("en-US")} unchanged (kept), ` +
    `${plan.toEmbed.length.toLocaleString("en-US")} to embed, ${plan.removed.toLocaleString("en-US")} removed`);
  console.log(`  About ${tokens.toLocaleString("en-US")} tokens, about $${estimateCost(tokens).toFixed(2)} ` +
    `with ${EMBED_MODEL} (${EMBED_DIMS} dimensions)`);

  if (values["dry-run"]) {
    console.log("Dry run: nothing was sent to OpenAI.");
    return;
  }

  const batches = makeBatches(texts);
  let usedTokens = 0;
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const { vectors, tokens: t } = await embedTexts(batch.map((i) => texts[i]));
    batch.forEach((i, j) => fillVector(plan, plan.toEmbed[i], vectors[j], EMBED_DIMS));
    usedTokens += t;
    console.log(`  Batch ${b + 1}/${batches.length} done (${batch.length} listings)`);
    if ((b + 1) % SAVE_EVERY === 0) saveIndex(readyIndex(plan, EMBED_MODEL, EMBED_DIMS));
  }

  const index = readyIndex(plan, EMBED_MODEL, EMBED_DIMS);
  saveIndex(index);
  console.log(`Saved ${index.items.length.toLocaleString("en-US")} listings to data/embeddings/ ` +
    `(${usedTokens.toLocaleString("en-US")} tokens, about $${estimateCost(usedTokens).toFixed(2)})`);
}

try {
  await main();
} catch (err) {
  const e = err as { code?: string; message?: string };
  if (e.code === "ECONNREFUSED") console.error("Can't reach MySQL. Is it running? Try: brew services start mysql");
  else if (e.code === "ER_ACCESS_DENIED_ERROR") console.error("MySQL login failed. Check MYSQL_USER and MYSQL_PASSWORD in .env");
  else console.error("Error:", e.message);
  process.exitCode = 1;
} finally {
  await closePool();
}