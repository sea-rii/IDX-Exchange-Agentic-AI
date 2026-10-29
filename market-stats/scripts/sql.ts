// Builds the SQL and parameter lists for the market stats (handbook Week 5).
// These functions don't connect to the database, so the tests can check them directly.
// User values (city, ZIP, home type, dates) only ever go into ? placeholders.

export type Area = {
  city: string | null;
  zip: string | null;
  type: string | null; // PropertySubType in california_sold, L_Type_ in rets_property
};

type Built = { sql: string; params: (string | number)[] };

// The newest sale in the table. The 12-month window is counted back from here,
// not from today, because the MLS data is a fixed export.
// Sales dated after today are typos in the data (one says 2072), so they are skipped.
export function buildLatestDateQuery(): Built {
  return {
    sql: `SELECT DATE_FORMAT(MAX(CloseDate), '%Y-%m-%d') AS latest
FROM california_sold
WHERE PropertyType = 'Residential'
  AND CloseDate <= CURDATE()`,
    params: [],
  };
}

// Sales per month across the whole table. Used to find which months the export fully
// covers, since the data doesn't go back a full 2 years and the first month is partial.
export function buildMonthlyVolumeQuery(from: string, to: string): Built {
  return {
    sql: `SELECT DATE_FORMAT(CloseDate, '%Y-%m') AS month, COUNT(*) AS total
FROM california_sold
WHERE PropertyType = 'Residential'
  AND CloseDate >= ?
  AND CloseDate < ?
GROUP BY DATE_FORMAT(CloseDate, '%Y-%m')`,
    params: [from, to],
  };
}

function soldWhere(area: Area, from: string, to: string) {
  const where = ["PropertyType = 'Residential'", "CloseDate >= ?", "CloseDate < ?"];
  const params: (string | number)[] = [from, to];
  if (area.city) { where.push("City = ?"); params.push(area.city); }
  if (area.zip) { where.push("PostalCode = ?"); params.push(area.zip); }
  if (area.type) { where.push("PropertySubType = ?"); params.push(area.type); }
  return { where: where.join("\n  AND "), params };
}

// One row per sale. Medians can't be done with AVG(), so the math happens in stats.ts.
// PostalCode is only selected when it is needed (a ZIP question or --by zip).
export function buildSoldRowsQuery(area: Area, from: string, to: string, withZip = false): Built {
  const { where, params } = soldWhere(area, from, to);
  return {
    sql: `SELECT
  DATE_FORMAT(CloseDate, '%Y-%m-%d') AS closeDate,
  ClosePrice AS closePrice,
  ListPrice AS listPrice,
  LivingArea AS livingArea,
  DaysOnMarket AS dom,
  PropertySubType AS subType${withZip || area.zip ? ",\n  PostalCode AS zip" : ""}
FROM california_sold
WHERE ${where}`,
    params,
  };
}

// Active listings for the same area, for the inventory comparison.
export function buildActiveCountQuery(area: Area): Built {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (area.city) { where.push("L_City = ?"); params.push(area.city); }
  if (area.zip) { where.push("L_Zip = ?"); params.push(area.zip); }
  if (area.type) { where.push("L_Type_ = ?"); params.push(area.type); }
  return {
    sql: `SELECT COUNT(*) AS total FROM rets_property${where.length ? `\nWHERE ${where.join(" AND ")}` : ""}`,
    params,
  };
}

// The handbook's "City Market Summary", with the date range passed in.
export function buildTopCitiesQuery(from: string, to: string): Built {
  return {
    sql: `SELECT
  City,
  COUNT(*)                                          AS sold_count,
  ROUND(AVG(ClosePrice), 0)                         AS avg_close_price,
  ROUND(AVG(ClosePrice / NULLIF(LivingArea, 0)), 0) AS avg_price_per_sqft,
  ROUND(AVG(DaysOnMarket), 1)                       AS avg_dom,
  ROUND(AVG(ClosePrice / NULLIF(ListPrice, 0)) * 100, 1) AS list_to_close_pct
FROM california_sold
WHERE PropertyType = 'Residential'
  AND CloseDate >= ?
  AND CloseDate < ?
  AND LivingArea > 0
GROUP BY City
ORDER BY sold_count DESC
LIMIT 25`,
    params: [from, to],
  };
}