/**
 * Time range for the agent Stats tab and the Agent Performance dashboard.
 * Both screens keep the range in the URL (`?range=1d|30d|custom&from&to&at`)
 * and resolve it with `resolveRange`, so following "View" from the dashboard
 * opens the agent's Stats tab on the exact same `[from, to)` window.
 *
 * - `1d` / `30d` are rolling windows ending at `at` (an ISO instant; defaults
 *   to "now" at mount, rounded up to the minute so re-renders keep one key).
 * - `custom` is whole UTC days: `from` (inclusive) … `to` (inclusive), as
 *   `YYYY-MM-DD`.
 */

export type RangePreset = "1d" | "30d" | "custom";

export interface StatsRangeState {
  preset: RangePreset;
  /** Custom range bounds, `YYYY-MM-DD` (UTC days, both inclusive). */
  from?: string;
  to?: string;
  /** Anchor instant for rolling presets (ISO); absent = now. */
  at?: string;
}

export interface ResolvedRange {
  from: string;
  to: string;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const PRESET_DAYS: Record<Exclude<RangePreset, "custom">, number> = { "1d": 1, "30d": 30 };
/** Mirrors MAX_STATS_RANGE_DAYS in the shared contract (server rejects longer). */
export const MAX_RANGE_DAYS = 366;
export const DEFAULT_PRESET: RangePreset = "30d";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ceilMinute = (ms: number) => Math.ceil(ms / MINUTE_MS) * MINUTE_MS;
const utcDay = (ymd: string) => Date.parse(`${ymd}T00:00:00.000Z`);
export const toYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Concrete `[from, to)` ISO range, or null when a custom range is incomplete/invalid. */
export function resolveRange(state: StatsRangeState, now: Date): ResolvedRange | null {
  if (state.preset === "custom") {
    if (!state.from || !state.to || !DATE_RE.test(state.from) || !DATE_RE.test(state.to)) return null;
    const from = utcDay(state.from);
    const to = utcDay(state.to) + DAY_MS;
    if (Number.isNaN(from) || Number.isNaN(to) || from >= to || to - from > MAX_RANGE_DAYS * DAY_MS) return null;
    return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  }
  const anchor = state.at ? Date.parse(state.at) : NaN;
  const to = ceilMinute(Number.isNaN(anchor) ? now.getTime() : anchor);
  return { from: new Date(to - PRESET_DAYS[state.preset] * DAY_MS).toISOString(), to: new Date(to).toISOString() };
}

/** Read the range state from URL search params (unknown preset → default). */
export function parseRangeParams(sp: Pick<URLSearchParams, "get">): StatsRangeState {
  const raw = sp.get("range");
  const preset: RangePreset = raw === "1d" || raw === "30d" || raw === "custom" ? raw : DEFAULT_PRESET;
  return {
    preset,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    at: sp.get("at") ?? undefined,
  };
}

/** Write the range state into (a copy of) URL search params, dropping unused keys. */
export function writeRangeParams(base: URLSearchParams, state: StatsRangeState): URLSearchParams {
  const sp = new URLSearchParams(base.toString());
  for (const k of ["range", "from", "to", "at"]) sp.delete(k);
  sp.set("range", state.preset);
  if (state.preset === "custom") {
    if (state.from) sp.set("from", state.from);
    if (state.to) sp.set("to", state.to);
  } else if (state.at) {
    sp.set("at", state.at);
  }
  return sp;
}

/**
 * The params that pin a resolved range exactly — used by the dashboard's
 * "View" link so the Stats tab shows the same window.
 */
export function pinnedRangeParams(state: StatsRangeState, range: ResolvedRange): StatsRangeState {
  return state.preset === "custom" ? state : { preset: state.preset, at: range.to };
}

/** Default custom bounds when switching to "custom": the last 30 UTC days. */
export function defaultCustom(now: Date): { from: string; to: string } {
  const today = toYmd(now.getTime());
  return { from: toYmd(utcDay(today) - 29 * DAY_MS), to: today };
}

/** `2026-09-01 00:00 UTC`-style caption for a range bound. */
export function formatBound(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
