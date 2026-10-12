/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionFindingAnchors, type DiffFindingApi, type FindingAnchor } from "../findings";
import { s, fs, fcs, chevronFor } from "../styles";
import { resolveFocusLine, scrollBehaviorFor, type DiffFocusApi } from "../focus";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Whether a file starts expanded when nobody has toggled it. */
export function isAutoExpanded(file: PrFile): boolean {
  return (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES;
}

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Finding anchors pinned to a given parsed line (new side only). */
function anchorsForLine(ln: Line, matched: Map<string, FindingAnchor[]>): FindingAnchor[] {
  if (matched.size === 0) return [];
  const out: FindingAnchor[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
  open: controlledOpen,
  onToggle,
  focus,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Controlled open state (e.g. a group's expand/collapse all); omit for local state. */
  open?: boolean;
  onToggle?: () => void;
  /** Brief-navigation focus request; omit for the default rendering. */
  focus?: DiffFocusApi;
}) {
  const t = useTranslations("shell");
  const [localOpen, setLocalOpen] = React.useState(isAutoExpanded(file));
  const open = controlledOpen ?? localOpen;
  const toggle = onToggle ?? (() => setLocalOpen((o) => !o));
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Brief-navigation focus. Derived at render; the one effect below only syncs DOM.
  const focusTarget = focus?.target && focus.target.path === file.path ? focus.target : null;
  const resolution = React.useMemo(
    () => (focusTarget ? resolveFocusLine(lines, focusTarget.line) : null),
    [focusTarget, lines],
  );
  const focusNonce = focusTarget?.nonce ?? null;
  // Uncontrolled card: open it once per new nonce ("adjust state when a prop changes").
  const [seenNonce, setSeenNonce] = React.useState<number | null>(null);
  if (focusNonce !== null && focusNonce !== seenNonce) {
    setSeenNonce(focusNonce);
    if (controlledOpen === undefined) setLocalOpen(true);
  }
  const [headerFocused, setHeaderFocused] = React.useState(false);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const targetRowRef = React.useRef<HTMLDivElement>(null);
  const targetIndex = resolution && (resolution.kind === "line" || resolution.kind === "hunk") ? resolution.index : -1;

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  // Same split for review findings: anchored to a rendered new-side line vs not.
  const { findingsByKey, unanchored } = React.useMemo(() => {
    const empty = new Map<string, FindingAnchor[]>();
    if (!findings) return { findingsByKey: empty, unanchored: [] as FindingAnchor[] };
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    const part = partitionFindingAnchors(findings.anchorsFor(file.path), renderedKeys);
    return { findingsByKey: part.matched, unanchored: part.unanchored };
  }, [findings, file.path, lines]);
  const hasFindings = !!findings && findings.hasOpenFindings(file.path);

  const findingTotal = findings?.openFindingCount?.(file.path) ?? 0;
  // First finding by line; clicking the header indicator jumps to it.
  const firstFinding = React.useMemo(
    () => (findings ? [...findings.anchorsFor(file.path)].sort((a, b) => a.line - b.line)[0] : undefined),
    [findings, file.path],
  );
  const [pendingJump, setPendingJump] = React.useState(false);
  React.useEffect(() => {
    if (!pendingJump || !open || !firstFinding) return;
    setPendingJump(false);
    document.getElementById(`finding-${firstFinding.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [pendingJump, open, firstFinding]);
  React.useEffect(() => {
    if (focusNonce === null || !open || !focus || !resolution) return;
    const el = resolution.kind === "line" || resolution.kind === "hunk" ? targetRowRef.current : headerRef.current;
    if (!el || !focus.claim(focusNonce)) return;
    el.scrollIntoView({ behavior: scrollBehaviorFor(window), block: "center" });
    el.focus({ preventScroll: true });
  }, [focusNonce, open, resolution, focus]);
  const jumpToFinding = (e: React.MouseEvent) => {
    e.stopPropagation(); // don't toggle the card header
    if (!firstFinding) return;
    if (!open) toggle();
    if (findings?.isHidden?.(firstFinding.id)) findings.onToggleHidden?.([firstFinding.id]);
    setPendingJump(true);
  };

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div
        ref={headerRef}
        tabIndex={focus ? -1 : undefined}
        onClick={toggle}
        onFocus={focus ? (e) => e.target === e.currentTarget && setHeaderFocused(true) : undefined}
        onBlur={focus ? (e) => e.target === e.currentTarget && setHeaderFocused(false) : undefined}
        style={headerFocused ? { ...s.fileHeader, ...fcs.focusOutline } : s.fileHeader}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {hasFindings && (
          <button
            type="button"
            onClick={jumpToFinding}
            title={t("diffViewer.goToFinding")}
            aria-label={t("diffViewer.goToFinding")}
            style={fs.jump}
          >
            <span aria-hidden="true" style={fs.dot} />
            {findingTotal > 0 && <span className="mono tnum">{findingTotal}</span>}
          </button>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            resolution?.kind === "no_diff" && focus ? (
              <div role="status" style={fcs.noDiffStatus}>
                {focus.noDiffLabel}
              </div>
            ) : (
              <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
            )
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findingAnchors={anchorsForLine(ln, findingsByKey)}
                renderFinding={findings?.renderFinding}
                isHidden={findings?.isHidden}
                onToggleHidden={findings?.onToggleHidden}
                toggleLabel={t("diffViewer.toggleFinding")}
                rowRef={i === targetIndex ? targetRowRef : undefined}
                highlighted={resolution?.kind === "line" && i === targetIndex}
                targetMarkerLabel={focus?.targetMarkerLabel}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && unanchored.length > 0 && (
            <div style={fs.outsideWrap}>
              <span style={fs.outsideTitle}>{t("diffViewer.findingsOutsideDiff")}</span>
              {unanchored
                .filter((a) => !findings.isHidden?.(a.id))
                .map((a) => (
                  <div key={a.id} id={`finding-${a.id}`}>
                    {findings.renderFinding(a.id)}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
