import type { SortState } from "./helpers";

/** Design default: accept rate, best first ("ACCEPT ↓"). */
export const DEFAULT_SORT: SortState = { key: "accept", dir: "desc" };
