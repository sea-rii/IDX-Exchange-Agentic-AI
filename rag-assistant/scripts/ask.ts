// Command the RAG skill runs.
//
//   node rag-assistant/scripts/ask.ts "What does DOM mean?"
//   node rag-assistant/scripts/ask.ts "What columns are in california_sold?"
//   node rag-assistant/scripts/ask.ts "What is a list-to-close ratio?"
//   node rag-assistant/scripts/ask.ts --show-context "What is a cap rate?"   # also prints the passages
//   node rag-assistant/scripts/ask.ts --top 6 "..."
import { parseArgs } from "node:util";
import { embedTexts } from "../../semantic-search/scripts/embed.ts";
import { loadIndex } from "./store.ts";
import { chat, ragAnswer, TOP_K } from "./rag.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    top: { type: "string", default: String(TOP_K) },
    "show-context": { type: "boolean", default: false },
  },
});

const question = positionals.join(" ").trim();
if (!question) {
  console.error('Usage: node rag-assistant/scripts/ask.ts [--top N] [--show-context] "<question>"');
  process.exit(1);
}

try {
  const index = loadIndex();
  if (!index || !index.chunks.length) {
    console.log("The document index hasn't been built yet. Run: node rag-assistant/scripts/build-index.ts");
  } else {
    console.log(await ragAnswer(question, {
      index,
      embed: async (t) => (await embedTexts([t], { model: index.model, dims: index.dims })).vectors[0],
      chat,
    }, { topK: Number(values.top), showContext: values["show-context"] }));
  }
} catch (err) {
  console.error("Error:", (err as Error).message);
  process.exitCode = 1;
}