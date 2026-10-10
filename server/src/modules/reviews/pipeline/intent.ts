import type { Intent, IntentSource, IntentUnavailableReason, PrIntentResponse } from '@devdigest/shared';
import { ConfigError } from '../../../platform/errors.js';
import {
  INTENT_MAX_RETRIES,
  INTENT_MAX_TOKENS,
  INTENT_TEMPERATURE,
  INTENT_TIMEOUT_MS,
  MAX_BRANCH_CHARS,
  MAX_COMMITS,
  MAX_DESCRIPTION_CHARS,
  MAX_FILE_PATHS,
  MAX_ISSUE_BODY_CHARS,
  MAX_ISSUE_TITLE_CHARS,
  MAX_TITLE_CHARS,
} from '../constants.js';
import {
  commitSubjects,
  deriveConfidence,
  extractIssueRef,
  extractTicketRefs,
  intentInputHash,
  isSubstantiveDescription,
  sanitizeIntent,
  toIntentRecord,
} from './intent-signals.js';
import {
  INTENT_SCHEMA,
  INTENT_SCHEMA_NAME,
  SYSTEM_PROMPT,
  buildUserPrompt,
  type IntentLinkedIssueSignal,
  type IntentSignals,
} from './intent-prompt.js';
import type {
  IntentDeps,
  IntentEnsureInput,
  IntentEnsureOpts,
  IntentEnsureResult,
  IntentMeta,
  IntentPullRow,
  StoredIntent,
} from '../types.js';

/**
 * The Intent Layer application service. Constructed with `IntentDeps` (a
 * narrow port bundle) — never the whole Container. Every external system (LLM,
 * GitHub, persistence) is reached through an injected port. See the sequence
 * diagram in the plan's Design §2.
 *
 * `ensure()` NEVER throws: every failure path (missing key, timeout, schema
 * failure, GitHub offline) resolves to `{ status: 'unavailable', reason }` so
 * the executor's fail-open contract holds without a try/catch at the call site.
 */
export class IntentService {
  /** In-process in-flight dedupe, keyed `prId:hash` — two concurrent callers
   *  deriving the SAME PR at the SAME hash share one LLM call. */
  private readonly inFlight = new Map<string, Promise<IntentEnsureResult>>();

  constructor(private readonly deps: IntentDeps) {}

  /**
   * Read path (`GET /pulls/:id/intent`): no LLM or GitHub calls. `stale` is
   * computed by recomputing the input hash from CURRENT DB fields only.
   */
  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.deps.store.getPull(workspaceId, prId);
    if (!pull) return { intent: null, unavailable_reason: 'not_generated' };
    const stored = await this.deps.store.getIntent(prId);
    if (!stored) return { intent: null, unavailable_reason: 'not_generated' };
    const stale = stored.inputHash !== this.currentHash(pull);
    return { intent: toIntentRecord(stored, stale), unavailable_reason: null };
  }

  /**
   * Ensure a fresh (or forced) intent exists for this PR, deriving one if
   * needed. Called both eagerly (executor pre-work) and lazily (Overview tab).
   */
  async ensure(input: IntentEnsureInput, opts: IntentEnsureOpts): Promise<IntentEnsureResult> {
    const linkedIssueNumber = extractIssueRef(input.pull.body);
    const hash = intentInputHash({
      title: input.pull.title,
      body: input.pull.body ?? '',
      branch: input.pull.branch,
      headSha: input.pull.headSha,
      linkedIssueNumber,
    });

    let existing: StoredIntent | undefined;
    try {
      existing = await this.deps.store.getIntent(input.pull.id);
    } catch {
      existing = undefined;
    }

    if (!opts.force && existing && existing.inputHash === hash) {
      this.logResult(input, opts, { cached: true, stored: existing, outcome: 'ok' });
      return { status: 'ok', intent: existing, cached: true };
    }

    const key = `${input.pull.id}:${hash}`;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const task = this.derive(input, opts, hash, linkedIssueNumber, existing);
    this.inFlight.set(key, task);
    try {
      return await task;
    } finally {
      this.inFlight.delete(key);
    }
  }

  // ---- derivation -----------------------------------------------------------

  private async derive(
    input: IntentEnsureInput,
    opts: IntentEnsureOpts,
    hash: string,
    linkedIssueNumber: number | null,
    previous: StoredIntent | undefined,
  ): Promise<IntentEnsureResult> {
    const t0 = Date.now();
    try {
      const choice = await this.deps.resolveModel(input.workspaceId);
      const llm = await this.deps.llm(choice.provider);

      const title = input.pull.title.slice(0, MAX_TITLE_CHARS);
      const branch = input.pull.branch.slice(0, MAX_BRANCH_CHARS);
      const bodyTrimmed = input.pull.body?.trim() || null;
      const description = bodyTrimmed ? bodyTrimmed.slice(0, MAX_DESCRIPTION_CHARS) : null;
      const descriptionSubstantive = isSubstantiveDescription(input.pull.body);

      let linkedIssue: IntentLinkedIssueSignal | null = null;
      let linkedIssueSubstantive = false;
      if (linkedIssueNumber != null) {
        try {
          const github = await this.deps.github();
          const issue = await github.getIssue(input.repo, linkedIssueNumber);
          linkedIssue = {
            number: issue.number,
            title: issue.title.slice(0, MAX_ISSUE_TITLE_CHARS),
            body: issue.body ? issue.body.slice(0, MAX_ISSUE_BODY_CHARS) : null,
          };
          linkedIssueSubstantive = isSubstantiveDescription(issue.body ?? null);
        } catch {
          // Best-effort: derive without the linked-issue signal (source omitted).
        }
      }

      const commits = commitSubjects(await this.deps.store.getPrCommitSubjects(input.pull.id, MAX_COMMITS));
      const filePaths = input.files.slice(0, MAX_FILE_PATHS).map((f) => f.path);
      const hunkContexts = input.hunkHeaders;
      const ticketRefs = extractTicketRefs([input.pull.title, input.pull.body, input.pull.branch]);

      const sources: IntentSource[] = [];
      if (title.trim()) sources.push('title');
      if (description) sources.push('description');
      if (linkedIssue) sources.push('linked_issue');
      if (branch.trim()) sources.push('branch');
      if (commits.length > 0) sources.push('commits');
      if (filePaths.length > 0) sources.push('diff_paths');
      if (hunkContexts.length > 0) sources.push('hunk_context');

      const confidence = deriveConfidence({ descriptionSubstantive, linkedIssueSubstantive });

      const signals: IntentSignals = {
        title,
        description,
        linkedIssue,
        branch,
        commitSubjects: commits,
        filePaths,
        totalFilesCount: input.files.length,
        hunkContexts,
        ticketRefs,
      };

      const result = await this.withTimeout(
        llm.completeStructured<Intent>({
          model: choice.model,
          schema: INTENT_SCHEMA,
          schemaName: INTENT_SCHEMA_NAME,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(signals) },
          ],
          temperature: INTENT_TEMPERATURE,
          maxTokens: INTENT_MAX_TOKENS,
          maxRetries: INTENT_MAX_RETRIES,
        }),
        INTENT_TIMEOUT_MS,
      );

      const sanitized = sanitizeIntent(result.data);
      const meta: IntentMeta = {
        confidence,
        sources,
        ticketRefs,
        linkedIssue: linkedIssue?.number ?? null,
        provider: choice.provider,
        model: choice.model,
        inputHash: hash,
        headSha: input.pull.headSha,
      };
      await this.deps.store.upsertIntent(input.pull.id, sanitized, meta);

      const stored: StoredIntent = {
        prId: input.pull.id,
        intent: sanitized.intent,
        inScope: sanitized.in_scope,
        outOfScope: sanitized.out_of_scope,
        ...meta,
        generatedAt: this.now(),
      };

      this.logResult(input, opts, {
        cached: false,
        stored,
        outcome: 'ok',
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        durationMs: Date.now() - t0,
      });

      return { status: 'ok', intent: stored, cached: false };
    } catch (err) {
      return this.handleFailure(err, input, opts, previous, Date.now() - t0);
    }
  }

  private handleFailure(
    err: unknown,
    input: IntentEnsureInput,
    opts: IntentEnsureOpts,
    previous: StoredIntent | undefined,
    durationMs: number,
  ): IntentEnsureResult {
    const message = err instanceof Error ? err.message : String(err);
    const isConfig = err instanceof ConfigError;
    const isTimeout = !isConfig && message.includes('timed out');
    const isSchemaInvalid = !isConfig && !isTimeout && message.includes('schema_invalid');
    const reason: IntentUnavailableReason = isConfig ? 'provider_not_configured' : 'generation_failed';
    const outcome = isConfig
      ? 'provider_not_configured'
      : isTimeout
        ? 'timeout'
        : isSchemaInvalid
          ? 'schema_invalid'
          : 'llm_error';

    opts.log?.warn(
      {
        prId: input.pull.id,
        workspaceId: input.workspaceId,
        trigger: opts.trigger,
        cached: false,
        stale: false,
        durationMs,
        outcome,
      },
      `intent: unavailable (${reason}) — continuing review without intent grounding`,
    );

    return { status: 'unavailable', reason, ...(previous ? { previous } : {}) };
  }

  // ---- helpers ----------------------------------------------------------------

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer!: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('intent: timed out')), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  private currentHash(pull: IntentPullRow): string {
    return intentInputHash({
      title: pull.title,
      body: pull.body ?? '',
      branch: pull.branch,
      headSha: pull.headSha,
      linkedIssueNumber: extractIssueRef(pull.body),
    });
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** Structured pino log + Design §7's exact field set. Never logs body/intent text. */
  private logResult(
    input: IntentEnsureInput,
    opts: IntentEnsureOpts,
    extra: {
      cached: boolean;
      stored: StoredIntent;
      outcome: 'ok';
      tokensIn?: number;
      tokensOut?: number;
      costUsd?: number | null;
      durationMs?: number;
    },
  ): void {
    const { stored } = extra;
    opts.log?.info(
      {
        prId: input.pull.id,
        workspaceId: input.workspaceId,
        trigger: opts.trigger,
        cached: extra.cached,
        stale: false,
        confidence: stored.confidence,
        sources: stored.sources,
        provider: stored.provider,
        model: stored.model,
        tokensIn: extra.tokensIn ?? null,
        tokensOut: extra.tokensOut ?? null,
        costUsd: extra.costUsd ?? null,
        durationMs: extra.durationMs ?? null,
        inputHash: (stored.inputHash ?? '').slice(0, 12),
        linkedIssue: stored.linkedIssue,
        ticketRefCount: stored.ticketRefs.length,
        outcome: extra.outcome,
      },
      extra.cached
        ? `intent: cached (${stored.confidence} confidence)`
        : `intent: derived via ${stored.provider}/${stored.model} — ${stored.confidence.toUpperCase()} confidence`,
    );
  }
}
