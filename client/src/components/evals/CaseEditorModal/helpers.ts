/* CaseEditorModal helpers — form state ↔ API body and client-side checks (the
   server re-validates: file-in-diff + line range, AC-45). */
import type { EvalCaseDetail, EvalCaseUpsertBody, EvalExpectationType, EvalOwnerKind } from "@devdigest/shared";
import { diffToPrFiles } from "@/lib/eval-format";

export interface ExpectationDraft {
  id?: string;
  type: EvalExpectationType;
  file: string;
  start: string;
  end: string;
  severity: string;
  category: string;
  title: string;
}

export interface CaseDraft {
  name: string;
  diff: string;
  files: { path: string; content: string }[];
  prTitle: string;
  prBody: string;
  expectations: ExpectationDraft[];
}

export function emptyDraft(): CaseDraft {
  return { name: "", diff: "", files: [], prTitle: "", prBody: "", expectations: [] };
}

export function draftFromCase(c: EvalCaseDetail): CaseDraft {
  return {
    name: c.name,
    diff: c.input_diff,
    files: c.input_files.map((f) => ({ ...f })),
    prTitle: c.input_meta.pr_title,
    prBody: c.input_meta.pr_body,
    expectations: c.expected_output.expectations.map((e) => ({
      id: e.id,
      type: e.type,
      file: e.file,
      start: String(e.start_line),
      end: String(e.end_line),
      severity: e.severity ?? "",
      category: e.category ?? "",
      title: e.title ?? "",
    })),
  };
}

/** A new expectation row, pre-filled with the first file of the diff. */
export function newExpectation(diff: string): ExpectationDraft {
  const first = diffToPrFiles(diff)[0]?.path ?? "";
  return { type: "must_find", file: first, start: "", end: "", severity: "", category: "", title: "" };
}

export type DraftError =
  | { key: "nameRequired" }
  | { key: "diffRequired" }
  | { key: "fileRequired"; n: number }
  | { key: "lineInvalid"; n: number };

const posInt = (v: string) => /^\d+$/.test(v.trim()) && Number(v) > 0;

/** Client-side checks; null when the draft can be sent. */
export function validateDraft(d: CaseDraft): DraftError | null {
  if (!d.name.trim()) return { key: "nameRequired" };
  if (diffToPrFiles(d.diff).length === 0) return { key: "diffRequired" };
  for (let i = 0; i < d.expectations.length; i++) {
    const e = d.expectations[i]!;
    if (!e.file.trim()) return { key: "fileRequired", n: i + 1 };
    if (!posInt(e.start) || !posInt(e.end) || Number(e.start) > Number(e.end)) return { key: "lineInvalid", n: i + 1 };
  }
  return null;
}

export function draftToBody(d: CaseDraft, ownerKind: EvalOwnerKind, ownerId: string): EvalCaseUpsertBody {
  return {
    owner_kind: ownerKind,
    owner_id: ownerId,
    name: d.name.trim(),
    input_diff: d.diff,
    input_files: d.files.filter((f) => f.path.trim()).map((f) => ({ path: f.path.trim(), content: f.content })),
    pr_title: d.prTitle,
    pr_body: d.prBody,
    expectations: d.expectations.map((e) => ({
      ...(e.id ? { id: e.id } : {}),
      type: e.type,
      file: e.file.trim(),
      start_line: Number(e.start),
      end_line: Number(e.end),
      severity: e.severity.trim() || null,
      category: e.category.trim() || null,
      title: e.title.trim() || null,
    })),
  };
}
