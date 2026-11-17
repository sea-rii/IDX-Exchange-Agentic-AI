// Writes data/rag-sources/table-schema.md: the columns of rets_property and california_sold,
// read straight from MySQL. The Trestle documentation explains what each field means, but it
// doesn't know which fields are in our two tables, so "What columns are in california_sold?"
// needs this list.
//
//   node rag-assistant/scripts/make-schema-doc.ts
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { query, closePool } from "../../mls-search/scripts/db.ts";
import { SOURCES_DIR } from "./sources.ts";

export const TABLES: Record<string, string> = {
  rets_property: "active MLS listings (homes currently for sale or lease)",
  california_sold: "sold (closed) MLS listings, used for comps and market statistics",
};

export interface ColumnRow {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
}

export function buildSchemaDoc(columns: ColumnRow[], rowCounts: Record<string, number>): string {
  const out = [
    "# MLS Table Schema",
    "",
    `The IDX Exchange MySQL database has two MLS tables: ${Object.entries(TABLES)
      .map(([t, d]) => `${t} (${d})`).join(" and ")}.`,
    "",
  ];
  for (const [table, desc] of Object.entries(TABLES)) {
    const cols = columns.filter((c) => c.TABLE_NAME === table);
    if (!cols.length) continue;
    out.push(
      `## Columns in ${table}`,
      "",
      `The ${table} table holds ${desc}. It has ${rowCounts[table]?.toLocaleString("en-US") ?? "?"} rows and ` +
        `${cols.length} columns. All ${cols.length} columns in ${table}: ${cols.map((c) => c.COLUMN_NAME).join(", ")}.`,
      "",
      `## Column types in ${table}`,
      "",
      ...cols.map((c) => `- ${table}.${c.COLUMN_NAME}: ${c.COLUMN_TYPE}`),
      "",
    );
  }
  return out.join("\n");
}

async function main() {
  const names = Object.keys(TABLES);
  const columns = await query<ColumnRow>(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${names.map(() => "?").join(", ")})
ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    names,
  );
  const rowCounts: Record<string, number> = {};
  for (const t of names) {
    const [r] = await query<{ n: number | string }>(`SELECT COUNT(*) AS n FROM ${t}`, []);
    rowCounts[t] = Number(r.n);
  }
  const file = path.join(SOURCES_DIR, "table-schema.md");
  fs.mkdirSync(SOURCES_DIR, { recursive: true });
  fs.writeFileSync(file, buildSchemaDoc(columns, rowCounts));
  for (const t of names) {
    console.log(`${t}: ${columns.filter((c) => c.TABLE_NAME === t).length} columns, ${rowCounts[t].toLocaleString("en-US")} rows`);
  }
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
}

// Only run when started from the command line, not when the tests import buildSchemaDoc.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "ECONNREFUSED") console.error("Can't reach MySQL. Is it running? Try: brew services start mysql");
    else console.error("Error:", e.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}