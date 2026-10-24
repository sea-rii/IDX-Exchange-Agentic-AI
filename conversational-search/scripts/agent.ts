// Conversational property search
//
// handleMessage() takes one message from a user and returns the reply. Between messages it keeps
// the user's filters in their session, so each message only has to say what is new:
//
//   User: Find homes in Irvine            -> "What is your budget?"
//   User: Under $1.2M                     -> "Any preferences — condo, townhome, or single family?"
//   User: Single family with at least 3 beds -> results from rets_property
//   User: with a pool                     -> same search plus the pool filter
//   User: more                            -> next 5 results
//
// The parser and the database search are passed in (deps), so the tests can run without MySQL.
import type { PropertyFilters } from "../../nl-property-search/scripts/parser.ts";
import type { ListingRow } from "../../mls-search/scripts/format.ts";
import {
  type Question, type SessionStore, type UserSession,
  getSession, clearSession,
} from "./session.ts";
import {
  isSkip, isReset, stripReset, isMore, isShowNow,
  parseMoney, parseType, parseCityAnswer, findRemovals,
} from "./answers.ts";

export interface SearchResult { rows: ListingRow[]; total: number; page: number; totalPages: number }

export interface Deps {
  store: SessionStore;
  parse: (text: string) => Promise<PropertyFilters>;
  search: (filters: Partial<PropertyFilters>, page: number, limit: number) => Promise<SearchResult>;
}

export const PAGE_SIZE = 5;

const FILTER_KEYS = [
  "city", "minPrice", "maxPrice", "beds", "baths", "sqft", "type", "pool", "hasView", "maxHoa",
] as const satisfies readonly (keyof PropertyFilters)[];

// Questions are asked in this order. A question is skipped if the user already gave that detail.
const QUESTION_ORDER: Question[] = ["city", "budget", "type"];

const QUESTIONS: Record<Question, string> = {
  city: "Which city are you looking in?",
  budget: "What is your budget?",
  type: "Any preferences — condo, townhome, or single family?",
};

const HELP =
  'You can say "more" for the next results, change a filter (like "under $1M", "3 beds" or "with a pool"), or say "start over".';

// ---------- helpers ----------

const has = (v: unknown) => v !== null && v !== undefined && v !== "";

function filtersOf(s: UserSession): Partial<PropertyFilters> {
  const f: Partial<PropertyFilters> = {};
  for (const k of FILTER_KEYS) if (has(s[k])) (f as Record<string, unknown>)[k] = s[k];
  return f;
}

function isAnswered(q: Question, s: UserSession): boolean {
  if (q === "city") return has(s.city);
  if (q === "budget") return has(s.maxPrice) || has(s.minPrice);
  return has(s.type);
}

function nextQuestion(s: UserSession): Question | undefined {
  return QUESTION_ORDER.find((q) => !isAnswered(q, s) && !s.asked.includes(q));
}

function shortMoney(n: number): string {
  if (n >= 1_000_000) return "$" + +(n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + Math.round(n / 1_000) + "K";
  return "$" + n;
}

const TYPE_WORDS: Record<string, string> = {
  Condominium: "condos",
  Townhouse: "townhomes",
  SingleFamilyResidence: "single family homes",
  UnimprovedLand: "land",
};

// "Single family homes in Irvine · 3+ beds · up to $1.2M · with a pool"
export function describeFilters(f: Partial<PropertyFilters>): string {
  const what = (f.type && TYPE_WORDS[f.type]) || "homes";
  const parts = [f.city ? `${what} in ${f.city}` : what];
  if (has(f.beds)) parts.push(`${f.beds}+ beds`);
  if (has(f.baths)) parts.push(`${f.baths}+ baths`);
  if (has(f.sqft)) parts.push(`${Number(f.sqft).toLocaleString("en-US")}+ sqft`);
  if (has(f.minPrice) && has(f.maxPrice)) parts.push(`${shortMoney(f.minPrice!)}–${shortMoney(f.maxPrice!)}`);
  else if (has(f.maxPrice)) parts.push(`up to ${shortMoney(f.maxPrice!)}`);
  else if (has(f.minPrice)) parts.push(`over ${shortMoney(f.minPrice!)}`);
  if (has(f.pool)) parts.push("with a pool");
  if (has(f.hasView)) parts.push("with a view");
  if (has(f.maxHoa)) parts.push(f.maxHoa === 0 ? "no HOA" : `HOA up to $${f.maxHoa}/mo`);
  const text = parts.join(" · ");
  return text[0].toUpperCase() + text.slice(1);
}

const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Short card for chat: address, price, beds/baths, photo count (the Week 4 deliverable).
export function formatChatCard(r: ListingRow, n: number): string {
  const price = num(r.price), beds = num(r.beds), baths = num(r.baths), photos = num(r.PhotoCount);
  const address = [r.L_Address, [r.L_City, r.L_Zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const details = [
    price !== null && "$" + Math.round(price).toLocaleString("en-US"),
    beds !== null && `${beds} bd`,
    baths !== null && `${baths} ba`,
    `${photos ?? 0} photo${photos === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" · ");
  return `${n}. ${address || "Address not listed"}\n${details}\nMLS# ${r.L_DisplayId ?? r.L_ListingID}`;
}

// ---------- main ----------

export async function handleMessage(userId: string, text: string, deps: Deps): Promise<string> {
  const { store } = deps;
  let session = getSession(store, userId);
  let msg = text.trim();

  const save = (s: UserSession) => store.set(userId, { ...s, updatedAt: Date.now() });

  // "start over" clears everything. "start over, condos in Tustin" starts a new search right away.
  if (isReset(msg)) {
    clearSession(store, userId);
    session = getSession(store, userId);
    msg = stripReset(msg);
    if (!msg) {
      save({ ...session, conversationStep: 1, pending: "city", asked: ["city"] });
      return "Okay, starting a new search. " + QUESTIONS.city;
    }
  }

  const s: UserSession = { ...session, asked: [...session.asked], conversationStep: session.conversationStep + 1 };

  // "more" shows the next page of the last search.
  if (isMore(msg)) {
    if (!s.searched) {
      save(s);
      return "I don't have results yet. " + QUESTIONS[s.pending ?? nextQuestion(s) ?? "city"];
    }
    if (s.totalPages && s.page >= s.totalPages) {
      save(s);
      return `That's all ${s.total} results. Change a filter (like "under $1M" or "with a pool") or say "start over".`;
    }
    return runSearch(s, s.page + 1, deps, save);
  }

  // 1. Full sentences go through the Week 2 parser.
  const parsed = await deps.parse(msg);
  const updates: Partial<PropertyFilters> = {};
  for (const k of FILTER_KEYS) if (has(parsed[k])) (updates as Record<string, unknown>)[k] = parsed[k];
  // The parser can read "at least 3 beds" as a price of $3. No home costs under $10,000,
  // so a price that small is a misread and is dropped.
  if (has(updates.minPrice) && updates.minPrice! < 10_000) delete updates.minPrice;
  if (has(updates.maxPrice) && updates.maxPrice! < 10_000) delete updates.maxPrice;

  // 2. Short answers ("Irvine", "1.2M", "a house") are read using the question we asked.
  // Only when the parser found nothing else, so "with a pool" is not read as a city.
  if (s.pending === "city" && !Object.keys(updates).length) {
    const city = parseCityAnswer(msg);
    if (city) updates.city = city;
  }
  if (s.pending === "budget" && !has(updates.maxPrice) && !has(updates.minPrice)) {
    const price = parseMoney(msg);
    if (price) updates.maxPrice = price;
  }
  if (s.pending === "type" && !updates.type) {
    const type = parseType(msg);
    if (type) updates.type = type;
  }
  // "what about Tustin?" switches the city.
  const about = msg.match(/^(?:what|how) about (.+?)\??$/i);
  if (about && !updates.city && !parseType(about[1])) {
    const city = parseCityAnswer(about[1]);
    if (city) updates.city = city;
  }

  const removals = findRemovals(msg);
  const skipped = !!s.pending && isSkip(msg);
  const showNow = isShowNow(msg);

  if (!Object.keys(updates).length && !removals.length && !skipped && !showNow) {
    if (s.pending) { save(s); return "Sorry, I didn't catch that. " + QUESTIONS[s.pending]; }
    if (s.searched) { save(s); return "Sorry, I didn't catch that. " + HELP; }
    s.pending = "city";
    if (!s.asked.includes("city")) s.asked.push("city");
    save(s);
    return "Hi! I can help you find homes for sale. " + QUESTIONS.city;
  }

  // 3. Apply removals, then the new filters.
  for (const r of removals) {
    if (r === "price") { delete s.minPrice; delete s.maxPrice; }
    else delete s[r];
  }

  // A new city is checked first, so a typo gets a clear message instead of "0 results".
  if (updates.city && updates.city !== s.city) {
    const check = await deps.search({ city: updates.city }, 1, 1);
    if (!check.total) {
      for (const [k, v] of Object.entries(updates)) if (k !== "city") (s as unknown as Record<string, unknown>)[k] = v;
      if (!s.asked.includes("city")) s.asked.push("city");
      s.pending = "city";
      save(s);
      return `I don't have any active listings in ${updates.city}. Check the spelling, or try a nearby city.`;
    }
  }
  Object.assign(s, updates);

  // The question we were waiting on is done once it is answered or skipped.
  if (s.pending && (skipped || isAnswered(s.pending, s))) s.pending = undefined;

  // 4. Before the first search, keep asking until city, budget and type are covered.
  //    After the first search, every change re-runs the search right away.
  if (!s.city) {
    s.pending = "city";
    if (!s.asked.includes("city")) s.asked.push("city");
    save(s);
    return `Got it: ${describeFilters(filtersOf(s))}. ` + QUESTIONS.city;
  }

  if (!s.searched && !showNow) {
    const q = s.pending ?? nextQuestion(s);
    if (q) {
      s.pending = q;
      if (!s.asked.includes(q)) s.asked.push(q);
      save(s);
      return `Got it: ${describeFilters(filtersOf(s))}. ` + QUESTIONS[q];
    }
  }

  s.pending = undefined;
  return runSearch(s, 1, deps, save);
}

async function runSearch(s: UserSession, page: number, deps: Deps, save: (s: UserSession) => void): Promise<string> {
  const filters = filtersOf(s);
  const result = await deps.search(filters, page, PAGE_SIZE);
  s.searched = true;
  s.page = result.page;
  s.total = result.total;
  s.totalPages = result.totalPages;
  s.lastResults = result.rows;
  save(s);

  if (!result.total) {
    return `No active listings match: ${describeFilters(filters)}.\n` +
      'Try a higher budget, fewer beds, or a different home type. Or say "start over".';
  }
  const start = (result.page - 1) * PAGE_SIZE;
  const header = `${describeFilters(filters)}\n${result.total} match${result.total === 1 ? "" : "es"}` +
    ` · page ${result.page} of ${result.totalPages} · lowest price first`;
  const cards = result.rows.map((r, i) => formatChatCard(r, start + i + 1));
  const footer = result.page < result.totalPages
    ? `Reply "more" for the next ${PAGE_SIZE}, change a filter (like "under $1M" or "with a pool"), or say "start over".`
    : 'Change a filter (like "under $1M" or "with a pool") or say "start over".';
  return [header, ...cards, footer].join("\n\n");
}