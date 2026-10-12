/* useBriefNavigation — resolves a brief file reference against the PR's own
   changed-file list (exact path match only; brief paths are untrusted model
   output) and either asks the parent to focus it in the diff or records which
   reference is "not in this PR's diff". No fetching: files come in as input. */
"use client";

import React from "react";
import type { PrFile } from "@devdigest/shared";
import { resolveBriefTarget } from "./helpers";

export function useBriefNavigation(
  files: readonly PrFile[] | undefined,
  onFocusFile?: (file: string, line: number | null) => void,
) {
  const [notInDiffKey, setNotInDiffKey] = React.useState<string | null>(null);
  const filePaths = React.useMemo(() => new Set((files ?? []).map((f) => f.path)), [files]);
  const canNavigate = !!files && !!onFocusFile;

  function navigate(key: string, file: string, line: number | null | undefined) {
    const target = resolveBriefTarget(filePaths, file, line);
    if (target.kind === "not_in_diff") {
      setNotInDiffKey(key);
      return;
    }
    setNotInDiffKey(null);
    onFocusFile?.(target.path, target.line);
  }

  return { canNavigate, notInDiffKey, navigate };
}
