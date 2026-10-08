import { parsePropertyQuery, toDbFilters } from "./parser.ts";

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error('Usage: node parse.ts "<free-text property query>"');
  process.exit(1);
}

const filters = await parsePropertyQuery(query);
console.log(JSON.stringify({ query, filters, dbFilters: toDbFilters(filters) }, null, 2));