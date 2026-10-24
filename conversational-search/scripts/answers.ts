// Reads short replies to the agent's questions.
//
// The Week 2 parser expects a full request like "condos in Irvine under $1.2M". In a conversation,
// people answer with just "Irvine", "1.2M" or "a house". These helpers read those short answers,
// using the question we asked to know what the answer means.

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const clean = (text: string) => text.toLowerCase().replace(/[!?.]+$/g, "").trim();

// "any", "no preference", "doesn't matter", "skip" and similar.
export function isSkip(text: string): boolean {
  return /^(any|anything|any(one)? is fine|no pref(erence)?s?|none|no|nope|skip|not sure|idk|i don'?t know|doesn'?t matter|does not matter|don'?t care|whatever|either|all|all of them|any of them|open)$/
    .test(clean(text));
}

export function isReset(text: string): boolean {
  return /\b(start over|start again|new search|reset|clear (it|everything|filters))\b/i.test(text);
}

// Removes the reset words so "start over, condos in Irvine" can still be read as a new search.
export function stripReset(text: string): string {
  return text.replace(/\b(start over|start again|new search|reset|clear (it|everything|filters))\b[,.:!]*/gi, "").trim();
}

export function isMore(text: string): boolean {
  return /^(more|next|next page|show more|more please|see more|show me more|next \d+|more results)$/.test(clean(text));
}

// "just show me", "search now", "show results": search with what we have, stop asking.
export function isShowNow(text: string): boolean {
  return /\b(just show( me)?|show (me )?(what you have|results|them|the results)|search now|go ahead|that'?s it|that'?s all)\b/i.test(text);
}

// Money in a short reply: "1.2M", "$900k", "1,200,000", "900 thousand", "1.5 million", "under 1.2m".
// A plain number under 10,000 is read as thousands only when it has a k/m suffix, so "3" is not $3.
export function parseMoney(text: string): number | null {
  const t = clean(text).replace(/,/g, "");
  for (const m of t.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|mil|million)?\b/g)) {
    let n = Number(m[1]);
    const unit = m[2];
    if (unit === "k" || unit === "thousand") n *= 1_000;
    else if (unit === "m" || unit === "mil" || unit === "million") n *= 1_000_000;
    if (n >= 10_000) return Math.round(n);
  }
  return null;
}

// Same type values as the Week 2 parser (the values stored in rets_property.L_Type_).
export function parseType(text: string): string | null {
  const t = clean(text);
  if (/\bcondo(minium)?s?\b|\bapartments?\b/.test(t)) return "Condominium";
  if (/\btown ?(home|house)s?\b/.test(t)) return "Townhouse";
  if (/\b(single[- ]family|sfr|houses?|detached)\b/.test(t)) return "SingleFamilyResidence";
  if (/\b(land|lots?)\b/.test(t)) return "UnimprovedLand";
  return null;
}

// A bare number of bedrooms: "3", "3+", "three".
export function parseCount(text: string): number | null {
  const t = clean(text).replace(/\+$/, "");
  if (/^\d{1,2}$/.test(t)) return Number(t);
  return WORD_NUMBERS[t] ?? null;
}

// A bare city name: "Irvine", "in irvine", "newport beach please".
// Returns null for anything that does not look like a place name.
export function parseCityAnswer(text: string): string | null {
  const t = clean(text)
    .replace(/^(in|near|around|at)\s+/, "")
    .replace(/\s*(,\s*)?(ca|california)$/, "")
    .replace(/\s+(please|pls|plz)$/, "")
    .trim();
  if (!/^[a-z][a-z .'-]{1,40}$/.test(t)) return null;
  if (t.split(/\s+/).length > 4) return null;
  if (isSkip(t) || parseType(t)) return null;
  // Words that describe a home, not a place.
  if (/\b(with|without|pool|view|beds?|bedrooms?|baths?|bathrooms?|sq ?ft|hoa|under|over|more|cheap|big|small|garage|yard)\b/.test(t)) return null;
  return t.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Phrases that remove a filter that is already set.
export type Removal = "price" | "type" | "beds" | "pool" | "hasView" | "maxHoa";

export function findRemovals(text: string): Removal[] {
  const t = text.toLowerCase();
  const out: Removal[] = [];
  if (/\b(any|no) (price|budget)\b|\bno max\b|\bbudget (doesn'?t|does not) matter\b/.test(t)) out.push("price");
  if (/\bany (type|kind)\b|\b(type|kind) (doesn'?t|does not) matter\b/.test(t)) out.push("type");
  if (/\bany (number of )?(beds|bedrooms)\b/.test(t)) out.push("beds");
  if (/\b(don'?t|do not) (need|want|care about) (a )?pool\b|\bpool (doesn'?t|does not) matter\b|\bno pool\b/.test(t)) out.push("pool");
  if (/\b(don'?t|do not) (need|care about) (a )?view\b|\bview (doesn'?t|does not) matter\b/.test(t)) out.push("hasView");
  if (/\b(hoa (doesn'?t|does not) matter|any hoa)\b/.test(t)) out.push("maxHoa");
  return out;
}