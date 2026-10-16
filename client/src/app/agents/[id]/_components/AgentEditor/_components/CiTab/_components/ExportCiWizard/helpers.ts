/* Pure helpers for the Export to CI wizard (no React). */
import { parseDocument } from "yaml";
import type {
  CiInstallResult,
  CiPostAs,
  CiPreview,
  CiPreviewFile,
  CiPreviewInput,
  CiTrigger,
} from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { GITHUB_URL_RE, TRIGGERS } from "./constants";

/** Mirrors shared `ciAgentDir`; the client imports only types from `@devdigest/shared`
    (a value import pulls the vendored index, whose `.js` specifiers webpack can't resolve). */
export const agentDir = (slug: string): string => `.devdigest/agents/${slug}/`;

export type YamlWarning = "secrets" | "permissions";

export interface WorkflowLint {
  /** Set when the YAML cannot be parsed; `line` is 1-based when known. */
  error: { line: number | null } | null;
  warnings: YamlWarning[];
}

/** Parse the edited workflow; an error blocks Install, warnings never do (AC-56, AC-57). */
export function lintWorkflowYaml(text: string): WorkflowLint {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    const line = doc.errors[0]?.linePos?.[0]?.line ?? null;
    return { error: { line }, warnings: [] };
  }
  const warnings: YamlWarning[] = [];
  if (!text.includes("OPENROUTER_API_KEY")) warnings.push("secrets");
  const js = doc.toJS() as Record<string, unknown> | null;
  const root = js && typeof js === "object" ? js : {};
  // YAML 1.1 parsers read a bare `on` key as boolean true; `yaml` (1.2) keeps "on".
  const on = root.on ?? root["true"];
  const hasTarget =
    typeof on === "string"
      ? on === "pull_request_target"
      : Array.isArray(on)
        ? on.includes("pull_request_target")
        : !!on && typeof on === "object" && "pull_request_target" in on;
  const jobs = root.jobs && typeof root.jobs === "object" ? Object.values(root.jobs) : [];
  const jobHasPerms = jobs.some((j) => !!j && typeof j === "object" && "permissions" in j);
  if (hasTarget || (!("permissions" in root) && !jobHasPerms)) warnings.push("permissions");
  return { error: null, warnings };
}

export function canContinueConfigure(triggers: readonly CiTrigger[]): boolean {
  return triggers.length > 0;
}

export function canInstall(p: { lint: WorkflowLint | null; hasPreview: boolean; busy: boolean }): boolean {
  return p.hasPreview && !p.busy && !p.lint?.error;
}

/** Triggers in canonical order, so the request body is stable. */
export function orderTriggers(triggers: readonly CiTrigger[]): CiTrigger[] {
  return TRIGGERS.filter((t) => triggers.includes(t));
}

export function toPreviewInput(p: {
  repoId: string;
  triggers: readonly CiTrigger[];
  postAs: CiPostAs;
  memory: boolean;
}): CiPreviewInput {
  return { repo_id: p.repoId, triggers: orderTriggers(p.triggers), post_as: p.postAs, memory_export: p.memory };
}

export function findWorkflow(preview: CiPreview | null): CiPreviewFile | null {
  return preview?.files.find((f) => f.path === preview.workflow_path) ?? null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Link target only when it is a GitHub URL (the PR link is server-provided). */
export function safeGithubUrl(url: string | null | undefined): string | null {
  return url && GITHUB_URL_RE.test(url) ? url : null;
}

export type WizardError =
  | { kind: "branch_exists"; branch: string; suggested: string }
  | { kind: "runner_missing"; command: string }
  | { kind: "github"; status: number }
  | { kind: "generic" };

/** Classify an API failure from preview / install / zip for inline display. */
export function classifyError(err: unknown): WizardError | null {
  if (!err) return null;
  if (!(err instanceof ApiError)) return { kind: "generic" };
  const d = (err.details ?? {}) as Record<string, unknown>;
  if (err.status === 409 && err.message === "ci_branch_exists" && typeof d.suggested_branch === "string") {
    return { kind: "branch_exists", branch: String(d.branch ?? ""), suggested: d.suggested_branch };
  }
  if (err.code === "config_error" && typeof d.build_command === "string") {
    return { kind: "runner_missing", command: d.build_command };
  }
  if (typeof d.github_status === "number") return { kind: "github", status: d.github_status };
  return { kind: "generic" };
}

export function installedPr(result: CiInstallResult | undefined): { url: string | null; reused: boolean } | null {
  return result ? { url: safeGithubUrl(result.pr_url), reused: result.reused_pr } : null;
}
