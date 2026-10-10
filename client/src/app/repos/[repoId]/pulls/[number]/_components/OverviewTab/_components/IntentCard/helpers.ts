import type { IntentSource, PrIntentRecord } from "@devdigest/shared";

/** Display order for the low-confidence "why" line's signal list. `description`
   and `linked_issue` get their own caption/why-note instead of a list entry. */
const WHY_SOURCE_ORDER: IntentSource[] = ["title", "branch", "diff_paths", "commits", "hunk_context"];

/** Maps an `IntentSource` to its `why.source.<key>` i18n key segment. */
export const SOURCE_I18N_KEY: Record<IntentSource, string> = {
  title: "title",
  description: "description",
  linked_issue: "linkedIssue",
  branch: "branch",
  commits: "commits",
  diff_paths: "diffPaths",
  hunk_context: "hunkContext",
};

export interface WhyLineInfo {
  /** Sources to name in the "Inferred from ..." list, in display order. */
  sources: IntentSource[];
  descriptionMissing: boolean;
  issueMissing: boolean;
}

/** Pure selection logic for the low-confidence "why" line — the component
   translates each selected source and joins them. */
export function whyLineInfo(sources: IntentSource[]): WhyLineInfo {
  return {
    sources: WHY_SOURCE_ORDER.filter((s) => sources.includes(s)),
    descriptionMissing: !sources.includes("description"),
    issueMissing: !sources.includes("linked_issue"),
  };
}

export type IntentCaption =
  | { kind: "description" }
  | { kind: "description_issue"; issue: number }
  | { kind: "issue"; issue: number }
  | null;

/** Pure selection logic for the high-confidence caption ("From PR description" /
   "From description + #123" / "From linked issue #123"). */
export function captionFor(record: PrIntentRecord): IntentCaption {
  const hasDescription = record.sources.includes("description");
  const hasIssue = record.sources.includes("linked_issue") && record.linked_issue != null;
  if (hasDescription && hasIssue) {
    return { kind: "description_issue", issue: record.linked_issue as number };
  }
  if (hasDescription) return { kind: "description" };
  if (hasIssue) return { kind: "issue", issue: record.linked_issue as number };
  return null;
}

/** "a, b, and c" / "a and b" / "a" — pure joining, no i18n (the caller supplies
   already-translated fragments). */
export function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
