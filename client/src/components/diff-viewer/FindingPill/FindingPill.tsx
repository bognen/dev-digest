/* FindingPill — compact severity pill (icon + label) shown at the right of a
   diff row that has a review finding anchored to it. */
import React from "react";
import { Icon, SEV, type Severity } from "@devdigest/ui";
import { pillFor } from "./styles";

export function FindingPill({
  severity,
  onClick,
  expanded,
  label,
}: {
  severity: Severity;
  /** When set, the pill toggles its finding(s) open/closed. */
  onClick?: () => void;
  expanded?: boolean;
  label?: string;
}) {
  const sev = SEV[severity];
  const I = Icon[sev.icon];
  const body = (
    <>
      <I size={11} />
      {sev.label}
    </>
  );
  if (!onClick) return <span style={pillFor(sev.c, sev.bg)}>{body}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={expanded}
      aria-label={label}
      title={label}
      style={{ ...pillFor(sev.c, sev.bg), border: "none", cursor: "pointer" }}
    >
      {body}
    </button>
  );
}
