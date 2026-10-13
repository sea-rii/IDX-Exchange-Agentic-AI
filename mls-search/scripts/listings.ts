// Query layer for both MLS tables (handbook Week 3).
import type { PropertyFilters } from "../../nl-property-search/scripts/parser.ts";
import { query } from "./db.ts";
import { buildActiveListingsQuery, buildActiveCountQuery, buildSoldCompsQuery, toPaging } from "./sql.ts";
import type { ListingRow, SoldRow } from "./format.ts";

export async function searchActiveListings(filters: Partial<PropertyFilters>, page = 1, limit = 10) {
  const paging = toPaging(page, limit);
  const list = buildActiveListingsQuery(filters, paging.page, paging.limit);
  const count = buildActiveCountQuery(filters);
  const [rows, [{ total }]] = await Promise.all([
    query<ListingRow>(list.sql, list.params),
    query<{ total: number }>(count.sql, count.params),
  ]);
  return {
    rows,
    total: Number(total),
    page: paging.page,
    totalPages: Math.max(1, Math.ceil(Number(total) / paging.limit)),
  };
}

export async function getSoldComps(city: string, months = 12) {
  const { sql, params } = buildSoldCompsQuery(city, months);
  return query<SoldRow>(sql, params);
}