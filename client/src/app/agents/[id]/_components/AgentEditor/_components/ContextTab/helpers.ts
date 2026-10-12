import { arrayMove } from "@dnd-kit/sortable";
import type {
  ContextAttachmentRow,
  ContextOverhead,
  InheritedContextRow,
  ProjectDocListItem,
  ProjectDocRoot,
} from "@devdigest/shared";

/** Split a repo-relative path into the file name and its directory ("specs/"). */
export function splitPath(path: string): { name: string; dir: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { name: path, dir: "" } : { name: path.slice(i + 1), dir: path.slice(0, i + 1) };
}

/** Case-insensitive match on the path; an empty query keeps everything. */
export function matchesQuery(path: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || path.toLowerCase().includes(q);
}

/**
 * Instant estimate of the injected block while a save is in flight (AC-23): the per-doc tokens plus
 * the heading and one separator between consecutive docs. The server's exact total replaces it.
 */
export function estimateTotal(overhead: ContextOverhead, tokens: readonly number[]): number {
  if (tokens.length === 0) return 0;
  const sum = tokens.reduce((n, t) => n + t, 0);
  return sum + overhead.heading_tokens + overhead.separator_tokens * (tokens.length - 1);
}

/** Tokens that actually reach the prompt: readable own docs plus non-duplicate inherited ones. */
export function injectedTokens(
  attached: readonly ContextAttachmentRow[],
  inherited: readonly InheritedContextRow[],
): number[] {
  const own = attached.filter((r) => r.state === "ok").map((r) => r.tokens ?? 0);
  const inh = inherited.filter((r) => !r.duplicate).map((r) => r.tokens ?? 0);
  return [...own, ...inh];
}

/** Discovered docs not attached yet (list order preserved). */
export function availableDocs(
  docs: readonly ProjectDocListItem[],
  attached: readonly ContextAttachmentRow[],
): ProjectDocListItem[] {
  const taken = new Set(attached.map((r) => r.path));
  return docs.filter((d) => !taken.has(d.path));
}

/** Detach `path` when attached, otherwise append it (last in the assembled block). */
export function togglePath(paths: readonly string[], path: string): string[] {
  return paths.includes(path) ? paths.filter((p) => p !== path) : [...paths, path];
}

/** Move `activeId` to the position held by `overId`; unknown ids are a no-op. */
export function reorderPaths(paths: readonly string[], activeId: string, overId: string): string[] {
  const from = paths.indexOf(activeId);
  const to = paths.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return [...paths];
  return arrayMove([...paths], from, to);
}

/** Discovery root of a repo-relative path (inherited rows carry only the path); unknown prefixes fall back to "docs". */
export function rootOf(path: string): ProjectDocRoot {
  const first = path.split("/")[0];
  return first === "specs" || first === "docs" || first === "insights" ? first : "docs";
}
