/** A `Risk.file_refs` entry's documented encoding (server/vendor/shared's
 *  `Risk.file_refs` doc comment): `"<path>"` or `"<path>:<line>"`, always
 *  server-constructed. Splits back into the two parts for rendering/linking —
 *  a trailing `:<digits>` is treated as the line; anything else (including a
 *  path that happens to contain a colon with a non-numeric tail) is left
 *  whole. */
export function splitFileRef(ref: string): { file: string; line: number | undefined } {
  const idx = ref.lastIndexOf(":");
  if (idx === -1) return { file: ref, line: undefined };
  const tail = ref.slice(idx + 1);
  if (!/^\d+$/.test(tail)) return { file: ref, line: undefined };
  return { file: ref.slice(0, idx), line: Number(tail) };
}

/** Resolve a brief reference against the PR's changed files. Exact
 *  `Set.has(file)` only: no trimming, case-folding, or URL/route building. */
export function resolveBriefTarget(
  filePaths: ReadonlySet<string>,
  file: string,
  line: number | null | undefined,
): { kind: "in_diff"; path: string; line: number | null } | { kind: "not_in_diff" } {
  if (!filePaths.has(file)) return { kind: "not_in_diff" };
  return { kind: "in_diff", path: file, line: line ?? null };
}

/** Brief paths are untrusted model output: only build GitHub links for plain repo-relative paths
 *  (no `.`/`..` segments, backslashes, control chars, leading `/`, or scheme-like prefix). */
export function isSafeRepoPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return false;
  return path.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}
