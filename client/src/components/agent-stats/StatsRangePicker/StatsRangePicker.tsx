/* StatsRangePicker — 1 day / 30 days / Custom (UTC days) range selector shared
   by the agent Stats tab and the Agent Performance dashboard. Controlled: the
   caller owns the state (see useStatsRange). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip } from "@devdigest/ui";
import { defaultCustom, MAX_RANGE_DAYS, type RangePreset, type StatsRangeState } from "@/lib/stats-range";
import { PRESETS } from "./constants";
import { s } from "./styles";

export function StatsRangePicker({
  state,
  invalid,
  onChange,
}: {
  state: StatsRangeState;
  /** True when a custom range cannot be resolved (shows the inline hint). */
  invalid: boolean;
  onChange: (next: StatsRangeState) => void;
}) {
  const t = useTranslations("agentPerformance");
  const pick = (preset: RangePreset) => {
    if (preset === state.preset) return;
    onChange(preset === "custom" ? { preset, ...defaultCustom(new Date()) } : { preset });
  };
  return (
    <div style={s.wrap}>
      <div role="group" aria-label={t("range.label")} style={s.chips}>
        {PRESETS.map((p) => (
          <Chip key={p} icon={p === "custom" ? "Calendar" : undefined} active={state.preset === p} onClick={() => pick(p)}>
            {t(`range.${p}`)}
          </Chip>
        ))}
      </div>
      {state.preset === "custom" && (
        <div style={s.custom}>
          <label style={s.field}>
            <span style={s.fieldLabel}>{t("range.from")}</span>
            <input
              type="date"
              style={s.input}
              value={state.from ?? ""}
              max={state.to}
              onChange={(e) => onChange({ ...state, from: e.target.value })}
            />
          </label>
          <label style={s.field}>
            <span style={s.fieldLabel}>{t("range.to")}</span>
            <input
              type="date"
              style={s.input}
              value={state.to ?? ""}
              min={state.from}
              onChange={(e) => onChange({ ...state, to: e.target.value })}
            />
          </label>
          <span style={s.hint}>{t("range.utc")}</span>
        </div>
      )}
      {invalid && (
        <p role="alert" style={s.invalid}>
          {t("range.invalid", { max: MAX_RANGE_DAYS })}
        </p>
      )}
    </div>
  );
}
