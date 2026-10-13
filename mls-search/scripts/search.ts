// Command-line script the OpenClaw skill runs.
//
// Active listings:  node mls-search/scripts/search.ts "3 bedroom condos in Irvine under $1.5M"
// Next page:        node mls-search/scripts/search.ts --page 2 "3 bedroom condos in Irvine under $1.5M"
// Sold comps:       node mls-search/scripts/search.ts --sold "recent sales in Pasadena"
// Wider window:     node mls-search/scripts/search.ts --sold --months 24 "sales in Pasadena"
import { parseArgs } from "node:util";
import { parsePropertyQuery } from "../../nl-property-search/scripts/parser.ts";
import { searchActiveListings, getSoldComps } from "./listings.ts";
import { formatListingCard, formatSoldCard, summarizeComps } from "./format.ts";
import { closePool } from "./db.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sold: { type: "boolean", default: false },
    page: { type: "string", default: "1" },
    limit: { type: "string", default: "5" },
    months: { type: "string", default: "12" },
  },
});

const text = positionals.join(" ").trim();
if (!text) {
  console.error('Usage: node mls-search/scripts/search.ts [--sold] [--page N] "<property query>"');
  process.exit(1);
}

async function main() {
  const filters = await parsePropertyQuery(text);

  if (values.sold) {
    if (!filters.city) return "Which city do you want sold comps for?";
    const rows = await getSoldComps(filters.city, Number(values.months));
    if (!rows.length) {
      return `No residential sales in ${filters.city} in the last ${values.months} months. Try --months 24.`;
    }
    const cards = rows.slice(0, Number(values.limit)).map((r, i) => formatSoldCard(r, i + 1));
    return [`Sold comps in ${filters.city}: ${summarizeComps(rows)}`, ...cards].join("\n\n");
  }

  const result = await searchActiveListings(filters, Number(values.page), Number(values.limit));
  if (!result.total) return "No active listings match those filters.";
  const start = (result.page - 1) * Number(values.limit);
  const cards = result.rows.map((r, i) => formatListingCard(r, start + i + 1));
  const header = `${result.total} active listings found (page ${result.page} of ${result.totalPages}, lowest price first)`;
  return [header, ...cards].join("\n\n");
}

try {
  console.log(await main());
} catch (err) {
  const e = err as { code?: string; message?: string };
  if (e.code === "ECONNREFUSED") console.error("Can't reach MySQL. Is it running? Try: brew services start mysql");
  else if (e.code === "ER_ACCESS_DENIED_ERROR") console.error("MySQL login failed. Check MYSQL_USER and MYSQL_PASSWORD in .env");
  else console.error("Database error:", e.message);
  process.exitCode = 1;
} finally {
  await closePool();
}