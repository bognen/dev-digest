import { arrayMove } from "@dnd-kit/sortable";
import type { ContextAttachmentRow, ProjectDocListItem, ProjectDocRoot } from "@devdigest/shared";

/** One checkbox row: an attached doc (possibly in a non-ok state) or an available, unattached doc. */
export interface ContextRow {
  path: string;
  root: ProjectDocRoot;
  tokens: number | null;
  attached: boolean;
  /** "ok" for healthy rows; otherwise the reason shown as text (missing, too_large, ...). */
  state: ContextAttachmentRow["state"];
}

/** Attached rows first (in attachment order), then the remaining discovered docs; filtered by path. */
export function buildRows(
  attached: ContextAttachmentRow[],
  docs: ProjectDocListItem[],
  filter: string,
): ContextRow[] {
  const attachedPaths = new Set(attached.map((a) => a.path));
  const rows: ContextRow[] = [
    ...attached.map((a) => ({ path: a.path, root: a.root, tokens: a.tokens, attached: true, state: a.state })),
    ...docs
      .filter((d) => !attachedPaths.has(d.path))
      .map((d) => ({
        path: d.path,
        root: d.root,
        tokens: d.tokens,
        attached: false,
        state: d.too_large ? ("too_large" as const) : ("ok" as const),
      })),
  ];
  const q = filter.trim().toLowerCase();
  return q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : rows;
}

/** Next ordered path list after toggling `path`: detach removes it, attach appends (attachment order). */
export function togglePath(attachedPaths: string[], path: string): string[] {
  return attachedPaths.includes(path) ? attachedPaths.filter((p) => p !== path) : [...attachedPaths, path];
}

/** A not-yet-attached too-large doc cannot be attached (same rule as the agent tab). */
export function isAttachBlocked(row: ContextRow): boolean {
  return !row.attached && row.state === "too_large";
}

/** Move `activeId` to the position held by `overId`; unknown ids are a no-op (same rule as the agent tab). */
export function reorderPaths(paths: readonly string[], activeId: string, overId: string): string[] {
  const from = paths.indexOf(activeId);
  const to = paths.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return [...paths];
  return arrayMove([...paths], from, to);
}
