// Session memory for the conversational search.


import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { PropertyFilters } from "../../nl-property-search/scripts/parser.ts";
import type { ListingRow } from "../../mls-search/scripts/format.ts";

export type Question = "city" | "budget" | "type";

export interface UserSession extends Partial<PropertyFilters> {
  lastResults?: ListingRow[];
  conversationStep: number; // number of messages handled in this session
  asked: Question[];        // questions already asked (or skipped), so we never ask twice
  pending?: Question;       // the question we are waiting on an answer for
  searched: boolean;        // true after the first search, then every change re-runs the search
  page: number;
  total?: number;           // matches in the last search, for "more"
  totalPages?: number;
  updatedAt: number;
}

export interface SessionStore {
  get(userId: string): UserSession | undefined;
  set(userId: string, session: UserSession): void;
  delete(userId: string): void;
}

// A session ends after 30 minutes with no messages, so an old search does not mix into a new one.
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const newSession = (): UserSession => ({ conversationStep: 0, asked: [], searched: false, page: 1, updatedAt: Date.now() });

// The handbook version: sessions live in memory.
export function createMemoryStore(): SessionStore {
  const sessions = new Map<string, UserSession>();
  return {
    get: (id) => sessions.get(id),
    set: (id, s) => { sessions.set(id, s); },
    delete: (id) => { sessions.delete(id); },
  };
}

// One JSON file per user. The file name is a hash of the user id, so phone numbers are not
// saved as file names.
export function createFileStore(dir: string): SessionStore {
  const file = (id: string) =>
    path.join(dir, crypto.createHash("sha256").update(id).digest("hex").slice(0, 16) + ".json");
  return {
    get(id) {
      try { return JSON.parse(fs.readFileSync(file(id), "utf8")) as UserSession; }
      catch { return undefined; }
    },
    set(id, s) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file(id), JSON.stringify(s, null, 2));
    },
    delete(id) { fs.rmSync(file(id), { force: true }); },
  };
}

export function getSession(store: SessionStore, userId: string, now = Date.now()): UserSession {
  const existing = store.get(userId);
  if (existing && now - existing.updatedAt < SESSION_TIMEOUT_MS) return existing;
  const fresh = newSession();
  store.set(userId, fresh);
  return fresh;
}

export function updateSession(store: SessionStore, userId: string, updates: Partial<UserSession>) {
  const session = getSession(store, userId);
  const next = { ...session, ...updates, updatedAt: Date.now() };
  store.set(userId, next);
  return next;
}

export function clearSession(store: SessionStore, userId: string) {
  store.delete(userId);
}