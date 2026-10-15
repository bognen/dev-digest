import type {
  AuthProvider,
  SecretsProvider,
  GitHubClient,
  GitHubCiClient,
  GitClient,
  CodeIndex,
  Embedder,
  LLMProvider,
  FeatureModelChoice,
  FeatureModelId,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import { SkillsService } from '../modules/skills/service.js';
import { resolveFeatureModel } from '../modules/settings/feature-models.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { BriefRepository } from '../modules/brief/repository.js';
import { BriefService } from '../modules/brief/service.js';
import { readSpecFile } from '../modules/brief/clone.js';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { OnboardingRepository } from '../modules/onboarding/repository.js';
import { OnboardingService } from '../modules/onboarding/service.js';
import { readExcerpt } from '../modules/onboarding/clone.js';
import { loadPromptTemplate } from './prompts.js';
import { ProjectContextRepository } from '../modules/project-context/repository.js';
import { ProjectContextService } from '../modules/project-context/service.js';
import { checkoutReader } from '../modules/project-context/checkout.js';
import { EvalRepository } from '../modules/eval/repository.js';
import { EvalService } from '../modules/eval/service.js';
import { CiRepository } from '../modules/ci/repository.js';
import { CiService } from '../modules/ci/service.js';
import type { CiRunnerBundle } from '../modules/ci/types.js';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';
import { type UrlFetcher, HttpUrlFetcher } from '../adapters/url-fetcher/index.js';

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  /** CI-export GitHub port (SPEC-07). Defaults to the same client as `github`. */
  githubCi?: GitHubCiClient;
  /** Pre-read agent-runner bundle (filename -> text); `null` simulates "not built". */
  runnerBundle?: CiRunnerBundle | null;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
  /** Server-side URL fetcher (skill import). Tests inject MockUrlFetcher. */
  urlFetcher?: UrlFetcher;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  private _git?: GitClient;
  private _github?: GitHubClient;
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _reviewRepo?: ReviewRepository;
  private _skillsRepo?: SkillsRepository;
  private _skillsService?: SkillsService;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _urlFetcher?: UrlFetcher;
  private _priceBook?: PriceBook;
  private _briefRepo?: BriefRepository;
  private _briefService?: BriefService;
  private _projectContextService?: ProjectContextService;
  private _onboardingService?: OnboardingService;
  private _evalService?: EvalService;
  private _ciService?: CiService;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir);
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get skillsRepo(): SkillsRepository {
    return (this._skillsRepo ??= new SkillsRepository(this.db));
  }

  /**
   * The skills application service, for feature modules that write skills
   * (e.g. conventions) and must go through the same validation, versioning and
   * injection scan as the Skills routes.
   */
  get skillsService(): SkillsService {
    return (this._skillsService ??= new SkillsService({
      repo: this.skillsRepo,
      urlFetcher: this.urlFetcher,
    }));
  }

  /** The `pr_brief` table (one row per PR, the current stored brief). */
  get briefRepo(): BriefRepository {
    return (this._briefRepo ??= new BriefRepository(this.db));
  }

  /**
   * Application service for the PR Why + Risk Brief — `getPage` (0 LLM calls)
   * and `generate` (the one structured call per generation). A shared getter so
   * routes read `container.briefService` rather than constructing an instance
   * per request: the in-flight generation guard only works as a process-wide
   * singleton.
   */
  get briefService(): BriefService {
    return (this._briefService ??= new BriefService(
      this.briefRepo,
      this.repoIntel,
      (workspaceId, id) => this.resolveFeatureModel(workspaceId, id),
      (id) => this.llm(id),
      () => this.github(),
      readSpecFile,
      this.tokenizer,
      (model, tokensIn, tokensOut) => this.priceBook.estimate(model, tokensIn, tokensOut),
      // No Fastify `app.log` reaches the container (composition-root boundary);
      // `console` is pino-compatible enough for the one structured line emitted
      // per generation.
      console,
    ));
  }

  /**
   * Project Context (SPEC-01): doc discovery/preview, agent+skill attachments and
   * the run-time resolver. A process-wide singleton so the token cache is shared
   * between the UI previews and runs.
   */
  get projectContextService(): ProjectContextService {
    return (this._projectContextService ??= new ProjectContextService({
      repo: new ProjectContextRepository(this.db),
      checkout: checkoutReader,
      sync: (ref, branch) => this.git.sync(ref, branch).then(() => undefined),
      tokenizer: this.tokenizer,
      contextWindow: (provider, model) =>
        provider === 'openrouter' ? this.priceBook.contextLength(model) : null,
      logger: console,
      checkoutExists: (p) =>
        stat(p)
          .then((s) => s.isDirectory())
          .catch(() => false),
    }));
  }

  /**
   * Onboarding Tour (SPEC-02). Process-wide singleton: its in-flight guard
   * (second trigger => 409) only works with exactly one instance.
   */
  get onboardingService(): OnboardingService {
    return (this._onboardingService ??= new OnboardingService({
      store: new OnboardingRepository(this.db),
      repoIntel: this.repoIntel,
      resolveModel: (workspaceId) => this.resolveFeatureModel(workspaceId, 'onboarding'),
      llm: (id) => this.llm(id),
      readExcerpt,
      tokenizer: this.tokenizer,
      estimateCost: (model, tokensIn, tokensOut) => this.priceBook.estimate(model, tokensIn, tokensOut),
      loadSystemTemplate: () => loadPromptTemplate('onboarding.system.md'),
      logger: console,
    }));
  }

  /**
   * Eval pipeline (SPEC-06). Process-wide singleton: the in-flight run guard
   * (second concurrent run for one agent => 409) needs exactly one instance.
   */
  get evalService(): EvalService {
    return (this._evalService ??= new EvalService({
      repo: new EvalRepository(this.db),
      agents: this.agentsRepo,
      skills: this.skillsRepo,
      reviews: this.reviewRepo,
      llm: (id) => this.llm(id),
      // Same source order as reviews/diff-loader (git diff, else persisted
      // pr_files patches); composed here to avoid a container <-> module cycle.
      loadPrDiff: async (pull, repo) => {
        try {
          const diff = await this.git.diff({ owner: repo.owner, name: repo.name }, pull.base, pull.headSha);
          if (diff.files.length > 0) return diff.raw;
        } catch {
          /* fall through to pr_files */
        }
        const files = await this.reviewRepo.getPrFiles(pull.id);
        return files
          .filter((f) => f.patch)
          .map((f) => [`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`, f.patch].join('\n'))
          .join('\n');
      },
      readFileAtRef: (ref, sha, path) => this.git.readFileAtRef(ref, sha, path),
      parseDiff: parseUnifiedDiff,
      logger: console,
    }));
  }

  /**
   * CI export / ingest (SPEC-07). Process-wide singleton: the ingest service owns the
   * per-workspace refresh guard and the foreign-run seen-set.
   */
  get ciService(): CiService {
    return (this._ciService ??= new CiService({
      store: new CiRepository(this.db),
      agents: this.agentsRepo,
      github: () => this.github(),
      githubCi: () => this.githubCi(),
      readRunnerBundle: () => this.readRunnerBundle(),
      studioSecretValues: () => this.studioSecretValues(),
      logger: console,
      now: () => new Date(),
    }));
  }

  /** Every file in the built runner's directory (`index.js` + lazy chunks); null if no `index.js`. */
  private async readRunnerBundle(): Promise<CiRunnerBundle | null> {
    if (this.overrides.runnerBundle !== undefined) return this.overrides.runnerBundle;
    const entry = this.config.agentRunnerBundle;
    const dir = dirname(entry);
    let names: string[];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      names = entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    const bundle: Record<string, string> = {};
    for (const name of names) bundle[name] = await readFile(join(dir, name), 'utf8');
    return bundle['index.js'] == null ? null : bundle;
  }

  /** Studio secret values, for the export secret-leak scan (NFR-2). */
  private async studioSecretValues(): Promise<string[]> {
    const keys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GITHUB_TOKEN'];
    const values = await Promise.all(keys.map((k) => this.secrets.get(k).catch(() => undefined)));
    return values.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this);
    return this._repoIntel;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /** SSRF-guarded https text fetcher for `POST /skills/import-url`. */
  get urlFetcher(): UrlFetcher {
    if (this.overrides.urlFetcher) return this.overrides.urlFetcher;
    this._urlFetcher ??= new HttpUrlFetcher();
    return this._urlFetcher;
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token);
    return this._github;
  }

  /** GitHub Actions / repo-tree port. The same client as `github()` unless overridden. */
  async githubCi(): Promise<GitHubCiClient> {
    if (this.overrides.githubCi) return this.overrides.githubCi;
    const client = await this.github();
    if (!('getRepository' in client)) {
      throw new ConfigError('The configured GitHub client does not support CI operations');
    }
    return client as GitHubClient & GitHubCiClient;
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  /**
   * Settings -> Feature Models: the workspace's chosen provider+model for a
   * system LLM feature, else the registry default. Exposed here so feature
   * modules can take it as an injected port instead of importing the settings
   * module's internals.
   */
  resolveFeatureModel(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice> {
    return resolveFeatureModel(this, workspaceId, id);
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this._github = undefined;
    this._embedder = undefined;
  }
}
