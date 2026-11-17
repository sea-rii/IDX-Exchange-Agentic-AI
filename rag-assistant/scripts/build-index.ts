// Builds the RAG index from the documents in data/rag-sources/.
//
//   node rag-assistant/scripts/build-index.ts --dry-run   # chunk count and cost, nothing sent
//   node rag-assistant/scripts/build-index.ts             # embed new or changed chunks
//   node rag-assistant/scripts/build-index.ts --rebuild   # embed everything again
import { parseArgs } from "node:util";
import {
  EMBED_DIMS, EMBED_MODEL, embedTexts, estimateCost, estimateTokens, makeBatches,
} from "../../semantic-search/scripts/embed.ts";
import { chunkDoc, embedText } from "./chunk.ts";
import { loadSources, SOURCES_DIR } from "./sources.ts";
import { loadIndex, normalize, planIndex, saveIndex, type IndexedChunk } from "./store.ts";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    rebuild: { type: "boolean", default: false },
  },
});

const docs = loadSources();
if (!docs.length) {
  console.error(`No .md or .txt files in ${SOURCES_DIR}. Add the source documents first.`);
  process.exit(1);
}

const chunks = docs.flatMap((d) => chunkDoc(d));
console.log("Documents:");
for (const d of docs) {
  console.log(`  ${d.file.padEnd(28)} ${String(chunks.filter((c) => c.source === d.title).length).padStart(4)} chunks · ${d.title}`);
}

const old = values.rebuild ? null : loadIndex();
const plan = planIndex(chunks, old, EMBED_MODEL, EMBED_DIMS);
const texts = plan.toEmbed.map((i) => embedText(plan.chunks[i]));
const estTokens = estimateTokens(texts);
console.log(`\n${chunks.length} chunks: ${plan.reused.size} unchanged, ${plan.toEmbed.length} to embed`);
console.log(`Estimated cost: about ${estTokens.toLocaleString("en-US")} tokens, $${estimateCost(estTokens).toFixed(4)}`);

if (values["dry-run"]) process.exit(0);

const vectors = new Map(plan.reused);
let tokens = 0;
for (const batch of makeBatches(texts)) {
  const res = await embedTexts(batch.map((i) => texts[i]), { model: EMBED_MODEL, dims: EMBED_DIMS });
  batch.forEach((b, j) => vectors.set(plan.toEmbed[b], normalize(res.vectors[j])));
  tokens += res.tokens;
}

const indexed: IndexedChunk[] = plan.chunks.map((c, i) => ({ ...c, embedding: vectors.get(i)! }));
saveIndex({ model: EMBED_MODEL, dims: EMBED_DIMS, builtAt: new Date().toISOString(), chunks: indexed });
console.log(`Saved ${indexed.length} chunks to data/rag-index/index.json`);
console.log(`Used ${tokens.toLocaleString("en-US")} tokens, $${estimateCost(tokens).toFixed(4)}`);