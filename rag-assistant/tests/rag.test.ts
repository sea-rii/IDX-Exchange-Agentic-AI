// Week 8 tests. They use fake embeddings and a fake chat model, so they need neither OpenAI nor MySQL.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chunkDoc, chunkLabel, embedText, packLines, splitSections, type Chunk } from "../scripts/chunk.ts";
import { docTitle, loadSources } from "../scripts/sources.ts";
import { hashChunk, loadIndex, normalize, planIndex, saveIndex, type RagIndex } from "../scripts/store.ts";
import {
  buildPrompt, chat, citedNumbers, formatAnswer, NOT_FOUND, ragAnswer, retrieve, type Hit,
} from "../scripts/rag.ts";
import { buildSchemaDoc } from "../scripts/make-schema-doc.ts";
import { buildMarketDoc } from "../scripts/make-market-docs.ts";

const PRIMER = `# Real Estate Data Analyst Primer

Intro text before any section.

## Glossary

### Days on Market (DOM)
The number of days a listing is active before it goes under contract.

### List-to-Close Ratio
Close price divided by the final list price.

\`\`\`
# not a heading inside a code block
\`\`\`
`;

test("sections follow the heading path and ignore # inside code blocks", () => {
  const s = splitSections(PRIMER);
  assert.deepEqual(s.map((x) => x.path.join(" > ")), [
    "Real Estate Data Analyst Primer",
    "Real Estate Data Analyst Primer > Glossary > Days on Market (DOM)",
    "Real Estate Data Analyst Primer > Glossary > List-to-Close Ratio",
  ]);
  assert.ok(s[2].lines.some((l) => l.includes("# not a heading")));
});

test("chunks drop the repeated document title and carry the section label", () => {
  const chunks = chunkDoc({ title: "Real Estate Data Analyst Primer", file: "primer.md", content: PRIMER });
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].section, "");
  assert.equal(chunkLabel(chunks[1]), "Real Estate Data Analyst Primer > Glossary > Days on Market (DOM)");
  assert.ok(embedText(chunks[1]).startsWith("Real Estate Data Analyst Primer > Glossary > Days on Market (DOM)\n\nThe number"));
});

test("long sections are cut at line breaks with overlap, never mid-word", () => {
  const lines = Array.from({ length: 30 }, (_, i) => `Line ${i} has some words in it.`);
  const pieces = packLines(lines.join("\n"), 200, 40);
  assert.ok(pieces.length > 1);
  for (const p of pieces) {
    assert.ok(p.length <= 240, `piece too long: ${p.length}`);
    for (const l of p.split("\n")) assert.match(l, /^Line \d+ has some words in it\.$/);
  }
  // The start of each piece repeats the end of the one before it.
  const lastLine = pieces[0].split("\n").at(-1)!;
  assert.ok(pieces[1].startsWith(lastLine));
  // Every line ends up in some piece.
  for (const l of lines) assert.ok(pieces.some((p) => p.includes(l)));
});

test("a long column list stays in one chunk, but a giant line is split by words", () => {
  const cols = Array.from({ length: 150 }, (_, i) => `Column${i}`).join(", "); // ~1,500 chars
  assert.equal(packLines(cols, 1000, 100).length, 1);
  const giant = "word ".repeat(2000); // 10,000 chars
  const pieces = packLines(giant, 1000, 100);
  assert.ok(pieces.length >= 10);
  for (const p of pieces) assert.ok(!/\bwor$|^ord\b/.test(p));
});

test("source titles come from the first heading or the file name", () => {
  assert.equal(docTitle("x.md", "# Trestle Field Definitions\n..."), "Trestle Field Definitions");
  assert.equal(docTitle("trestle-fields.txt", "no heading"), "Trestle Fields");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-src-"));
  fs.writeFileSync(path.join(dir, "b.md"), "# B Doc\ntext");
  fs.writeFileSync(path.join(dir, "a.txt"), "plain text");
  fs.writeFileSync(path.join(dir, "empty.md"), "  ");
  fs.writeFileSync(path.join(dir, "notes.pdf"), "binary");
  assert.deepEqual(loadSources(dir).map((d) => d.title), ["A", "B Doc"]);
  assert.deepEqual(loadSources(path.join(dir, "missing")), []);
});

const chunk = (source: string, section: string, text: string): Chunk => ({ source, section, text });

test("rebuilding reuses embeddings for unchanged chunks only", () => {
  const a = chunk("Primer", "DOM", "Days on market."), b = chunk("Primer", "Escrow", "Escrow is...");
  const old: RagIndex = {
    model: "m", dims: 2, builtAt: "",
    chunks: [{ ...a, hash: hashChunk(a), embedding: [1, 0] }, { ...b, hash: hashChunk(b), embedding: [0, 1] }],
  };
  const changed = { ...b, text: "Escrow is a neutral third party." };
  const plan = planIndex([a, changed, chunk("Primer", "Comps", "Comparable sales.")], old, "m", 2);
  assert.deepEqual([...plan.reused.keys()], [0]);
  assert.deepEqual(plan.reused.get(0), [1, 0]);
  assert.deepEqual(plan.toEmbed, [1, 2]);
  assert.equal(planIndex([a], old, "m", 3).toEmbed.length, 1); // different size: embed again
  assert.equal(planIndex([a], old, "other-model", 2).toEmbed.length, 1);
  // Same text under a different section is a different chunk.
  assert.notEqual(hashChunk(a), hashChunk({ ...a, section: "Other" }));
});

test("the index saves and loads back the same", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-idx-"));
  assert.equal(loadIndex(dir), null);
  const a = chunk("Primer", "DOM", "Days on market.");
  const index: RagIndex = { model: "m", dims: 2, builtAt: "now", chunks: [{ ...a, hash: hashChunk(a), embedding: normalize([3, 4]) }] };
  saveIndex(index, dir);
  assert.deepEqual(loadIndex(dir), index);
  assert.deepEqual(index.chunks[0].embedding, [0.6, 0.8]);
});

// A tiny index with hand-made 3-number "embeddings": x = DOM, y = columns, z = list-to-close.
const fakeIndex: RagIndex = {
  model: "m", dims: 3, builtAt: "",
  chunks: [
    { ...chunk("Primer", "Glossary > Days on Market (DOM)", "DOM is the number of days a listing is active."), hash: "1", embedding: [1, 0, 0] },
    { ...chunk("MLS Table Schema", "Columns in california_sold", "All 3 columns: ClosePrice, CloseDate, City."), hash: "2", embedding: [0, 1, 0] },
    { ...chunk("Primer", "Glossary > List-to-Close Ratio", "Close price divided by list price."), hash: "3", embedding: [0, 0, 1] },
    { ...chunk("Primer", "Glossary > Cumulative DOM", "CDOM adds up days across relistings."), hash: "4", embedding: normalize([0.8, 0, 0.2]) },
  ],
};

test("retrieval ranks by cosine similarity and drops weak matches", () => {
  const hits = retrieve([2, 0, 0.1], fakeIndex, 4, 0.15); // not length 1: retrieve scales it
  assert.deepEqual(hits.map((h) => h.chunk.hash), ["1", "4"]);
  assert.ok(hits[0].score > 0.99);
  assert.equal(retrieve([0, 1, 0], fakeIndex, 1)[0].chunk.hash, "2");
  assert.deepEqual(retrieve([-1, 0, 0], fakeIndex), []);
});

test("the prompt numbers each passage with its source, and the rules say context only", () => {
  const hits: Hit[] = retrieve([1, 0, 0], fakeIndex, 2);
  const { system, user } = buildPrompt("What does DOM mean?", hits);
  assert.match(system, /only the numbered context/);
  assert.match(system, /NOT_FOUND/);
  assert.match(user, /^Context:\n\n\[1\] Primer > Glossary > Days on Market \(DOM\)\nDOM is the number/);
  assert.match(user, /\[2\] Primer > Glossary > Cumulative DOM/);
  assert.ok(user.endsWith("Question: What does DOM mean?"));
});

test("citations pick which sources are listed", () => {
  assert.deepEqual(citedNumbers("A [1]. B [2][4]. C [1, 3]. D [9].", 4), [1, 2, 3, 4]);
  assert.deepEqual(citedNumbers("no citations", 4), []);

  const hits = retrieve([1, 0, 0], fakeIndex, 2);
  assert.equal(formatAnswer("DOM means days on market [1].", hits),
    "DOM means days on market [1].\n\nSources:\n[1] Primer > Glossary > Days on Market (DOM)");
  assert.match(formatAnswer("Uncited answer.", hits), /Sources:\n\[1\] .*\n\[2\] Primer > Glossary > Cumulative DOM$/);
  assert.equal(formatAnswer("NOT_FOUND", hits), NOT_FOUND);
  assert.equal(formatAnswer("  ", hits), NOT_FOUND);
});

test("full question: retrieve, call the model once, add sources; off-topic questions skip the model", async () => {
  const prompts: string[] = [];
  const deps = {
    index: fakeIndex,
    embed: async (q: string) => (q.includes("columns") ? [0, 1, 0] : q.includes("DOM") ? [1, 0, 0] : [-1, -1, -1]),
    chat: async (_s: string, u: string) => { prompts.push(u); return "ClosePrice, CloseDate and City [1]."; },
  };
  const out = await ragAnswer("What columns are in california_sold?", deps, { topK: 2 });
  assert.equal(out, "ClosePrice, CloseDate and City [1].\n\nSources:\n[1] MLS Table Schema > Columns in california_sold");
  assert.equal(prompts.length, 1);

  assert.equal(await ragAnswer("Who won the World Cup?", deps), NOT_FOUND);
  assert.equal(prompts.length, 1); // the model wasn't called

  const withCtx = await ragAnswer("What does DOM mean?", deps, { showContext: true });
  assert.match(withCtx, /Retrieved passages:\n\[1\] score 1\.000 · Primer > Glossary > Days on Market \(DOM\)/);
});

test("chat sends gpt-4o-mini at temperature 0 and explains a bad key", async () => {
  let sent: { model: string; temperature: number; messages: { role: string }[] } | null = null;
  const ok = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(await chat("sys", "user", { apiKey: "k", fetchFn: ok }), "hi");
  assert.equal(sent!.model, "gpt-4o-mini");
  assert.equal(sent!.temperature, 0);
  assert.deepEqual(sent!.messages.map((m) => m.role), ["system", "user"]);

  const bad = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(chat("s", "u", { apiKey: "k", fetchFn: bad }), /API key/);
  await assert.rejects(chat("s", "u", { apiKey: "" }), /OPENAI_API_KEY/);
});

test("schema doc lists every column of each table in one line", () => {
  const doc = buildSchemaDoc([
    { TABLE_NAME: "california_sold", COLUMN_NAME: "ClosePrice", COLUMN_TYPE: "decimal(14,2)" },
    { TABLE_NAME: "california_sold", COLUMN_NAME: "City", COLUMN_TYPE: "varchar(50)" },
    { TABLE_NAME: "rets_property", COLUMN_NAME: "L_SystemPrice", COLUMN_TYPE: "decimal(14,2)" },
  ], { california_sold: 98552, rets_property: 55212 });
  assert.match(doc, /^# MLS Table Schema/);
  assert.match(doc, /## Columns in california_sold\n\nThe california_sold table holds .* It has 98,552 rows and 2 columns\. All 2 columns in california_sold: ClosePrice, City\./);
  assert.match(doc, /- rets_property\.L_SystemPrice: decimal\(14,2\)/);
  // The list survives chunking in one piece.
  const chunks = chunkDoc({ title: "MLS Table Schema", file: "table-schema.md", content: doc });
  const cols = chunks.filter((c) => c.section === "Columns in california_sold");
  assert.equal(cols.length, 1);
});

test("market doc puts each city under its own heading", () => {
  const doc = buildMarketDoc("Top 25 cities ...\n", [
    { city: "San Diego", report: "San Diego market\nMedian close price $950,000\n" },
    { city: "Irvine", report: "Irvine market\n" },
  ], "2026-11-17");
  const chunks = chunkDoc({ title: "Market Summaries", file: "market-summaries.md", content: doc });
  assert.deepEqual(chunks.map((c) => c.section), ["", "Top cities by number of sales", "Market summary: San Diego", "Market summary: Irvine"]);
  assert.match(chunks[0].text, /made on 2026-11-17/);
});