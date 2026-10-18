export type SearchParameters = Record<string, string | string[] | undefined>;
export const DIRECTORY_PAGE_SIZE = 12;
export class DirectoryQueryError extends Error {}
export function parseDirectoryQuery(params: SearchParameters) {
  const result = { q: "", department: "", industry: "", skill: "", location: "", page: 1 };
  for (const key of ["q", "department", "industry", "skill", "location"] as const) {
    const value = params[key];
    if (value === undefined) continue;
    const max = key === "skill" ? 100 : 150;
    if (typeof value !== "string" || value.length > max || /\p{C}/u.test(value)) throw new DirectoryQueryError("Check your filters. Use one value per field and keep text to 150 characters (100 for skills).");
    result[key] = value.trim().normalize("NFC");
  }
  if (params.page !== undefined) {
    if (typeof params.page !== "string" || !/^[1-9]\d{0,5}$/.test(params.page)) throw new DirectoryQueryError("Choose a valid page number.");
    result.page = Number(params.page);
  }
  return result;
}
export type DirectoryQuery = ReturnType<typeof parseDirectoryQuery>;
export function directoryHref(query: DirectoryQuery, page = query.page) {
  const params = new URLSearchParams();
  for (const key of ["q", "department", "industry", "skill", "location"] as const) if (query[key]) params.set(key, query[key]);
  if (page > 1) params.set("page", String(page));
  return `/network${params.size ? `?${params}` : ""}`;
}
export function networkReturn(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.length > 2500 || !/^\/network(?:\?|$)/.test(value)) return "/network";
  try { return directoryHref(parseDirectoryQuery(Object.fromEntries(new URL(value, "http://local").searchParams))); } catch { return "/network"; }
}
