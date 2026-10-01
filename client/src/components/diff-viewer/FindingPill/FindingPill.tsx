/* FindingPill — compact severity pill (icon + label) shown at the right of a
   diff row that has a review finding anchored to it. */
import React from "react";
import { Icon, SEV, type Severity } from "@devdigest/ui";
import { pillFor } from "./styles";

export function FindingPill({ severity }: { severity: Severity }) {
  const sev = SEV[severity];
  const I = Icon[sev.icon];
  return (
    <span style={pillFor(sev.c, sev.bg)}>
      <I size={11} />
      {sev.label}
    </span>
  );
}
