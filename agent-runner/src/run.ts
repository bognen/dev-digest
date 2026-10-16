import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CiSlug, ciWorkflowPath } from '@devdigest/shared';
import type { LLMProvider, GitHubReviewPayload, CiResultArtifact } from '@devdigest/shared';
import { reviewPullRequest, toReviewPayload, gateTriggered, countBlockers } from '@devdigest/reviewer-core';
import { loadManifest } from './manifest.js';
import { loadSkillBodies } from './skills.js';
import { loadMemory } from './memory.js';
import { resolvePrContext, resolveRunOrigin, type CiEnv } from './context.js';
import { parseUnifiedDiff, stripIgnoredFiles } from './diff.js';
import { resolveDiffCaps, applyDiffCap } from './diff-cap.js';
import { fetchPrDiff, postGithubReview, postPrComment, type FetchLike } from './github.js';
import { buildResultArtifact } from './artifact.js';
import { skipReason, emitSkipNotice } from './skip.js';
import { buildPartialNote, appendJobSummary } from './summary.js';
import { findingAnnotations, buildFindingsSummary } from './annotations.js';
import { redactSecrets } from './redact.js';
import { RunnerError } from './errors.js';

/**
 * `runCi` — the runner's single orchestration entry point (T8). Mirrors the
 * pipeline a local studio review runs (assemblePrompt/wrapUntrusted →
 * completeStructured → groundFindings, all INSIDE `reviewPullRequest`) so CI
 * and local stay in parity (AC-36): this file never re-implements or
 * hand-rolls any of that — it only resolves CI-specific inputs (manifest,
 * skills, memory, diff, PR context) and hands them to the SAME reviewer-core
 * engine the studio calls, then turns the grounded result into GitHub side
 * effects.
 *
 * Skip first (AC-14): fork / Dependabot runs exit 0 with a notice before
 * anything else is loaded or validated.
 *
 * Deterministic gate (AC-23): the GitHub review event + blocker count are
 * computed from `countBlockers`/`gateTriggered` + the manifest's `ci_fail_on`
 * against the GROUNDED findings — never from `review.verdict` (the model's
 * self-report), which is discarded here on purpose.
 *
 * Hard-fail (Q5): a single try/catch wraps the ENTIRE pipeline. Any failure —
 * missing API key, invalid manifest (AC-20), missing skill file, unresolvable
 * CI context, diff-fetch failure, or an LLM/model-call error inside
 * `reviewPullRequest` — short-circuits to
 * `{ exitCode: 1, artifact: null, posted: null }` before any GitHub post or
 * artifact write. Do not add per-stage catches that post partial state; the
 * whole point is that a failure anywhere upstream of "we have a grounded
 * review" produces NOTHING (no synthetic review skeleton).
 */

export type PostAs = 'github_review' | 'pr_comment' | 'none';

export interface RunCiDeps {
  /** The checked-in `.devdigest/` dir; the agent folder is `<devdigestDir>/agents/<slug>/`. */
  devdigestDir: string;
  /** CI env (read once by `index.ts`). `DEVDIGEST_AGENT_SLUG` names the agent folder. */
  env: CiEnv;
  /** Injected LLM provider — `OpenRouterProvider` in production, a stub in tests. */
  llm: LLMProvider;
  /** How to post the result — `'github_review' | 'pr_comment' | 'none'` (AC-24). */
  postAs: PostAs;
  /** Absolute path to write the `CiResultArtifact` JSON to. */
  resultPath: string;
  fetchImpl?: FetchLike;
  readFile?: typeof readFileSync;
  writeFile?: typeof writeFileSync;
  appendFile?: typeof appendFileSync;
  /** Log sink (stdout in production). Never receives secrets. */
  log?: (line: string) => void;
  now?: () => number;
  /**
   * Override diff retrieval (tests supply a fixture diff directly instead of
   * hitting the GitHub API). Defaults to `fetchPrDiff` via the GitHub REST API.
   */
  fetchDiff?: (
    ctx: { owner: string; repo: string; prNumber: number },
    token: string,
    fetchImpl: FetchLike,
  ) => Promise<string>;
}

export interface RunCiSuccess {
  exitCode: number;
  artifact: CiResultArtifact;
  posted: { kind: PostAs; payload?: GitHubReviewPayload };
  blockers: number;
  gateTriggered: boolean;
  error?: undefined;
  skipped?: undefined;
}

export interface RunCiFailure {
  exitCode: number;
  artifact: null;
  posted: null;
  blockers?: undefined;
  gateTriggered?: undefined;
  error: string;
  skipped?: undefined;
}

/** Fork / Dependabot run: exit 0, nothing posted, no artifact (AC-14). */
export interface RunCiSkipped {
  exitCode: 0;
  artifact: null;
  posted: null;
  blockers?: undefined;
  gateTriggered?: undefined;
  error?: undefined;
  skipped: string;
}

export type RunCiResult = RunCiSuccess | RunCiFailure | RunCiSkipped;

export async function runCi(deps: RunCiDeps): Promise<RunCiResult> {
  const readFile = deps.readFile ?? readFileSync;
  const writeFile = deps.writeFile ?? writeFileSync;
  const appendFile = deps.appendFile ?? appendFileSync;
  const log = deps.log ?? ((line: string) => console.log(line));
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fetchDiffImpl = deps.fetchDiff ?? fetchPrDiff;

  try {
    // 0. Skip first (AC-14): fork / Dependabot runs get no secrets. Exit 0 with
    //    a notice BEFORE the manifest is loaded or the API key is checked.
    const reason = skipReason(resolveRunOrigin(deps.env, readFile));
    if (reason !== null) {
      const text = emitSkipNotice(reason, deps.env, { log, appendFile });
      return { exitCode: 0, artifact: null, posted: null, skipped: text };
    }

    // 1. Missing key is a hard failure (AC-40) — never reaches the LLM.
    if (!deps.env.OPENROUTER_API_KEY) {
      throw new RunnerError('OPENROUTER_API_KEY is not set (add it as a repository secret)');
    }

    // 2. The agent folder this workflow names; no other folder is read (AC-85).
    const slugResult = CiSlug.safeParse(deps.env.DEVDIGEST_AGENT_SLUG);
    if (!slugResult.success) {
      throw new RunnerError(
        `DEVDIGEST_AGENT_SLUG must be a valid agent slug (got: ${JSON.stringify(deps.env.DEVDIGEST_AGENT_SLUG)})`,
      );
    }
    const slug = slugResult.data;
    const agentDir = path.join(deps.devdigestDir, 'agents', slug);

    // 3. Load + validate the manifest BEFORE it is used for anything (AC-20).
    const manifest = loadManifest(agentDir, { readFile });
    const skills = loadSkillBodies(agentDir, manifest.skills, readFile);
    const memory = loadMemory(agentDir, readFile);

    // 4. Resolve CI context (PR number/title/body/repo/sha) from env + event payload.
    const ctx = resolvePrContext(deps.env, readFile);

    const githubToken = deps.env.GITHUB_TOKEN;
    if (deps.postAs !== 'none' && !githubToken) {
      throw new RunnerError(`GITHUB_TOKEN is required to post as '${deps.postAs}'`);
    }

    // 5. Assemble the diff. Strip DevDigest's own exported artifacts (all of
    //    `.devdigest/**` and THIS agent's workflow) BEFORE capping: the minified
    //    runner bundle would otherwise blow the cap / cause a GitHub 422, and
    //    reviewing our own config is noise. Then cap by size (AC-71).
    const rawDiff = await fetchDiffImpl(ctx, githubToken ?? '', fetchImpl);
    const stripped = stripIgnoredFiles(rawDiff, ciWorkflowPath(slug));
    const capped = applyDiffCap(stripped, resolveDiffCaps(deps.env, log));
    const diff = parseUnifiedDiff(capped.raw);

    // 6. Run the SAME engine the studio uses. `reviewPullRequest` internally
    //    calls `assemblePrompt`/`wrapUntrusted` (diff → `<untrusted
    //    source="diff">`, prDescription → `<untrusted source="pr-description">`,
    //    AC-21) and the mandatory `groundFindings()` gate (AC-22: an all-dropped
    //    result is a valid zero-finding review, not an error).
    const start = now();
    const outcome = await reviewPullRequest({
      systemPrompt: manifest.system_prompt,
      model: manifest.model,
      diff,
      llm: deps.llm,
      strategy: manifest.strategy,
      skills,
      memory,
      prDescription: ctx.body,
      task: `Review PR #${ctx.prNumber}: ${ctx.title}`,
    });
    const durationMs = now() - start;

    // 7. Deterministic verdict/gate from GROUNDED findings + `ci_fail_on`
    //    (AC-23) — never `outcome.review.verdict`.
    const basePayload = toReviewPayload(outcome.review, {
      failOn: manifest.ci_fail_on,
      diff,
      title: manifest.name,
    });
    const blockers = countBlockers(outcome.review.findings, manifest.ci_fail_on);
    const triggered = gateTriggered(outcome.review.findings, manifest.ci_fail_on);

    // 8. Partial review (AC-72): say so in the posted body and the job summary.
    let payload: GitHubReviewPayload = basePayload;
    if (capped.partial) {
      const note = buildPartialNote(capped.skipped, capped.caps);
      payload = { ...basePayload, body: `${basePayload.body}\n\n${note}` };
      appendJobSummary(deps.env, note, appendFile);
    }

    // 9. Build + write the artifact before posting, so a GitHub-side posting
    //    failure never loses the already-computed, already-grounded result.
    const artifact = buildResultArtifact({
      findings: outcome.review.findings,
      costUsd: outcome.costUsd,
      durationMs,
      agent: manifest.name,
      agentSlug: slug,
      prNumber: ctx.prNumber,
      repositoryId: ctx.repositoryId,
      repository: `${ctx.owner}/${ctx.repo}`,
      headSha: ctx.headSha,
      workflowRunId: ctx.runId,
      workflowRunAttempt: ctx.runAttempt,
      verdict: payload.event,
      blockers,
      partial: capped.partial,
      skippedFiles: capped.skipped,
    });
    writeFile(deps.resultPath, `${JSON.stringify(artifact, null, 2)}\n`);

    // 10. Post per `post_as` (AC-24).
    if (deps.postAs === 'github_review') {
      await postGithubReview(ctx, githubToken as string, payload, fetchImpl);
    } else if (deps.postAs === 'pr_comment') {
      await postPrComment(ctx, githubToken as string, payload.body, fetchImpl);
    }
    // 'none' → post nothing (exit-code only).

    // 10b. Surface the findings in the Actions UI too: annotations on the run
    //      page + a table in the job summary (escaped; see annotations.ts).
    for (const line of findingAnnotations(outcome.review.findings, manifest.ci_fail_on)) log(line);
    appendJobSummary(
      deps.env,
      buildFindingsSummary(manifest.name, outcome.review.findings, manifest.ci_fail_on, blockers),
      appendFile,
    );

    // 11. Exit non-zero IFF the gate triggered REQUEST_CHANGES (AC-25).
    return {
      exitCode: triggered ? 1 : 0,
      artifact,
      posted: { kind: deps.postAs, payload },
      blockers,
      gateTriggered: triggered,
    };
  } catch (err) {
    // Hard-fail (Q5): non-zero exit, nothing posted, no artifact, no synthetic
    // review skeleton — regardless of which stage above threw. The message is
    // redacted so no secret value can reach the log line (AC-42).
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, artifact: null, posted: null, error: redactSecrets(message, deps.env) };
  }
}
