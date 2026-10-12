/* Left column of the Project Context page: discovered docs grouped by root, each row showing
   path, root tag, approximate token count, usage counter and a text "Too large" marker. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ProjectDocListItem } from "@devdigest/shared";
import { groupByRoot } from "../../helpers";
import { s } from "./styles";

interface DocListProps {
  docs: ProjectDocListItem[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function DocList({ docs, selectedPath, onSelect }: DocListProps) {
  const t = useTranslations("context");
  const groups = groupByRoot(docs);

  return (
    <nav style={s.list} aria-label={t("list.label")}>
      {groups.map((g) => (
        <section key={g.root} aria-label={t("list.groupLabel", { root: g.root })}>
          <div style={s.groupLabel}>{t("list.group", { root: g.root, count: g.docs.length })}</div>
          {g.docs.map((d) => {
            const active = d.path === selectedPath;
            return (
              <button
                key={d.path}
                type="button"
                style={{ ...s.row, ...(active ? s.rowActive : null) }}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(d.path)}
              >
                <span className="mono" style={s.path}>
                  {d.path}
                </span>
                <span style={s.meta}>
                  <Badge mono>{d.root}</Badge>
                  {d.too_large ? (
                    <Badge>{t("list.tooLarge")}</Badge>
                  ) : (
                    d.tokens !== null && <span>{t("list.tokens", { count: d.tokens })}</span>
                  )}
                  <span>{t("list.usedBy", { count: d.used_by_agents })}</span>
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </nav>
  );
}
