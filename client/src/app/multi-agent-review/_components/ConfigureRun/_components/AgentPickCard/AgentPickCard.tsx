/* AgentPickCard — one selectable agent on the Configure run screen
   (design: PersonaPickCard). A keyboard-operable checkbox: checkbox, colored
   icon tile, name, description and the right-aligned "X.Xs · $Y.YY" estimate. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function AgentPickCard({
  name,
  description,
  color,
  on,
  estimate,
  onToggle,
}: {
  name: string;
  description: string;
  /** CSS color token from `agentColor`. */
  color: string;
  on: boolean;
  /** Pre-formatted estimate ("8.2s · $0.06" or "—"). */
  estimate: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={name}
      onClick={onToggle}
      style={s.card(on, color)}
    >
      <span aria-hidden style={s.box(on, color)}>
        {on && <Icon.Check size={12} style={s.check} />}
      </span>
      <div aria-hidden style={s.tile(color)}>
        <Icon.Cpu size={16} />
      </div>
      <div style={s.text}>
        <div style={s.name}>{name}</div>
        <div style={s.description}>{description}</div>
      </div>
      <span className="mono tnum" style={s.estimate}>
        {estimate}
      </span>
    </button>
  );
}
