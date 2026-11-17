// Writes data/rag-sources/market-summaries.md from the Week 5 market-stats skill: the top-25
// city table, plus a full market report for each of the busiest cities.
//
//   node rag-assistant/scripts/make-market-docs.ts            # 15 busiest cities
//   node rag-assistant/scripts/make-market-docs.ts --cities 25
//
// It runs the Week 5 command for each city instead of copying its code, so the summaries always
// match what the market-stats skill says.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { query, closePool } from "../../mls-search/scripts/db.ts";
import { SOURCES_DIR } from "./sources.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MARKET = path.join(REPO, "market-stats/scripts/market.ts");

export interface CityReport {
  city: string;
  report: string;
}

export function buildMarketDoc(topTable: string, reports: CityReport[], madeOn: string): string {
  return [
    "# Market Summaries",
    "",
    `California housing market summaries from the Week 5 market statistics agent, made on ${madeOn} ` +
      "from sold listings in california_sold and active listings in rets_property.",
    "",
    "## Top cities by number of sales",
    "",
    topTable.trim(),
    "",
    ...reports.flatMap((r) => [`## Market summary: ${r.city}`, "", r.report.trim(), ""]),
  ].join("\n");
}

const runMarket = (args: string[]) =>
  execFileSync(process.execPath, [MARKET, ...args], { cwd: REPO, encoding: "utf8" });

async function main() {
  const { values } = parseArgs({ options: { cities: { type: "string", default: "15" } } });
  const n = Math.max(1, Math.min(50, Number(values.cities) || 15));
  if (!fs.existsSync(MARKET)) throw new Error("Can't find market-stats/scripts/market.ts (Week 5)");

  const cities = await query<{ City: string }>(
    `SELECT City
FROM california_sold
WHERE PropertyType = 'Residential' AND City IS NOT NULL AND City <> '' AND CloseDate <= CURDATE()
GROUP BY City
ORDER BY COUNT(*) DESC
LIMIT ${n}`,
    [],
  );

  console.log("Top cities table...");
  const topTable = runMarket(["--top"]);
  const reports: CityReport[] = [];
  for (const { City } of cities) {
    process.stdout.write(`${City}... `);
    try {
      reports.push({ city: City, report: runMarket([`How is the market in ${City}?`]) });
      console.log("done");
    } catch {
      console.log("skipped (market-stats printed an error)");
    }
  }

  const file = path.join(SOURCES_DIR, "market-summaries.md");
  fs.mkdirSync(SOURCES_DIR, { recursive: true });
  fs.writeFileSync(file, buildMarketDoc(topTable, reports, new Date().toISOString().slice(0, 10)));
  console.log(`Wrote ${path.relative(process.cwd(), file)} (${reports.length} cities)`);
}

// Only run when started from the command line, not when the tests import buildMarketDoc.
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