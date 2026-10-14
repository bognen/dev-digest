/* RegressionBanner — AC-41 warning when the latest full run dropped a metric
   by ≥ 1 point vs the previous one. Text comes from the server (`alert`). */
import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function RegressionBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div role="alert" style={s.banner}>
      <Icon.AlertTriangle size={16} style={s.icon} />
      <span>{text}</span>
    </div>
  );
}
