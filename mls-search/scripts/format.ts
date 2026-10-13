// Turns database rows into short text "property cards" that read well in WhatsApp.
// mysql2 returns DECIMAL columns as strings, so every number goes through num() first.

export interface ListingRow {
  L_ListingID: string | number; L_DisplayId: string | null; L_Address: string | null;
  L_City: string | null; L_Zip: string | null; price: number | string | null;
  beds: number | string | null; baths: number | string | null; sqft: number | string | null;
  type: string | null; status: string | null; lat: number | string | null; lng: number | string | null;
  YearBuilt: number | string | null; AssociationFee: number | string | null;
  DaysOnMarket: number | string | null; PoolPrivateYN: string | number | null;
  ViewYN: string | number | null; FireplaceYN: string | number | null; PhotoCount: number | string | null;
  LA1_UserFirstName: string | null; LA1_UserLastName: string | null; LO1_OrganizationName: string | null;
}

export interface SoldRow {
  ListingKey: string; UnparsedAddress: string | null; City: string | null;
  CloseDate: Date | string | null; ClosePrice: number | string | null;
  OriginalListPrice: number | string | null; ListPrice: number | string | null;
  DaysOnMarket: number | string | null; BedroomsTotal: number | string | null;
  BathroomsTotalInteger: number | string | null; LivingArea: number | string | null;
  PropertyType: string | null; PropertySubType: string | null; YearBuilt: number | string | null;
  ListAgentFullName: string | null; ListOfficeName: string | null; BuyerOfficeName: string | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const money = (v: unknown) => {
  const n = num(v);
  return n === null ? null : "$" + Math.round(n).toLocaleString("en-US");
};

const yes = (v: unknown) => ["true", "1", "y", "yes"].includes(String(v ?? "").toLowerCase());

const join = (parts: (string | null | false)[], sep = " · ") => parts.filter(Boolean).join(sep);

function day(v: Date | string | null): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

export function formatListingCard(r: ListingRow, n?: number): string {
  const beds = num(r.beds), baths = num(r.baths), sqft = num(r.sqft);
  const hoa = num(r.AssociationFee), dom = num(r.DaysOnMarket);
  const agent = join([r.LA1_UserFirstName, r.LA1_UserLastName], " ");
  const lines = [
    `${n ? n + ". " : ""}${join([r.L_Address, join([r.L_City, r.L_Zip], " ")], ", ") || "Address not listed"}`,
    join([money(r.price), beds !== null && `${beds} bd`, baths !== null && `${baths} ba`,
      sqft !== null && `${sqft.toLocaleString("en-US")} sqft`]),
    join([r.type, num(r.YearBuilt) !== null && `Built ${num(r.YearBuilt)}`,
      hoa !== null && hoa > 0 && `HOA ${money(hoa)}/mo`, dom !== null && `${dom} days on market`]),
    join([yes(r.PoolPrivateYN) && "Pool", yes(r.ViewYN) && "View", yes(r.FireplaceYN) && "Fireplace"]),
    join([agent && `Agent: ${agent}`, r.LO1_OrganizationName]),
    `MLS# ${r.L_DisplayId ?? r.L_ListingID}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatSoldCard(r: SoldRow, n?: number): string {
  const close = num(r.ClosePrice), list = num(r.ListPrice) ?? num(r.OriginalListPrice);
  const diff = close !== null && list ? Math.round(((close - list) / list) * 100) : null;
  const vsList = diff === null ? null : diff === 0 ? "at list price" : `${Math.abs(diff)}% ${diff > 0 ? "over" : "under"} list`;
  const beds = num(r.BedroomsTotal), baths = num(r.BathroomsTotalInteger), sqft = num(r.LivingArea);
  const lines = [
    `${n ? n + ". " : ""}${join([r.UnparsedAddress, r.City], ", ") || "Address not listed"}`,
    join([money(close) && `Sold ${money(close)}`, day(r.CloseDate), vsList]),
    join([beds !== null && `${beds} bd`, baths !== null && `${baths} ba`,
      sqft !== null && `${sqft.toLocaleString("en-US")} sqft`, r.PropertySubType]),
    join([num(r.DaysOnMarket) !== null && `${num(r.DaysOnMarket)} days on market`,
      r.ListOfficeName && `Listed by ${r.ListOfficeName}`]),
  ];
  return lines.filter(Boolean).join("\n");
}

// Median close price and price per sqft across the comps, for a one-line summary.
export function summarizeComps(rows: SoldRow[]): string {
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const prices = rows.map((r) => num(r.ClosePrice)).filter((x): x is number => x !== null);
  const ppsf = rows
    .map((r) => { const p = num(r.ClosePrice), a = num(r.LivingArea); return p && a ? p / a : null; })
    .filter((x): x is number => x !== null);
    return join([`${rows.length} most recent sales`, prices.length > 0 && `median ${money(median(prices))}`,
    ppsf.length > 0 && `median ${money(median(ppsf))}/sqft`]);
}