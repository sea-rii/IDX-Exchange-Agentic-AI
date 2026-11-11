// Builds the text that gets embedded for each listing (handbook build_listing_embedding).
// mysql2 returns DECIMAL columns as strings, so numbers go through num() first.

export const MAX_CHARS = 8000; // same "max token safety" cut as the handbook

export interface ListingTextRow {
  L_ListingID: string | number;
  L_Type_: string | null;
  L_City: string | null;
  L_Keyword2: number | string | null; // beds
  LM_Dec_3: number | string | null; // baths
  LM_Int2_3: number | string | null; // sqft
  YearBuilt: number | string | null;
  L_SystemPrice: number | string | null;
  AssociationFee: number | string | null;
  L_Remarks: string | null;
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// Same fields as the handbook, but a missing value leaves out its part instead of writing "None".
export function buildListingText(r: ListingTextRow): string {
  const beds = num(r.L_Keyword2), baths = num(r.LM_Dec_3), sqft = num(r.LM_Int2_3);
  const year = num(r.YearBuilt), price = num(r.L_SystemPrice);
  const type = clean(r.L_Type_), city = clean(r.L_City);

  const parts = [
    type || city ? `${type || "Home"}${city ? ` in ${city}, CA` : ""}.` : "",
    [beds !== null && `${beds} beds`, baths !== null && `${baths} baths`].filter(Boolean).join(", "),
    [sqft !== null && `${sqft} sq ft`, year !== null && `Built ${year}`].filter(Boolean).join(". "),
    price !== null ? `Price: $${Math.round(price).toLocaleString("en-US")}` : "",
    clean(r.L_Remarks),
  ];
  const text = parts
    .filter(Boolean)
    .map((p) => (/[.!?]$/.test(p) ? p : p + "."))
    .join(" ");
  return (text || "Residential listing.").slice(0, MAX_CHARS);
}