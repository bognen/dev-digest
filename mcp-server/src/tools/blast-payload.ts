import type { ApiBlast } from "../api-schemas.js";
import { CATEGORY_MAX, FILE_MAX, RULE_MAX, TITLE_MAX, cleanField } from "../format.js";

/**
 * Shaping of the GET /pulls/:id/blast response into the tool payload. Pure.
 * Every API-sourced string goes through cleanField. Callers are NOT re-capped
 * (the server already ranks them and the UI shows the same list); only the
 * overall response cap in cappedResult applies.
 */

/** Max changed symbols returned (the rest is reported via changed_symbols_truncated). */
export const BLAST_SYMBOLS_MAX = 100;

export interface BlastPayload {
  status: string;
  degraded_reason?: string;
  summary: string | null;
  changed_symbols: { name: string; file: string; kind: string }[];
  changed_symbols_truncated?: number;
  downstream: {
    symbol: string;
    callers: { name: string; file: string; line: number; rank: number }[];
    endpoints_affected: string[];
    crons_affected: string[];
  }[];
  hint?: string;
}

export function shapeBlast(api: ApiBlast): BlastPayload {
  const { data } = api;
  const status = cleanField(api.status, CATEGORY_MAX);
  const reason = api.degradedReason ? cleanField(api.degradedReason, CATEGORY_MAX) : undefined;

  const symbols = data.changed_symbols.slice(0, BLAST_SYMBOLS_MAX).map((s) => ({
    name: cleanField(s.name, TITLE_MAX),
    file: cleanField(s.file, FILE_MAX),
    kind: cleanField(s.kind, CATEGORY_MAX),
  }));
  const dropped = data.changed_symbols.length - symbols.length;

  const downstream = data.downstream.map((g) => ({
    symbol: cleanField(g.symbol, TITLE_MAX),
    callers: g.callers.map((c) => ({
      name: cleanField(c.name, TITLE_MAX),
      file: cleanField(c.file, FILE_MAX),
      line: c.line,
      rank: c.rank,
    })),
    endpoints_affected: g.endpoints_affected.map((e) => cleanField(e, FILE_MAX)),
    crons_affected: g.crons_affected.map((c) => cleanField(c, FILE_MAX)),
  }));

  let hint: string | undefined;
  if (status !== "full" || reason) {
    hint = `Index incomplete (${reason ?? status}); results may miss callers. Rebuild via Resync in the DevDigest UI.`;
  } else if (symbols.length === 0) {
    hint = "No indexed symbols in the changed files.";
  }

  return {
    status,
    ...(reason ? { degraded_reason: reason } : {}),
    summary: data.summary ? cleanField(data.summary, RULE_MAX) : null,
    changed_symbols: symbols,
    ...(dropped > 0 ? { changed_symbols_truncated: dropped } : {}),
    downstream,
    ...(hint ? { hint } : {}),
  };
}
