// SQL for the recommendation skill. User values only ever go into ? parameters.

// Same columns as the Week 3 cards.
const CARD_COLUMNS = `
  L_ListingID, L_DisplayId, L_Address, L_City, L_Zip,
  L_SystemPrice AS price, L_Keyword2 AS beds, LM_Dec_3 AS baths,
  LM_Int2_3 AS sqft, L_Type_ AS type, L_Status AS status,
  LMD_MP_Latitude AS lat, LMD_MP_Longitude AS lng,
  YearBuilt, AssociationFee, DaysOnMarket,
  PoolPrivateYN, ViewYN, FireplaceYN, PhotoCount,
  LA1_UserFirstName, LA1_UserLastName, LO1_OrganizationName`;

export interface Built {
  sql: string;
  params: (string | number)[];
}

// The listing the user likes, by MLS number (the one shown on cards) or the internal id.
export function buildTargetByIdQuery(id: string): Built {
  return {
    sql: `SELECT ${CARD_COLUMNS}
FROM rets_property
WHERE L_Status = 'Active' AND (L_DisplayId = ? OR L_ListingID = ?)
LIMIT 2`,
    params: [id, id],
  };
}

// Escapes % and _ so an address is matched as plain text inside LIKE.
export const likeText = (s: string) => "%" + s.replace(/[\\%_]/g, (c) => "\\" + c) + "%";

// The listing the user likes, by street address (and city, if they gave one).
export function buildTargetByAddressQuery(street: string, city?: string | null): Built {
  const where = ["L_Status = 'Active'", "L_Address LIKE ?"];
  const params: string[] = [likeText(street)];
  if (city) {
    where.push("L_City LIKE ?");
    params.push(likeText(city));
  }
  return {
    sql: `SELECT ${CARD_COLUMNS}
FROM rets_property
WHERE ${where.join(" AND ")}
ORDER BY L_City, L_Address
LIMIT 6`,
    params,
  };
}

// Full rows for the top matches. Still checks L_Status, in case a listing went off the
// market after the Week 6 index was built.
export function buildListingsByIdQuery(ids: string[]): Built {
  if (!ids.length) throw new Error("No listing ids to look up");
  return {
    sql: `SELECT ${CARD_COLUMNS}
FROM rets_property
WHERE L_Status = 'Active' AND L_ListingID IN (${ids.map(() => "?").join(", ")})`,
    params: ids,
  };
}

// The newest sale in california_sold. The comp window counts back from here, not from today,
// because the MLS data is a fixed export. Sales dated after today are typos (one says 2072).
export function buildLatestSaleQuery(): Built {
  return {
    sql: `SELECT DATE_FORMAT(MAX(CloseDate), '%Y-%m-%d') AS latest
FROM california_sold
WHERE PropertyType = 'Residential'
  AND CloseDate <= CURDATE()`,
    params: [],
  };
}

export interface CompArgs {
  city: string;
  type: string | null; // L_Type_ of the listing, matched to PropertySubType
  sqft: number;
  from: string; // inclusive, YYYY-MM-DD
  to: string; // inclusive, YYYY-MM-DD
  band: number; // 0.2 = ±20% of sqft
}

// Recent residential sales of the same home type, in the same city, of a similar size.
// Returns rows (not an AVG) so the median can be taken in code.
export function buildCompsQuery(a: CompArgs): Built {
  const where = [
    "City = ?",
    "PropertyType = 'Residential'",
    "LivingArea BETWEEN ? AND ?",
    "CloseDate >= ?",
    "CloseDate <= ?",
    "ClosePrice > 0",
  ];
  const params: (string | number)[] = [
    a.city, Math.floor(a.sqft * (1 - a.band)), Math.ceil(a.sqft * (1 + a.band)), a.from, a.to,
  ];
  if (a.type) {
    where.splice(2, 0, "PropertySubType = ?");
    params.splice(1, 0, a.type);
  }
  return {
    sql: `SELECT ClosePrice, LivingArea
FROM california_sold
WHERE ${where.join("\n  AND ")}`,
    params,
  };
}