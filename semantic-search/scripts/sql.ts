// SQL for the semantic search skill. User values only ever go into ? parameters.

// Everything needed to build the embedding text, plus the fields used for filters.
export function buildIndexSourceQuery(city?: string | null) {
  const where = ["L_Status = 'Active'"];
  const params: string[] = [];
  if (city) {
    where.push("L_City = ?");
    params.push(city);
  }
  const sql = `SELECT
  L_ListingID, L_Type_, L_City, L_Keyword2, LM_Dec_3, LM_Int2_3,
  YearBuilt, L_SystemPrice, AssociationFee, L_Remarks
FROM rets_property
WHERE ${where.join(" AND ")}
ORDER BY L_ListingID`;
  return { sql, params };
}

// Same columns as the Week 3 cards, plus L_Remarks for the description snippet.
const CARD_COLUMNS = `
  L_ListingID, L_DisplayId, L_Address, L_City, L_Zip,
  L_SystemPrice AS price, L_Keyword2 AS beds, LM_Dec_3 AS baths,
  LM_Int2_3 AS sqft, L_Type_ AS type, L_Status AS status,
  LMD_MP_Latitude AS lat, LMD_MP_Longitude AS lng,
  YearBuilt, AssociationFee, DaysOnMarket,
  PoolPrivateYN, ViewYN, FireplaceYN, PhotoCount,
  LA1_UserFirstName, LA1_UserLastName, LO1_OrganizationName, L_Remarks`;

// Gets the full rows for the top matches. Still checks L_Status, in case a listing
// went off the market after the index was built.
export function buildListingsByIdQuery(ids: string[]) {
  if (!ids.length) throw new Error("No listing ids to look up");
  const sql = `SELECT ${CARD_COLUMNS}
FROM rets_property
WHERE L_Status = 'Active' AND L_ListingID IN (${ids.map(() => "?").join(", ")})`;
  return { sql, params: ids };
}