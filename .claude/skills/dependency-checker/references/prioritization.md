# Prioritization and recommendations

## Priority levels

| Level | Meaning | Typical SLA | Rules that produce it |
|---|---|---|---|
| **P0** | Exploitable or breaking now | Fix today | `vulnerability` critical/high in a **runtime** dependency |
| **P1** | Likely bug, risk or legal issue | This sprint | `vulnerability` moderate; `unused-runtime`; `dev-dep-in-src`; `cross-package-relative-import`; `copyleft-license` (non-dual); `deprecated`; `no-lockfile` |
| **P2** | Maintenance debt that grows | Schedule | `version-drift` (resolved versions differ); `unused-dev`; `runtime-only-in-tests`; `outdated-major` ≥ 2 majors |
| **Info** | Hygiene / awareness | Opportunistic | `heavy-dependency`; `range-drift`; `unpinned-range`; `install-script`; `types-in-runtime`; `outdated-major` = 1 |

## Adjust before reporting

The script's level is a starting point. Move a finding **up** or **down** using:

- **Reachability:** a vulnerability in a dev-only tool is at most P2; in code that
  parses untrusted input (GitHub webhooks, PR diffs, LLM output) it stays P0.
- **Blast radius:** drift of `zod`/`openai` (shared contracts, vendored `shared`) → up
  one level; drift of `@types/node`/`tsx` → down one.
- **Package role:** `e2e/`, `evals/` ship nothing → `dev-dep-in-src` there is Info.
- **Effort:** if a P2 is a one-line removal, say so — cheap items go first within a level.

Order within a level: security > correctness > legal > size > style.

## Verifying (required for every P0–P2)

| Rule | How to confirm | Drop it when |
|---|---|---|
| `unused-runtime` / `unused-dev` | `grep -rn "<name>"` across the package incl. configs, scripts, `docs/`; check for `require.resolve`, dynamic `import()`, plugin-by-name loading | It is loaded by name, is a peer of another dep, or is a CLI used in CI (`.github/workflows`) |
| `dev-dep-in-src` | Open the cited file: is it really shipped/run in production? Is the import `import type`? | File is a test harness, script or tooling entry; package is private tooling |
| `runtime-only-in-tests` | Same; check `Dockerfile`/start scripts for prod-install flags | Used by a runtime path the scanner can't see |
| `version-drift` | Read both manifests + lockfiles; is the pin intentional (comment, commit message, `AGENTS.md`)? | Divergence is documented/required |
| `vulnerability` | Read the advisory: affected range, vulnerable function, is it reachable here? Is a patched version available within the declared range? | Not reachable AND no fix exists → downgrade, don't drop silently |
| `copyleft-license` | Read the actual `LICENSE`; confirm how it is linked/distributed | Dual-licensed with a permissive option (script already skips `MIT OR GPL`) |
| `outdated-major` | Skim the changelog for breaking changes touching used APIs | — (keep, but state the effort) |

## Writing a recommendation

Each item states **what, where, why, how, cost** in one short block:

```
P1 · Remove `@fastify/autoload` (server)          effort: XS
Why:   declared in dependencies but never imported; modules are registered
       explicitly in server/src/modules/index.ts (comment on line 23).
How:   cd server && pnpm remove @fastify/autoload && pnpm typecheck && pnpm test
Risk:  none found; no string/dynamic reference (grep verified).
```

Rules: name the exact command; name the verification step (`pnpm typecheck`,
`pnpm test`, `pnpm arch:check` where relevant); never suggest `latest`; for
upgrades name the target version and the breaking changes you checked.

Close with a **suggested order** (max 5 steps) so a developer can start immediately,
and a short "Not recommended / deliberately left alone" list for things you verified
and decided to keep (with the reason) — it stops the next audit repeating the work.
