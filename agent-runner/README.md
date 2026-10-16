# @devdigest/agent-runner

The **DevDigest CI runner** — a standalone CLI that runs a DevDigest review agent
inside a *target repository's own CI* (GitHub Actions), entirely outside this
repo's server, its DI graph, and its Postgres instance.

`src/index.ts` is `ncc`-bundled into a single self-contained `dist/index.js`,
embedded as `.devdigest/runner/index.js` in the exported `devdigest/ci` PR, and
executed by the target repo's workflow as `node .devdigest/runner/index.js`.

## What it does

0. **Skips** fork and Dependabot runs first (GitHub withholds secrets from them):
   writes a `::notice` annotation + job-summary line, exits 0, no LLM call, no
   post, no artifact.
1. **Loads + validates** exactly one agent folder, `.devdigest/agents/<slug>/`
   (`<slug>` = `DEVDIGEST_AGENT_SLUG`): `manifest.yaml` (validated against
   `AgentManifest`), `skills/<skill-slug>.md` bodies, and the optional opt-in
   `memory.jsonl` (`{"kind","scope","content"}` per line; `content` is passed to
   the engine as memory). No other agent folder is ever read.
2. **Resolves the PR context** (owner / repo / number / title / body / fork flag)
   from CI env vars + the `pull_request` event payload.
3. **Fetches the PR diff** via the GitHub REST API (native `fetch`, no octokit)
   and strips DevDigest's own exported files (`.devdigest/**`, this agent's
   generated workflow) then applies the diff size cap before parsing. Over the
   cap, the largest files are reviewed and the rest are listed as skipped: the
   result is `partial`, and a "Partial review" section (skipped paths in a safe
   fenced block + the caps applied) is appended to the posted body and the job
   summary.
4. **Runs the exact same `reviewer-core` pipeline** a local studio review uses —
   `assemblePrompt` / `wrapUntrusted` / `completeStructured` / mandatory
   `groundFindings` gate — via `reviewPullRequest`, with an injected
   `OpenRouterProvider`.
5. **Computes a deterministic verdict** from the *grounded* findings + the
   manifest's `ci_fail_on` (`countBlockers` / `gateTriggered`), never from the
   model's self-reported verdict.
6. **Writes `devdigest-result.json`** (`CiResultArtifact`, a strict allowlist: repo
   id/name, PR number, head SHA, run id/attempt, agent name/slug, version,
   verdict, counts, blockers, cost, duration, `partial`, skipped paths) — the artifact the
   studio ingests — then **posts** to the PR (`github_review` | `pr_comment` |
   `none`) and **exits non-zero iff** the gate triggered `REQUEST_CHANGES`.

All orchestration lives in `src/run.ts` (`runCi`), which takes every side effect
(fs, `fetch`, LLM provider, clock, diff retrieval) as an injectable dependency so
it can be unit-tested hermetically. `src/index.ts` only wires those to the real
world and maps the result onto `process.exitCode`.

## Requirements — sibling source packages

This package is **not fully self-contained on its own**. It consumes
`reviewer-core` and the shared Zod contracts **as raw TypeScript source** via
`tsconfig.json` path aliases (exactly like the server does — this is intended,
not a workaround; `reviewer-core` emits no JS). To typecheck, test, or build the
runner, these folders **must exist as siblings** in the expected layout:

```
<repo-root>/
├── agent-runner/                      # this package
│   └── tsconfig.json                  # declares the aliases below
├── reviewer-core/
│   └── src/index.ts                   # → @devdigest/reviewer-core
└── server/
    └── src/vendor/shared/
        └── index.ts                   # → @devdigest/shared
```

Path aliases declared in `agent-runner/tsconfig.json`:

| Alias | Resolves to |
|-------|-------------|
| `@devdigest/reviewer-core` | `../reviewer-core/src/index.ts` |
| `@devdigest/reviewer-core/*` | `../reviewer-core/src/*` |
| `@devdigest/shared` | `../server/src/vendor/shared/index.ts` |
| `@devdigest/shared/*` | `../server/src/vendor/shared/*` |

If you lift this module onto a fresh branch or repo, bring `reviewer-core/` and
`server/src/vendor/shared/` along (or re-point the aliases). `pnpm build` (`ncc`)
inlines both packages plus their transitive deps into `dist/index.js`, so the
**shipped bundle** has zero runtime imports from `node_modules/@devdigest/*` — the
sibling requirement is a **build/dev-time** requirement only.

## Commands

```bash
pnpm install        # install deps (yaml, zod + dev tooling)
pnpm typecheck      # tsc --noEmit -p tsconfig.json
pnpm test           # vitest run (hermetic; LLM stubbed, no network)
pnpm build          # ncc build src/index.ts -o dist  →  dist/index.js
```

`dist/` and `node_modules/` are git-ignored — `dist/index.js` is a generated
artifact, regenerate it with `pnpm build`.

## Runtime environment (set by the target repo's workflow)

The runner reads these directly from `process.env`. This is the **correct and
only** channel for secrets here: the bundle runs in someone else's CI, where
there is no `SecretsProvider` / DI graph to inject from (see `CLAUDE.md`).

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | yes (hard-fail if empty, except on skipped fork/Dependabot runs) | LLM credential → `OpenRouterProvider` |
| `DEVDIGEST_AGENT_SLUG` | yes | agent folder to load; must match the slug pattern |
| `GITHUB_TOKEN` | when `post_as` ≠ `none` | fetch the diff + post the review/comment |
| `GITHUB_REPOSITORY` | yes | `owner/name` of the target repo |
| `GITHUB_REPOSITORY_ID` | auto (GHA) | numeric repo id (falls back to event `repository.id`) |
| `GITHUB_RUN_ID` / `GITHUB_RUN_ATTEMPT` | auto (GHA) | recorded in the artifact (attempt defaults to 1) |
| `GITHUB_TRIGGERING_ACTOR` / `GITHUB_ACTOR` | auto (GHA) | `dependabot[bot]` → run is skipped |
| `GITHUB_STEP_SUMMARY` | auto (GHA) | job-summary file (skip notice, partial review) |
| `PR_NUMBER` | yes¹ | PR to review |
| `GITHUB_EVENT_PATH` | auto (GHA) | `pull_request` event payload (title/body/head SHA/fork) |
| `DEVDIGEST_DIR` | no | override the `.devdigest` dir (default: `cwd/.devdigest`) |
| `DEVDIGEST_RESULT_PATH` | no | override artifact path (default: `cwd/devdigest-result.json`) |
| `DEVDIGEST_POST_AS` | no | `github_review` (default) \| `pr_comment` \| `none` |
| `DEVDIGEST_MAX_DIFF_BYTES` | no | diff size cap in bytes (default 204800) |
| `DEVDIGEST_MAX_DIFF_LINES` | no | diff cap in changed lines (default 3000) |

¹ Falls back to `pull_request.number` from the event payload if `PR_NUMBER` is unset.

Secrets are never logged and never written to `devdigest-result.json` or any
posted comment. Failures print one error line with the `OPENROUTER_API_KEY` /
`GITHUB_TOKEN` values and their first 8 characters masked (`src/redact.ts`).

## Exit codes

- `0` — review completed; the deterministic gate did **not** request changes, or
  the run was skipped (fork / Dependabot).
- `1` — gate triggered `REQUEST_CHANGES`, **or** a hard failure anywhere in the
  pipeline (missing `OPENROUTER_API_KEY`, invalid manifest, missing skill file, unresolvable CI context,
  diff-fetch error, or an LLM/model-call error). On hard failure the runner posts
  nothing and writes no artifact — a failure upstream of "we have a grounded
  review" produces **nothing**, never a synthetic review.

## Invariants (do not break)

Because this package embeds `reviewer-core`'s pipeline into an artifact that
leaves this repo, it must preserve every reviewer-core invariant:

- The `groundFindings()` gate is mandatory — never skip or make it conditional.
  An all-dropped result is a valid zero-finding APPROVE, not an error.
- `wrapUntrusted()` + `INJECTION_GUARD` must wrap the diff and PR body before they
  reach the prompt — reuse `assemblePrompt`; never hand-roll it.
- The posted verdict and exit code come from the **deterministic** gate against
  the manifest's `ci_fail_on`, never the model's self-reported verdict.

See `CLAUDE.md` for the full rationale and `insights/INSIGHTS.md` for gotchas.
