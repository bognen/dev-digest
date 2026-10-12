export const PAGE_SIZE = Number(process.env.CATALOG_PAGE_SIZE ?? 20);
export const MAX_QUERY_LENGTH = 200;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
