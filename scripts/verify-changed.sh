#!/usr/bin/env bash
#
# Token-cheap mechanical gate for agents (and humans): verify only what changed.
#
#   ./scripts/verify-changed.sh            # typecheck + tests related to the diff
#   ./scripts/verify-changed.sh --full     # also run each touched package's whole
#                                          # unit suite (server: unit lane only)
#
# Per touched package (server, client, reviewer-core, mcp-server):
#   - typecheck
#   - `vitest related --run <changed files>` (unit lane; never *.it.test.ts)
#   - --full: the package's full unit suite instead of `related`
# Plus: `pnpm arch:check` when server layers or reviewer-core changed, and
# check-vendor-shared-sync.sh when a vendor/shared dir changed.
#
# Output contract: ONE line per check on success; on failure the last 40 lines
# of that check's log. Full logs: .devdigest/cache/verify/<check>.log
# (git-ignored). Exit code is non-zero if any check failed.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
FULL=0
[ "${1:-}" = "--full" ] && FULL=1

LOGDIR="$ROOT/.devdigest/cache/verify"
mkdir -p "$LOGDIR"

BASE="$(git merge-base main HEAD 2>/dev/null || git rev-parse HEAD)"
CHANGED="$( { git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u )"
if [ -z "$CHANGED" ]; then
  echo "verify-changed: no changes vs $(git rev-parse --short "$BASE")"
  exit 0
fi

FAILED=0

# run <name> <dir> <cmd...> — quiet on success, tail on failure.
run() {
  local name="$1" dir="$2"; shift 2
  local log="$LOGDIR/$name.log"
  if (cd "$ROOT/$dir" && "$@") >"$log" 2>&1; then
    echo "PASS  $name"
  else
    FAILED=1
    echo "FAIL  $name   (full log: ${log#$ROOT/})"
    tail -n 40 "$log"
  fi
}

for pkg in server client reviewer-core mcp-server; do
  files="$(printf '%s\n' "$CHANGED" | grep -E "^$pkg/" | sed "s#^$pkg/##" || true)"
  [ -z "$files" ] && continue

  if [ "$pkg" = "reviewer-core" ]; then RUN=(npm run --silent); EXEC=(npx); else RUN=(pnpm --silent); EXEC=(pnpm exec); fi

  run "$pkg-typecheck" "$pkg" "${RUN[@]}" typecheck

  vt_args=(--run --passWithNoTests --reporter=dot)
  [ "$pkg" = "server" ] && vt_args+=(--exclude '**/*.it.test.ts')
  if [ "$FULL" = 1 ]; then
    run "$pkg-tests" "$pkg" "${EXEC[@]}" vitest "${vt_args[@]}"
  else
    src_files=()
    while IFS= read -r f; do src_files+=("$f"); done < <(printf '%s\n' "$files" | grep -E '\.(ts|tsx)$' || true)
    # Chunk the file list: Windows caps the command line (~32k chars), and a big
    # feature touches hundreds of files.
    chunk=40
    for ((i = 0; i < ${#src_files[@]}; i += chunk)); do
      n=$((i / chunk + 1))
      run "$pkg-tests-related-$n" "$pkg" "${EXEC[@]}" vitest related "${vt_args[@]}" "${src_files[@]:i:chunk}"
    done
  fi
done

if printf '%s\n' "$CHANGED" | grep -qE '^(server/src/(modules|platform|adapters|db)/|reviewer-core/src/)'; then
  run "server-arch-check" server pnpm --silent arch:check
fi
if printf '%s\n' "$CHANGED" | grep -qE '/vendor/shared/'; then
  run "vendor-shared-sync" . bash scripts/check-vendor-shared-sync.sh
fi

[ "$FAILED" = 0 ] && echo "verify-changed: all checks passed" || echo "verify-changed: FAILURES above"
exit "$FAILED"
