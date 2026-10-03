/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { type FindingAnchor } from "../findings";
import { s, fs, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { FindingPill } from "../FindingPill";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findingAnchors,
  renderFinding,
  isHidden,
  onToggleHidden,
  toggleLabel,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Review findings pinned to this line (independent of showComments). */
  findingAnchors?: FindingAnchor[];
  renderFinding?: (id: string) => React.ReactNode;
  isHidden?: (id: string) => boolean;
  onToggleHidden?: (ids: string[]) => void;
  toggleLabel?: string;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  return (
    <div
      id={findingAnchors && findingAnchors.length > 0 ? `finding-${findingAnchors[0]!.id}` : undefined}
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={lineRowFor(ln.kind)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {findingAnchors && findingAnchors.length > 0 && (
          <span style={fs.pillStack}>
            {findingAnchors.map((a) => (
              <FindingPill
                key={a.id}
                severity={a.severity}
                onClick={onToggleHidden ? () => onToggleHidden([a.id]) : undefined}
                expanded={!isHidden?.(a.id)}
                label={toggleLabel}
              />
            ))}
          </span>
        )}
      </div>

      {renderFinding &&
        findingAnchors
          ?.filter((a) => !isHidden?.(a.id))
          .map((a) => (
            <div key={a.id} style={fs.rail}>
              {renderFinding(a.id)}
            </div>
          ))}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
