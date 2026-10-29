// Command-line script the OpenClaw skill runs (handbook Week 5).
//
//   node market-stats/scripts/market.ts "Is now a good time to buy in San Diego?"
//   node market-stats/scripts/market.ts --by type "How is the market in Pasadena?"
//   node market-stats/scripts/market.ts --by zip "Market stats for Irvine"
//   node market-stats/scripts/market.ts "How is the market in 92618?"
//   node market-stats/scripts/market.ts --top
//
// Optional: --city "Long Beach", --zip 92618, --type Condominium
import { query, closePool } from "../../mls-search/scripts/db.ts";
import { buildMarketReport, type MarketRequest } from "./report.ts";

function readArgs(argv: string[]): MarketRequest {
  const req: MarketRequest = {};
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--top") req.top = true;
    else if (a === "--city") req.city = argv[++i];
    else if (a === "--zip") req.zip = argv[++i];
    else if (a === "--type") req.type = argv[++i];
    else if (a === "--by") {
      const by = argv[++i];
      if (by !== "zip" && by !== "type") throw new Error('--by must be "zip" or "type"');
      req.by = by;
    } else words.push(a);
  }
  if (words.length) req.question = words.join(" ");
  return req;
}

function friendlyError(err: any): string {
  if (err?.code === "ECONNREFUSED") return "MySQL is not running. Start it with: brew services start mysql";
  if (err?.code === "ER_ACCESS_DENIED_ERROR") return "MySQL login failed. Check MYSQL_USER and MYSQL_PASSWORD in .env";
  if (err?.code === "ER_BAD_FIELD_ERROR") return `A column name doesn't match your table: ${err.sqlMessage}`;
  return err?.message ?? String(err);
}

try {
  console.log(await buildMarketReport(readArgs(process.argv.slice(2)), query));
} catch (err) {
  console.error(`Error: ${friendlyError(err)}`);
  process.exitCode = 1;
} finally {
  await closePool();
}