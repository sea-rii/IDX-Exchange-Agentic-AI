export type PropertyFilters = {
  city: string | null;       // L_City
  minPrice: number | null;   // L_SystemPrice >=
  maxPrice: number | null;   // L_SystemPrice <=
  beds: number | null;       // L_Keyword2 >= (min bedrooms)
  baths: number | null;      // LM_Dec_3 >= (min bathrooms)
  sqft: number | null;       // LM_Int2_3 >= (min sq ft)
  type: string | null;       // L_Type_
  pool: "True" | null;       // PoolPrivateYN
  hasView: "True" | null;    // ViewYN
  maxHoa: number | null;     // AssociationFee <=
};

export const COLUMN_MAP: Record<keyof PropertyFilters, string> = {
  city: "L_City",
  minPrice: "L_SystemPrice",
  maxPrice: "L_SystemPrice",
  beds: "L_Keyword2",
  baths: "LM_Dec_3",
  sqft: "LM_Int2_3",
  type: "L_Type_",
  pool: "PoolPrivateYN",
  hasView: "ViewYN",
  maxHoa: "AssociationFee",
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
};

const TYPE_MAP: [RegExp, string][] = [
  [/\b(condo|condos|condominiums?)\b/i, "Condominium"],
  [/\b(town ?homes?|town ?houses?)\b/i, "Townhouse"],
  [/\b(single[\s-]?family|sfr|houses?)\b/i, "SingleFamilyResidence"],
  [/\b(land|lots?|vacant)\b/i, "UnimprovedLand"],
];

const CITY_STOP =
  /\b(under|below|over|above|with|without|at|for|that|which|less|more|between|max|maximum|min|minimum|up|and|no|having|has|priced|budget|around|near|hoa)\b|[,.!?$\d]/i;

function toNumber(raw: string, suffix?: string): number {
  let n = Number(raw.replace(/,/g, ""));
  const s = (suffix || "").toLowerCase();
  if (s === "k" || s === "thousand") n *= 1_000;
  if (s === "m" || s === "mil" || s === "million") n *= 1_000_000;
  return Math.round(n);
}

const MONEY = String.raw`\$?\s*([\d,]*\.?\d+)\s*(k|m|mil|million|thousand)?\b`;

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseCity(q: string): string | null {
  const m = q.match(/\b(?:in|near|around)\s+([A-Za-z][A-Za-z\s'-]*)/i);
  if (!m) return null;
  const stop = m[1].search(CITY_STOP);
  let words = (stop === -1 ? m[1] : m[1].slice(0, stop)).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  if (/^[A-Z]/.test(words[0])) {
    const end = words.findIndex((w, i) => i > 0 && (!/^[A-Z]/.test(w) || w === "I"));
    if (end !== -1) words = words.slice(0, end);
  } else {
    words = words.slice(0, 3);
  }
  return titleCase(words.join(" "));
}

function parseCount(q: string, unit: string): number | null {
  const num = q.match(new RegExp(String.raw`(\d+(?:\.5)?)\s*\+?[\s-]*(?:${unit})\b`, "i"));
  if (num) return Number(num[1]);
  const word = q.match(new RegExp(String.raw`\b(${Object.keys(WORD_NUMBERS).join("|")})[\s-]*(?:${unit})\b`, "i"));
  if (word) return WORD_NUMBERS[word[1].toLowerCase()];
  return null;
}

const AT_MOST = String.raw`(?:under|below|less than|max(?:imum)?(?: of)?|up to|no more than|budget(?: of| is)?|(?:nothing|not|no|can'?t be|cannot be|shouldn'?t be)\s+(?:over|above|more than))`;

const HOA_BEFORE = new RegExp(String.raw`\bhoa\b[^$\d]{0,25}?${AT_MOST}\s*${MONEY}(?:\s*/\s*mo(?:nth)?)?`, "i");
const HOA_AFTER = new RegExp(String.raw`${AT_MOST}\s*${MONEY}\s*(?:/\s*mo(?:nth)?\s*)?(?:in\s+)?hoa\b`, "i");

function parseHoa(q: string): number | null {
  if (/\bno\s+hoa\b/i.test(q)) return 0;
  const m = q.match(HOA_BEFORE) || q.match(HOA_AFTER);
  return m ? toNumber(m[1], m[2]) : null;
}

export async function parsePropertyQuery(query: string): Promise<PropertyFilters> {
  const maxHoa = parseHoa(query);
  const q = query
    .replace(new RegExp(HOA_BEFORE.source, "gi"), " ")
    .replace(new RegExp(HOA_AFTER.source, "gi"), " ");

  let minPrice: number | null = null;
  let maxPrice: number | null = null;
  const between = q.match(new RegExp(String.raw`between\s*${MONEY}\s*(?:and|-|to)\s*${MONEY}`, "i"));
  if (between) {
    minPrice = toNumber(between[1], between[2] || between[4]);
    maxPrice = toNumber(between[3], between[4]);
  } else {
    const max = q.match(new RegExp(String.raw`${AT_MOST}\s*${MONEY}`, "i"));
    if (max) maxPrice = toNumber(max[1], max[2]);
    const min = q.match(new RegExp(String.raw`(?<!\b(?:nothing|not|no|be)\s)(?:over|above|more than|at least|atleast|min(?:imum)?(?: of)?|starting at)\s*${MONEY}(?![\d,.]|\s*\+?\s*(?:sq|square|bed|bath|br|ba|bd)\b)`, "i"));
    if (min) minPrice = toNumber(min[1], min[2]);
  }

  const sqftMatch = q.match(/([\d,]*\.?\d+)\s*(k)?\s*\+?\s*(?:sqft|sq\.?\s*ft\.?|square\s*f(?:ee|oo)t)/i);
  const sqft = sqftMatch ? toNumber(sqftMatch[1], sqftMatch[2]) : null;

  const typeHit = TYPE_MAP.find(([re]) => re.test(q));

  const NOT = String.raw`\b(?:no|without|not|don'?t\s+(?:want|need)|do\s+not\s+(?:want|need))\s+(?:a\s+|an\s+)?`;
  const noPool = new RegExp(NOT + String.raw`pool\b`, "i").test(q);
  const pool = !noPool && /\bpool\b/i.test(q) ? "True" : null;
  const noView = new RegExp(NOT + String.raw`view\b`, "i").test(q);
  const hasView = !noView && /\bviews?\b/i.test(q) ? "True" : null;

  return {
    city: parseCity(q),
    minPrice,
    maxPrice,
    beds: parseCount(q, "bed|beds|bedroom|bedrooms|br|bd"),
    baths: parseCount(q, "bath|baths|bathroom|bathrooms|ba"),
    sqft,
    type: typeHit ? typeHit[1] : null,
    pool,
    hasView,
    maxHoa,
  };
}

const OPS: Record<keyof PropertyFilters, string> = {
  city: "=", minPrice: ">=", maxPrice: "<=", beds: ">=", baths: ">=",
  sqft: ">=", type: "=", pool: "=", hasView: "=", maxHoa: "<=",
};

export function toDbFilters(f: PropertyFilters) {
  return (Object.keys(f) as (keyof PropertyFilters)[])
    .filter((key) => f[key] !== null)
    .map((key) => ({ column: COLUMN_MAP[key], op: OPS[key], value: f[key] as string | number }));
}