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
