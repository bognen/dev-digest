import { createHash } from 'node:crypto';
import type {
  AgentContextState,
  ContextAttachmentRow,
  ContextOverhead,
  InheritedContextRow,
  ProjectDocContent,
  ProjectDocList,
  ProjectDocListItem,
  ProjectDocSkipReason,
  SkillContextState,
} from '@devdigest/shared';
import {
  PROJECT_CONTEXT_HEADING,
  renderProjectContext,
  renderProjectDocBlock,
  type ProjectDoc,
} from '@devdigest/reviewer-core';
import { AppError, ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_ATTACHMENTS, MAX_DOC_BYTES, PROJECT_DOC_ROOTS } from './constants.js';
import {
  applyBudget,
  computeBudget,
  isBlank,
  isProjectDocPath,
  orderAndDedupe,
  rootOf,
} from './helpers.js';
import type {
  ActiveSkillRef,
  CheckoutReader,
  CheckoutSyncer,
  ContextRepoInfo,
  ContextWindowLookup,
  ProjectContextCounts,
  ProjectContextRepoPort,
  ProjectContextResolver,
  ReadDocResult,
  ResolveForRunInput,
  RunProjectContext,
  TokenCounter,
} from './types.js';

/** Minimal pino-compatible logger. Counts / paths / token numbers only, NEVER document content. */
export interface ProjectContextLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

export interface ProjectContextServiceDeps {
  repo: ProjectContextRepoPort;
  checkout: CheckoutReader;
  sync: CheckoutSyncer;
  tokenizer: TokenCounter;
  contextWindow: ContextWindowLookup;
  logger: ProjectContextLogger;
  /** Optional: whether the checkout directory exists on disk (AC-8). Absent = assume it does. */
  checkoutExists?: (clonePath: string) => Promise<boolean>;
}

const TOKEN_CACHE_MAX = 5000;
const READ_CONCURRENCY = 16;

type ReadFailure = Exclude<ProjectDocSkipReason, 'over_budget'>;

interface Assembled {
  /** Present only when the checkout is usable; null => every doc is `missing`. */
  clonePath: string | null;
  own: string[];
  skills: Array<{ ref: ActiveSkillRef; paths: string[] }>;
  merged: string[];
  reads: Map<string, ReadDocResult>;
  included: ProjectDoc[];
  skipped: Array<{ path: string; reason: ProjectDocSkipReason }>;
  dropped: Array<{ path: string; reason: ProjectDocSkipReason }>;
  blank: number;
  budget: number;
  blockTokens: number;
}

/**
 * Application service for Project Context (SPEC-01): discovery + preview of
 * repo docs, attaching them to agents/skills, and the single assembly pipeline
 * (`assemble`, exposed to runs as `resolveForRun`) so that the totals shown in
 * the UI equal what a run injects (AC-23). No `Container` import: every
 * dependency is an injected port.
 */
export class ProjectContextService implements ProjectContextResolver {
  /** sha256(path + content) -> block tokens; Map insertion order is the LRU order. */
  private readonly tokenCache = new Map<string, number>();
  private overheadCache: ContextOverhead | null = null;

  constructor(private readonly deps: ProjectContextServiceDeps) {}

  // ---------- repo docs browser ----------

  async list(workspaceId: string, repoId: string): Promise<ProjectDocList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const clonePath = await this.requireCheckout(repo);
    const [discovered, usage] = await Promise.all([
      this.deps.checkout.discover(clonePath),
      this.deps.repo.usageCounts(workspaceId, repoId),
    ]);

    const docs = await mapLimit(discovered, READ_CONCURRENCY, async (d): Promise<ProjectDocListItem> => {
      const tooLarge = d.sizeBytes > MAX_DOC_BYTES;
      let tokens: number | null = null;
      if (!tooLarge) {
        const res = await this.deps.checkout.read(clonePath, d.path);
        if (res.ok) tokens = this.blockTokens({ path: d.path, content: res.content });
      }
      return {
        path: d.path,
        root: rootOf(d.path) ?? 'docs',
        size_bytes: d.sizeBytes,
        tokens,
        too_large: tooLarge,
        used_by_agents: usage.get(d.path) ?? 0,
      };
    });
    docs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { repo_id: repoId, roots: [...PROJECT_DOC_ROOTS], docs };
  }

  async getDoc(workspaceId: string, repoId: string, path: string): Promise<ProjectDocContent> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!isProjectDocPath(path)) {
      throw new ValidationError('Not a project document path', { path });
    }
    const clonePath = await this.requireCheckout(repo);
    const res = await this.deps.checkout.read(clonePath, path);
    if (!res.ok) throw readFailureError(path, res.reason);
    return {
      path,
      root: rootOf(path) ?? 'docs',
      content: res.content,
      tokens: this.blockTokens({ path, content: res.content }),
    };
  }

  async refresh(workspaceId: string, repoId: string): Promise<ProjectDocList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    try {
      await this.deps.sync({ owner: repo.owner, name: repo.name }, repo.defaultBranch);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      this.deps.logger.warn({ event: 'project_context.sync_failed', repoId }, 'checkout sync failed');
      throw new ExternalServiceError(`Could not sync the repository checkout: ${reason}`, { repo_id: repoId });
    }
    return this.list(workspaceId, repoId);
  }

  // ---------- agent attachments ----------

  async getAgentContext(workspaceId: string, agentId: string, repoId: string): Promise<AgentContextState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const agent = await this.deps.repo.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return this.buildAgentState(repo, agentId, agent.provider, agent.model);
  }

  async setAgentContext(
    workspaceId: string,
    agentId: string,
    repoId: string,
    paths: string[],
  ): Promise<AgentContextState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const agent = await this.deps.repo.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const current = await this.deps.repo.agentDocs(agentId, repoId);
    await this.validateNewPaths(repo, current, paths);
    await this.deps.repo.setAgentDocs(agentId, repoId, paths);
    return this.buildAgentState(repo, agentId, agent.provider, agent.model);
  }

  // ---------- skill attachments ----------

  async getSkillContext(workspaceId: string, skillId: string, repoId: string): Promise<SkillContextState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const skill = await this.deps.repo.getSkill(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    return this.buildSkillState(repo, skillId);
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    repoId: string,
    paths: string[],
  ): Promise<SkillContextState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const skill = await this.deps.repo.getSkill(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    const current = await this.deps.repo.skillDocs(skillId, repoId);
    await this.validateNewPaths(repo, current, paths);
    await this.deps.repo.setSkillDocs(skillId, repoId, paths);
    return this.buildSkillState(repo, skillId);
  }

  // ---------- run-time resolution ----------

  /**
   * Assemble the project-context block for one run: own docs, then active
   * skills' docs (deduped), each read ONCE; skips are recorded with reasons,
   * blank docs dropped silently, whole docs dropped from the end over budget.
   * Never throws for a missing/unusable checkout (every doc becomes `missing`).
   */
  async resolveForRun(input: ResolveForRunInput): Promise<RunProjectContext> {
    const repo = await this.deps.repo.getRepo(input.workspaceId, input.repoId);
    const empty = (budget: number): RunProjectContext => ({
      docs: [],
      trace: { docs: [], skipped: [], total_tokens: 0, budget_tokens: budget },
      counts: { attached: 0, added: 0, skipped: 0, dropped: 0 },
      blockTokens: 0,
    });
    if (!repo) return empty(computeBudget(null));

    const a = await this.assemble(repo, input.agentId, input.provider, input.model, input.activeSkills);
    const counts: ProjectContextCounts = {
      attached: a.own.length,
      added: a.merged.length - a.own.length,
      skipped: a.skipped.filter((s) => s.reason !== 'over_budget').length + a.blank,
      dropped: a.dropped.length,
    };
    this.deps.logger.info(
      {
        event: 'project_context.resolved',
        repoId: input.repoId,
        agentId: input.agentId,
        ...counts,
        totalTokens: a.blockTokens,
        budgetTokens: a.budget,
        included: a.included.map((d) => d.path),
        skippedDocs: a.skipped,
      },
      'project context resolved',
    );
    return {
      docs: a.included,
      trace: {
        docs: a.included.map((d) => ({
          path: d.path,
          tokens: this.blockTokens(d),
          text: d.content,
        })),
        skipped: a.skipped,
        total_tokens: a.blockTokens,
        budget_tokens: a.budget,
      },
      counts,
      blockTokens: a.blockTokens,
    };
  }

  // ---------- internals ----------

  private async buildAgentState(
    repo: ContextRepoInfo,
    agentId: string,
    provider: string,
    model: string,
  ): Promise<AgentContextState> {
    // Same provider/model-derived budget as a real run, so preview == run (AC-23).
    const a = await this.assemble(repo, agentId, provider, model);
    const attached = a.own.map((p) => this.attachmentRow(p, a.reads.get(p)));

    const seen = new Set(a.own);
    const inherited: InheritedContextRow[] = [];
    for (const s of a.skills) {
      for (const p of s.paths) {
        const res = a.reads.get(p);
        inherited.push({
          path: p,
          tokens: this.rowTokens(p, res),
          skill_id: s.ref.id,
          skill_name: s.ref.name,
          duplicate: seen.has(p),
        });
        seen.add(p);
      }
    }
    return {
      repo_id: repo.id,
      // Independent of attachments (AC-13): resolve the checkout here (UI state only) so the
      // run path (`assemble`) stays free of any discovery walk when nothing is attached.
      discovered_count: await this.discoveredCount(a.clonePath ?? (await this.usableCheckout(repo))),
      attached,
      inherited,
      total_tokens: a.blockTokens,
      budget_tokens: a.budget,
      dropped: a.dropped,
      overhead: this.overhead(),
    };
  }

  private async buildSkillState(repo: ContextRepoInfo, skillId: string): Promise<SkillContextState> {
    const paths = await this.deps.repo.skillDocs(skillId, repo.id);
    const clonePath = await this.usableCheckout(repo);
    const reads = await this.readAll(clonePath, paths);
    const docs: ProjectDoc[] = [];
    for (const p of paths) {
      const r = reads.get(p);
      if (r?.ok && !isBlank(r.content)) docs.push({ path: p, content: r.content });
    }
    const serialized = renderProjectContext(docs);
    return {
      repo_id: repo.id,
      discovered_count: await this.discoveredCount(clonePath),
      attached: paths.map((p) => this.attachmentRow(p, reads.get(p))),
      total_tokens: serialized === null ? 0 : this.deps.tokenizer.count(serialized),
      serialized,
      overhead: this.overhead(),
    };
  }

  private async assemble(
    repo: ContextRepoInfo,
    agentId: string,
    provider: string,
    model: string,
    activeSkills?: ActiveSkillRef[],
  ): Promise<Assembled> {
    const own = await this.deps.repo.agentDocs(agentId, repo.id);
    const skillRefs = activeSkills ?? (await this.deps.repo.activeSkillsForAgent(agentId));
    const skills = await Promise.all(
      skillRefs.map(async (ref) => ({ ref, paths: await this.deps.repo.skillDocs(ref.id, repo.id) })),
    );
    const merged = orderAndDedupe(own, skills.map((s) => s.paths));
    const budget = computeBudget(provider && model ? this.deps.contextWindow(provider, model) : null);

    const clonePath = merged.length > 0 ? await this.usableCheckout(repo) : null;
    const reads = await this.readAll(clonePath, merged);

    const candidates: ProjectDoc[] = [];
    const skipped: Assembled['skipped'] = [];
    let blank = 0;
    for (const p of merged) {
      const r = reads.get(p);
      if (!r || !r.ok) {
        skipped.push({ path: p, reason: (r && !r.ok ? r.reason : 'missing') as ReadFailure });
      } else if (isBlank(r.content)) {
        blank++;
      } else {
        candidates.push({ path: p, content: r.content });
      }
    }

    const counted = new Map<number, number>();
    const { kept, dropped } = applyBudget(
      candidates,
      (ds) => {
        if (ds.length === 0) return 0;
        const n = this.deps.tokenizer.count(renderProjectContext(ds) ?? '');
        counted.set(ds.length, n);
        return n;
      },
      budget,
    );
    const droppedEntries = dropped.map((d) => ({ path: d.path, reason: 'over_budget' as const }));
    return {
      clonePath,
      own,
      skills,
      merged,
      reads,
      included: kept,
      skipped: [...skipped, ...droppedEntries],
      dropped: droppedEntries,
      blank,
      budget,
      blockTokens: kept.length === 0 ? 0 : (counted.get(kept.length) ?? 0),
    };
  }

  /** Newly added paths must be valid, discovered and within the size limit (AC-9). */
  private async validateNewPaths(repo: ContextRepoInfo, current: string[], paths: string[]): Promise<void> {
    if (paths.length > MAX_ATTACHMENTS) {
      throw new ValidationError(`At most ${MAX_ATTACHMENTS} documents can be attached`);
    }
    if (new Set(paths).size !== paths.length) {
      throw new ValidationError('paths must be unique');
    }
    const existing = new Set(current);
    const added = paths.filter((p) => !existing.has(p));
    if (added.length === 0) return;

    const bad = added.find((p) => !isProjectDocPath(p));
    if (bad !== undefined) throw new ValidationError('Not a project document path', { path: bad });

    const clonePath = await this.requireCheckout(repo);
    const discovered = new Map((await this.deps.checkout.discover(clonePath)).map((d) => [d.path, d]));
    for (const p of added) {
      const d = discovered.get(p);
      if (!d) throw new ValidationError('Document not found in the repository', { path: p, reason: 'missing' });
      if (d.sizeBytes > MAX_DOC_BYTES) {
        throw new ValidationError('Document is too large to attach', { path: p, reason: 'too_large' });
      }
    }
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ContextRepoInfo> {
    const repo = await this.deps.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  /** Checkout path or a 409 `checkout_unavailable` with the reason (AC-8). */
  private async requireCheckout(repo: ContextRepoInfo): Promise<string> {
    if (!repo.clonePath) {
      throw new AppError('checkout_unavailable', 'The repository has not been synced yet', 409);
    }
    if (this.deps.checkoutExists && !(await this.deps.checkoutExists(repo.clonePath))) {
      throw new AppError('checkout_unavailable', 'The repository checkout is missing on disk', 409);
    }
    return repo.clonePath;
  }

  /** Like `requireCheckout`, but null instead of throwing (run-time / previews). */
  private async usableCheckout(repo: ContextRepoInfo): Promise<string | null> {
    try {
      return await this.requireCheckout(repo);
    } catch {
      return null;
    }
  }

  private async discoveredCount(clonePath: string | null): Promise<number> {
    if (!clonePath) return 0;
    try {
      return (await this.deps.checkout.discover(clonePath)).length;
    } catch {
      return 0;
    }
  }

  /** Read every path exactly once; a null checkout yields `missing` for all. */
  private async readAll(clonePath: string | null, paths: string[]): Promise<Map<string, ReadDocResult>> {
    const out = new Map<string, ReadDocResult>();
    const results = await mapLimit(paths, READ_CONCURRENCY, async (p): Promise<ReadDocResult> => {
      if (!clonePath) return { ok: false, reason: 'missing' };
      try {
        return await this.deps.checkout.read(clonePath, p);
      } catch {
        return { ok: false, reason: 'unreadable' };
      }
    });
    paths.forEach((p, i) => out.set(p, results[i]!));
    return out;
  }

  private attachmentRow(path: string, res: ReadDocResult | undefined): ContextAttachmentRow {
    return {
      path,
      root: rootOf(path) ?? 'docs',
      tokens: this.rowTokens(path, res),
      state: !res ? 'missing' : res.ok ? 'ok' : res.reason,
    };
  }

  private rowTokens(path: string, res: ReadDocResult | undefined): number | null {
    return res?.ok ? this.blockTokens({ path, content: res.content }) : null;
  }

  /** Tokens of one rendered document block, cached by sha256(path + content) (AC-22). */
  private blockTokens(doc: ProjectDoc): number {
    const key = createHash('sha256').update(doc.path).update('\0').update(doc.content).digest('hex');
    const hit = this.tokenCache.get(key);
    if (hit !== undefined) {
      this.tokenCache.delete(key);
      this.tokenCache.set(key, hit);
      return hit;
    }
    const n = this.deps.tokenizer.count(renderProjectDocBlock(doc));
    this.tokenCache.set(key, n);
    if (this.tokenCache.size > TOKEN_CACHE_MAX) {
      const oldest = this.tokenCache.keys().next().value;
      if (oldest !== undefined) this.tokenCache.delete(oldest);
    }
    return n;
  }

  private overhead(): ContextOverhead {
    if (!this.overheadCache) {
      this.overheadCache = {
        heading_tokens: this.deps.tokenizer.count(`${PROJECT_CONTEXT_HEADING}\n`),
        separator_tokens: this.deps.tokenizer.count('\n\n'),
      };
    }
    return this.overheadCache;
  }
}

/** Map a failed read to an HTTP-mapped error without ever echoing content. */
function readFailureError(path: string, reason: ReadFailure): AppError {
  if (reason === 'missing') return new NotFoundError('Document not found', { path });
  return new ValidationError(`Document cannot be shown (${reason})`, { path, reason });
}

/** Run `fn` over `items` with bounded concurrency, preserving order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
