// Command the conversational-search skill runs, one message at a time.
//
// One message:   node conversational-search/scripts/chat.ts --user +15551234567 "Find homes in Irvine"
// Start over:    node conversational-search/scripts/chat.ts --user +15551234567 --reset
// See session:   node conversational-search/scripts/chat.ts --user +15551234567 --show
// Local chat:    node conversational-search/scripts/chat.ts --repl
//                (type messages in the terminal, no OpenClaw needed; type "exit" to quit)
import { parseArgs } from "node:util";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parsePropertyQuery } from "../../nl-property-search/scripts/parser.ts";
import { searchActiveListings } from "../../mls-search/scripts/listings.ts";
import { closePool } from "../../mls-search/scripts/db.ts";
import { handleMessage, type Deps } from "./agent.ts";
import { createFileStore, clearSession, getSession } from "./session.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const store = createFileStore(path.join(here, "..", "sessions"));
const deps: Deps = { store, parse: parsePropertyQuery, search: searchActiveListings };

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    user: { type: "string", default: "local" },
    reset: { type: "boolean", default: false },
    show: { type: "boolean", default: false },
    repl: { type: "boolean", default: false },
  },
});

const userId = values.user!.trim() || "local";

function explain(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e.code === "ECONNREFUSED") return "Can't reach MySQL. Is it running? Try: brew services start mysql";
  if (e.code === "ER_ACCESS_DENIED_ERROR") return "MySQL login failed. Check MYSQL_USER and MYSQL_PASSWORD in .env";
  return "Error: " + e.message;
}

async function main() {
  if (values.reset) {
    clearSession(store, userId);
    console.log("Session cleared.");
    return;
  }
  if (values.show) {
    const { lastResults, ...rest } = getSession(store, userId);
    console.log(JSON.stringify({ ...rest, lastResults: lastResults?.length ?? 0 }, null, 2));
    return;
  }
  if (values.repl) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('Local chat as user "' + userId + '". Type "exit" to quit.\n');
    // Reading lines this way keeps every line, even when several are pasted at once.
    rl.setPrompt("You: ");
    rl.prompt();
    for await (const raw of rl) {
      const line = raw.trim();
      if (line === "exit" || line === "quit") break;
      if (line) {
        if (!process.stdin.isTTY) console.log(line);
        try { console.log("\nAgent: " + (await handleMessage(userId, line, deps)) + "\n"); }
        catch (err) { console.log("\n" + explain(err) + "\n"); }
      }
      rl.prompt();
    }
    rl.close();
    return;
  }

  const text = positionals.join(" ").trim();
  if (!text) {
    console.error('Usage: node conversational-search/scripts/chat.ts --user <id> "<message>"');
    process.exitCode = 1;
    return;
  }
  console.log(await handleMessage(userId, text, deps));
}

try {
  await main();
} catch (err) {
  console.error(explain(err));
  process.exitCode = 1;
} finally {
  await closePool();
}