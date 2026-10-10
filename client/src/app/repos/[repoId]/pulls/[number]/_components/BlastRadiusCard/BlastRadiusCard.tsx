/* BlastRadiusCard — specs/07-blast-radius.md. Own section on the Overview
   tab, next to IntentCard. One bordered panel: an optional index-status note, a
   stats line (symbols · callers · endpoints), then a fixed-height, scrolling
   list where EVERY changed symbol is a row with its caller count ("ConfigTab …
   0 callers") — a symbol with no callers is still listed, it just has nothing
   to expand. Expanding a row reveals its resolved cross-file callers and the
   endpoints/crons they reach. The status note lives INSIDE the panel so this
   panel and IntentCard's start at the same top edge. Read entirely off
   repo-intel's index (no LLM call). `file:line` links open the exact GitHub
   line in a new tab — same pattern as FindingCard.tsx. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, MonoLink, EmptyState, Skeleton, Icon, IconBtn, Modal } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast-radius";
import { githubBlobUrl } from "@/lib/github-urls";
import { BlastGraph } from "./BlastGraph";
import { ViewToggle } from "./ViewToggle";
import { blastBanner, DEFAULT_BLAST_VIEW, type BlastView } from "./constants";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function BlastRadiusCard({ prId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const { data: envelope, isLoading } = useBlastRadius(prId);
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = React.useState(false);
  const [view, setView] = React.useState<BlastView>(DEFAULT_BLAST_VIEW);

  const title = <SectionLabel icon="GitBranch">Blast Radius</SectionLabel>;
  const label = <div style={s.labelRow}>{title}</div>;

  if (isLoading || !envelope) {
    return (
      <section style={s.root}>
        {label}
        <div style={s.panel}>
          <div style={s.loadingStack}>
            <Skeleton height={28} />
            <Skeleton height={28} />
            <Skeleton height={28} />
          </div>
        </div>
      </section>
    );
  }

  const { status, degradedReason, data: blast } = envelope;
  const banner = blastBanner(status, degradedReason);

  const callerCount = blast.downstream.reduce((n, g) => n + g.callers.length, 0);
  const endpointCount = new Set(blast.downstream.flatMap((g) => g.endpoints_affected)).size;
  const cronCount = new Set(blast.downstream.flatMap((g) => g.crons_affected)).size;

  // One row per changed symbol (deduped by name+file), joined to its downstream
  // group by symbol name. Symbols with callers sort first.
  const groupBySymbol = new Map(blast.downstream.map((g) => [g.symbol, g]));
  const seen = new Set<string>();
  const rows = blast.changed_symbols
    .filter((cs) => {
      const key = `${cs.name}:${cs.file}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((cs) => ({ ...cs, key: `${cs.name}:${cs.file}`, group: groupBySymbol.get(cs.name) }))
    .sort((a, b) => (b.group?.callers.length ?? 0) - (a.group?.callers.length ?? 0));

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderContent = (expanded: boolean) => (
    <>
        {banner && (
          <div style={s.banner} role="status">
            <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }} />
            <span>
              {t(banner.key)}
              {banner.reason ? ` (${banner.reason})` : ""}
            </span>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon="Target"
            title="No blast radius to show"
            body="None of the changed files declare a function, method, or class this repo's index tracks."
          />
        ) : (
          <>
            <div style={s.statsLine}>
              <span>{t("stat.symbols", { count: rows.length })}</span>
              <span>{t("stat.callers", { count: callerCount })}</span>
              {endpointCount > 0 && <span style={s.statAccent}>{t("stat.endpoints", { count: endpointCount })}</span>}
              {cronCount > 0 && <span>{t("stat.crons", { count: cronCount })}</span>}
            </div>

            {callerCount === 0 && (
              <div style={s.statsLine} role="status">
                {t("noDownstream", { count: rows.length })}
              </div>
            )}

            {view === "graph" ? (
              <BlastGraph
                expanded={expanded}
                symbols={rows.map((r) => ({ key: r.key, name: r.name, group: r.group }))}
                repoFullName={repoFullName}
                headSha={headSha}
              />
            ) : (
            <ul style={expanded ? s.listExpanded : s.list}>
              {rows.map((row) => {
                const callers = row.group?.callers ?? [];
                const expandable = callers.length > 0;
                const isOpen = open.has(row.key);
                return (
                  <li key={row.key} style={s.item}>
                    <button
                      type="button"
                      style={s.row(expandable)}
                      aria-expanded={expandable ? isOpen : undefined}
                      disabled={!expandable}
                      onClick={() => toggle(row.key)}
                    >
                      <Icon.ChevronRight size={12} style={s.chevron(isOpen, expandable)} />
                      <Icon.Code size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                      <span className="mono" style={s.symbolName} title={`${row.file} · ${row.kind}`}>
                        {row.name}
                      </span>
                      <span style={s.callerCount}>
                        {t("callerCount", { count: callers.length })}
                      </span>
                    </button>

                    {expandable && isOpen && row.group && (
                      <div style={s.detail}>
                        <ul style={s.callerList}>
                          {callers.map((c, i) => (
                            <li key={`${c.file}:${c.line}:${i}`} style={s.callerRow}>
                              <span style={s.callerLinkWrap} title={`${c.file}:${c.line}`}>
                                <MonoLink
                                  href={
                                    repoFullName && headSha
                                      ? githubBlobUrl(repoFullName, headSha, c.file, c.line, c.line)
                                      : undefined
                                  }
                                >
                                  {c.file}:{c.line}
                                </MonoLink>
                              </span>
                              <span style={s.callerSymbol}>{c.name}</span>
                            </li>
                          ))}
                        </ul>
                        {(row.group.endpoints_affected.length > 0 || row.group.crons_affected.length > 0) && (
                          <div style={s.factsRow}>
                            {row.group.endpoints_affected.map((e) => (
                              <Badge key={e} icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)">
                                {e}
                              </Badge>
                            ))}
                            {row.group.crons_affected.map((cron) => (
                              <Badge key={cron} icon="Clock" color="var(--text-secondary)">
                                {cron}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            )}
          </>
        )}
    </>
  );

  return (
    <section style={s.root}>
      {rows.length > 0 ? (
        <div style={s.labelRow}>
          {title}
          <div style={s.labelActions}>
            <ViewToggle value={view} onChange={setView} />
            <IconBtn icon="Maximize2" label={t("expand")} size={26} onClick={() => setModalOpen(true)} />
          </div>
        </div>
      ) : (
        label
      )}

      <div style={s.panel}>{renderContent(false)}</div>

      {modalOpen && (
        <Modal width={1100} title="Blast Radius" onClose={() => setModalOpen(false)}>
          <div style={s.modalBody}>{renderContent(true)}</div>
        </Modal>
      )}
    </section>
  );
}
