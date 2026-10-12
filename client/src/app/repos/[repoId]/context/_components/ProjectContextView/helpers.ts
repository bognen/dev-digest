import type { ProjectDocListItem, ProjectDocRoot } from "@devdigest/shared";
import { ROOT_ORDER } from "./constants";

export interface DocGroup {
  root: ProjectDocRoot;
  docs: ProjectDocListItem[];
}

/** Groups docs by root in fixed root order; docs keep their (path-sorted) order. Empty roots are omitted. */
export function groupByRoot(docs: ProjectDocListItem[]): DocGroup[] {
  return ROOT_ORDER.map((root) => ({ root, docs: docs.filter((d) => d.root === root) })).filter(
    (g) => g.docs.length > 0,
  );
}

/** File name to save a document under: the last path segment ("specs/a.md" -> "a.md"). */
export function downloadName(path: string): string {
  const name = path.split("/").pop();
  return name && name.length > 0 ? name : "document.md";
}

/** Saves Markdown text as a file in the browser (client-only; no server round trip). */
export function downloadMarkdown(path: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName(path);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
