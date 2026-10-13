// Builds the SQL and parameter lists for both MLS tables.
// These functions don't connect to the database, so the tests can check them directly.
import type { PropertyFilters } from "../../nl-property-search/scripts/parser.ts";

export const MAX_LIMIT = 25;

// Page and limit must be whole numbers in a safe range. They are written into the SQL
// directly (not as ?) because mysql2's execute() fails on "LIMIT ?" with MySQL 8.0.22+.
export function toPaging(page: unknown = 1, limit: unknown = 10) {
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  const l = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limit)) || 10));
  return { page: p, limit: l, offset: (p - 1) * l };
}

const LISTING_COLUMNS = `
  L_ListingID, L_DisplayId, L_Address, L_City, L_Zip,
  L_SystemPrice AS price, L_Keyword2 AS beds, LM_Dec_3 AS baths,
  LM_Int2_3 AS sqft, L_Type_ AS type, L_Status AS status,
  LMD_MP_Latitude AS lat, LMD_MP_Longitude AS lng,
  YearBuilt, AssociationFee, DaysOnMarket,
  PoolPrivateYN, ViewYN, FireplaceYN, PhotoCount,
  LA1_UserFirstName, LA1_UserLastName, LO1_OrganizationName`;

// Each filter maps to exactly one fixed condition. User values only ever go into params.
const CONDITIONS: [keyof PropertyFilters, string][] = [
  ["city", "L_City = ?"],
  ["minPrice", "L_SystemPrice >= ?"],
  ["maxPrice", "L_SystemPrice <= ?"],
  ["beds", "L_Keyword2 >= ?"],
  ["baths", "LM_Dec_3 >= ?"],
  ["sqft", "LM_Int2_3 >= ?"],
  ["type", "L_Type_ = ?"],
  ["pool", "PoolPrivateYN = ?"],
  ["hasView", "ViewYN = ?"],
  ["maxHoa", "AssociationFee <= ?"],
];

function whereClause(filters: Partial<PropertyFilters>) {
  const parts: string[] = [];
  const params: (string | number)[] = [];
  for (const [key, condition] of CONDITIONS) {
    const value = filters[key];
    if (value !== null && value !== undefined && value !== "") {
      parts.push(condition);
      params.push(value);
    }
  }
  return { parts, params };
}

export function buildActiveListingsQuery(filters: Partial<PropertyFilters>, page?: number, limit?: number) {
  const { limit: l, offset } = toPaging(page, limit);
  const { parts, params } = whereClause(filters);
  const where = ["L_Status = 'Active'", ...parts].join(" AND ");
  const sql = `SELECT ${LISTING_COLUMNS}
FROM rets_property
WHERE ${where}
ORDER BY L_SystemPrice ASC
LIMIT ${l} OFFSET ${offset}`;
  return { sql, params };
}

// Total number of matches, so the reply can say "page 1 of 4".
export function buildActiveCountQuery(filters: Partial<PropertyFilters>) {
  const { parts, params } = whereClause(filters);
  const where = ["L_Status = 'Active'", ...parts].join(" AND ");
  return { sql: `SELECT COUNT(*) AS total FROM rets_property WHERE ${where}`, params };
}

export function buildSoldCompsQuery(city: string, months = 12) {
  const m = Math.min(60, Math.max(1, Math.floor(Number(months)) || 12));
  const sql = `SELECT
  ListingKey, UnparsedAddress, City, CloseDate, ClosePrice,
  OriginalListPrice, ListPrice, DaysOnMarket,
  BedroomsTotal, BathroomsTotalInteger, LivingArea,
  PropertyType, PropertySubType, YearBuilt,
  ListAgentFullName, ListOfficeName, BuyerOfficeName
FROM california_sold
WHERE City = ?
  AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL ${m} MONTH)
  AND PropertyType = 'Residential'
ORDER BY CloseDate DESC
LIMIT 50`;
  return { sql, params: [city] };
}