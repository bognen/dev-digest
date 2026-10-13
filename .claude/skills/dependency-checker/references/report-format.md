# Report format

`deps-report.md` (generated) and your final answer use the same five sections, in this
order, so reports stay diff-able between runs.

| § | Section | Content |
|---|---|---|
| 1 | **Scope** | Packages analyzed (named), manager, runtime/dev/peer counts, unique packages installed, total install size, lockfile. **Internal** dependencies (tsconfig `paths`, relative imports into another package) listed apart from external npm deps. Notes on missing `node_modules` / audit / outdated data. |
| 2 | **Dependency map** | Mermaid `flowchart LR`: a subgraph per package with its top-N runtime deps by size (`name<br/>version · size`), shared deps in a middle cluster, thick arrows for internal package edges, red = P0/P1. |
| 3 | **Size breakdown and inventory** | Per package: dependency, kind, category, declared, resolved, own size, with-transitive, transitive count, license, used src/test/cfg, flags. Then a version-drift table (deps declared in 2+ packages). |
| 4 | **Findings & Priorities** | Sub-headings **P0 — fix now**, **P1 — fix this sprint**, **P2 — schedule**, **Info — opportunistic**. Each finding: ID, rule, package, dependency/file, detail, action. |
| 5 | **Summary** | 3–5 takeaways ordered by priority, each naming a package and a specific action, phrased as a recommendation to confirm. |

## Verified report additions (you)

After verification, state in §4 (or a short note under it):

- **Rejected candidates** — flagged by the script but false on inspection, with reason.
- **Deliberately left alone** — real but accepted (e.g. exact pin in `mcp-server`), with the revisit condition.
- **Not checked** — audit/outdated offline, packages without `node_modules`.

## Recommendation block (use in §4 / §5)

```
P1 · Remove `@fastify/autoload` (server/package.json)      effort: XS
Why:  declared in dependencies, never imported; modules are registered explicitly
      in server/src/modules/index.ts.
How:  cd server && pnpm remove @fastify/autoload && pnpm typecheck && pnpm test
Risk: none found (grep for dynamic/string loading is empty). Please confirm first.
```

## Chat answer

1. One-line verdict + counts (`0 P0 · 4 P1 · 5 P2 · 6 Info`).
2. The §5 takeaways (top 3–5), plus the Mermaid diagram if asked for inline.
3. What could not be checked.
4. Path to the full report.

## Diagram conventions

- Only runtime dependencies are drawn; dev tooling is in the inventory.
- Over ~40 nodes → rerun with `--top 5` or `--packages …` per area.
- GitHub and the studio's markdown viewer render Mermaid; the fenced source stays readable elsewhere.
