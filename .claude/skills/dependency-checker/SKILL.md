---
name: dependency-checker
description: "Check every dependency across all packages in this repo (server, client, reviewer-core, e2e, mcp-server, evals): a Mermaid dependency map, a size breakdown and per-package inventory (kind, category, declared vs resolved version, install size incl. transitive, license, where it is imported), internal path-alias vs external npm dependencies, cross-package version drift, and prioritised P0/P1/P2/Info findings with recommendations. Use when asked to check/review/analyze dependencies, find unused, heavy, outdated, duplicated or vulnerable packages, compare versions across packages, or before adding/upgrading a dependency. Trigger terms: dependency check, dependency checker, dependencies, package size, unused packages, outdated, npm audit, pnpm audit, version drift, licenses, dependency diagram."
metadata:
  tags: dependencies, pnpm, npm, mermaid, security, licenses, maintenance
---

# Dependency Checker

Read-only analysis of every `package.json` in the repo. A zero-dependency script
collects the facts; **you** verify the candidates and write the report. Never edit a
`package.json` or lockfile, never run `pnpm update` / `npm audit fix` / `pnpm remove`
as part of the check — removals and upgrades are **recommendations for the user to
confirm**, not actions you take. Skip `node_modules/` and git-ignored runtime
folders (`clones/`, `.devdigest/cache/`) when looking for imports.

## Report structure (always these 5 sections, in this order)

1. **Scope** — which packages were analyzed (name them), package manager, counts,
   and whether audit / outdated data was collected. Lists **internal** dependencies
   (tsconfig path aliases, relative imports into another package) separately from
   **external** npm dependencies.
2. **Dependency map** — a fenced ```` ```mermaid ```` `flowchart LR` showing packages,
   their heaviest runtime deps, shared deps and internal package-to-package edges.
3. **Size breakdown and inventory** — table per package: dependency, kind
   (runtime/dev/peer/optional), category, declared vs resolved, own size, size with
   transitive, license, usage, flags; plus a version-drift table.
4. **Findings & Priorities** — grouped under explicit tiers **P0, P1, P2, Info**, never
   an unranked list. Every finding names the package, the dependency (or file) and the
   `package.json`/file location.
5. **Summary** — 3–5 concrete takeaways ordered by priority, each naming a package and
   an action, phrased as "recommend / please confirm".

Details and templates: [references/report-format.md](references/report-format.md).
Tier definitions, verification and recommendation style:
[references/prioritization.md](references/prioritization.md).

## Workflow

1. **Collect.** From the repo root:
   ```
   node .claude/skills/dependency-checker/scripts/audit-deps.mjs --audit --outdated
   ```
   - Sizes, licences and resolved versions need `node_modules`; if a package lacks them
     say so (don't install unasked).
   - `--audit` / `--outdated` use the registry; if unavailable the report says so —
     state plainly that vulnerability/outdated data is missing instead of implying clean.
   - Flags: `--packages server,client`, `--out <dir>` (default `docs/dependency-check/`),
     `--top 8`, `--no-write`. Outputs `deps-report.md` + `deps.json`.
   - If the script can't run (no Node, no repo access), do the same analysis by hand from
     the `package.json` files, lockfiles, `tsconfig` `paths`, `du`, and grep for imports,
     and still deliver the 5 sections.
2. **Verify** every P0–P2 candidate by opening the code (see prioritization.md →
   "Verifying"). Drop false positives and say why.
3. **Write** the final report in the 5-section structure. Replace mechanical actions with
   specific, repo-aware recommendations; merge related findings (one "align zod" item,
   not three).

## Repo-specific rules

- **Not a monorepo.** Packages are standalone with their own lockfiles; code is shared
  via tsconfig `paths` (e.g. `@devdigest/shared` vendored into `server/src/vendor/shared`
  and `client/src/vendor/shared`; `server` and `reviewer-core` alias each other's
  `src`). Never describe them as `workspace:*` or pnpm workspaces.
- **Internal ≠ external.** Path-alias and relative cross-package imports are internal
  dependencies; treat them separately from npm packages. A relative import that reaches
  into another package's internals (e.g. `server/src/services/x.ts` →
  `../../../reviewer-core/src/pipeline.js`) bypasses its public entry point — call it out
  explicitly (P0/P1) and recommend importing through the alias / `index.ts`.
- **Version drift** between `server`, `client` and `reviewer-core` for `zod`/`openai`
  (shared contracts) is higher risk than drift of tooling (`typescript`, `tsx`,
  `@types/node`, `vitest`). Name each differing version.
- **Unused** = declared but no import under that package's source (e.g. a `moment` in
  `server/package.json` with no import in `server/src`). Check dynamic / string loading
  before recommending removal, and present removal as a recommendation to confirm.
- `reviewer-core` must stay pure (no DB/GitHub/fs): a new I/O dependency there is an
  architectural finding, not only a size one.
- `e2e/` and `evals/` ship nothing: "devDependency imported by production source" there
  is usually Info, not a runtime bug.
- Install size is **not** bundle size — never claim client bundle impact from it.

## Common false positives (verify before reporting)

| Script signal | Why it may be wrong | How to confirm |
|---|---|---|
| "unused" `@types/*` | Type packages are never imported by name | Check `tsconfig` `types` / ambient usage; usually Info, not unused |
| "unused" CLI tool (`tsx`, `vitest`, `drizzle-kit`, `dependency-cruiser`) | Used from `package.json` scripts, not source | Grep the package's `scripts` block |
| "unused" plugin / preset (`@vitejs/*`, `eslint-*`, `postcss`) | Loaded by a config file by string name | Grep `*.config.*` files in that package |
| "unused" runtime dep in `client/` | Next.js loads some deps implicitly (`sharp`, `react-dom`) | Treat as Info unless clearly orphaned |
| version drift on a dev-only tool | Tooling drift rarely affects runtime | Downgrade to P2/Info unless it changes types of shared contracts |
| "duplicate" between `server` and `reviewer-core` | Separate lockfiles by design (not a monorepo) | Only report when the two versions disagree on a shared contract dep |

When a signal matches a row above, either confirm it with the listed check or drop
it — never ship it as a P0/P1 on the script's word alone.

## Do not

- Do not execute removals, upgrades or `audit fix`.
- Do not report a script finding as fact without having looked at the code.
- Do not use vague advice ("consider optimizing dependencies"); always name the package,
  dependency and file.
- Do not commit the generated report unless asked.
