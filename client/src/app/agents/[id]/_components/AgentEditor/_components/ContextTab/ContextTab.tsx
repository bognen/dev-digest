"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge, EmptyState, ErrorState, Icon, Modal, Skeleton, TextInput } from "@devdigest/ui";
import type { Agent, ContextAttachmentRow, ProjectDocSkipReason } from "@devdigest/shared";
import { DocPreview } from "@/components/project-context/DocPreview";
import { useAgentContext, useProjectDocs, useSetAgentContext } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { DocRowContent } from "./DocRowContent";
import { DRAG_ACTIVATION_DISTANCE, LOADING_ROWS, NO_PREVIEW_STATES } from "./constants";
import { availableDocs, estimateTotal, injectedTokens, matchesQuery, reorderPaths, rootOf, togglePath } from "./helpers";
import { SortableDocRow } from "./SortableDocRow";
import { s } from "./styles";

/**
 * Context tab — attach repo docs (specs/docs/insights) to the agent and order them (the order is the
 * order they appear in the assembled `## Project context` block). Unlike Skills there is no Save
 * button: every toggle/reorder saves immediately and optimistically (useSetAgentContext).
 */
export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const docsQuery = useProjectDocs(repoId);
  const ctxQuery = useAgentContext(agent.id, repoId);
  const setContext = useSetAgentContext(agent.id);
  const [query, setQuery] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const sensors = useSensors(
    // Drag only starts after a few px of movement so plain clicks stay clicks.
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!repoId) {
    if (!reposLoaded) return <Loading />;
    return (
      <div style={s.wrap}>
        <EmptyState icon="Folder" title={t("context.noRepoTitle")} body={t("context.noRepoBody")} />
      </div>
    );
  }
  if (docsQuery.isError || ctxQuery.isError) {
    return (
      <div style={s.wrap}>
        <ErrorState
          title={t("context.loadErrorTitle")}
          body={t("context.loadErrorBody")}
          onRetry={() => {
            docsQuery.refetch();
            ctxQuery.refetch();
          }}
        />
      </div>
    );
  }
  if (!docsQuery.data || !ctxQuery.data) return <Loading />;

  const state = ctxQuery.data;
  const attached = state.attached;
  const attachedPaths = attached.map((r) => r.path);
  const available = availableDocs(docsQuery.data.docs, attached);
  const droppedBy = new Map<string, ProjectDocSkipReason>(state.dropped.map((d) => [d.path, d.reason]));
  const filtering = query.trim() !== "";
  const shownAttached = attached.filter((r) => matchesQuery(r.path, query));
  const shownAvailable = available.filter((d) => matchesQuery(d.path, query));
  const shownInherited = state.inherited.filter((r) => matchesQuery(r.path, query));
  const nothingShown = shownAttached.length + shownAvailable.length + shownInherited.length === 0;
  const pending = setContext.isPending;
  // Derived at render: instant estimate while saving, the server's exact total otherwise (AC-23/25).
  const total = pending
    ? estimateTotal(state.overhead, injectedTokens(attached, state.inherited))
    : state.total_tokens;

  const save = (paths: string[]) => setContext.mutate({ repoId, paths });
  const onToggle = (path: string) => save(togglePath(attachedPaths, path));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) save(reorderPaths(attachedPaths, String(active.id), String(over.id)));
  };

  const statusFor = (row: ContextAttachmentRow): string | null => {
    if (row.state !== "ok") return t(`context.state.${row.state}`);
    const reason = droppedBy.get(row.path);
    return reason ? t(`context.dropped.${reason}`) : null;
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("context.attachedCount", { attached: attached.length, total: state.discovered_count })}
        </Badge>
        <div style={s.filter}>
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder={t("context.filterPlaceholder")}
            aria-label={t("context.filterPlaceholder")}
            suffix={<Icon.Search size={14} style={{ color: "var(--text-muted)" }} />}
          />
        </div>
      </div>
      <div style={s.repoLine}>{t("context.repoLine", { repo: activeRepo?.full_name ?? repoId })}</div>
      <p style={s.hint}>{t("context.orderHint")}</p>

      {state.discovered_count === 0 && attached.length === 0 ? (
        <EmptyState icon="FileText" title={t("context.emptyTitle")} body={t("context.emptyBody")} />
      ) : (
        <>
          {/* Attached: sortable; this order is the injected order. */}
          {(shownAttached.length > 0 || !filtering) && (
            <section style={s.group} aria-label={t("context.groups.attached")}>
              <h3 style={s.groupTitle}>{t("context.groups.attached")}</h3>
              {shownAttached.length === 0 ? (
                <div style={s.groupEmpty}>{t("context.groups.attachedEmpty")}</div>
              ) : (
                <DndContext
                  id={`agent-context-${agent.id}`}
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext items={shownAttached.map((r) => r.path)} strategy={verticalListSortingStrategy}>
                    <div style={s.list}>
                      {shownAttached.map((row) => (
                        <SortableDocRow
                          key={row.path}
                          path={row.path}
                          root={row.root}
                          tokens={row.tokens}
                          status={statusFor(row)}
                          dragDisabled={filtering}
                          onToggle={onToggle}
                          onPreview={NO_PREVIEW_STATES.includes(row.state) ? undefined : setPreviewPath}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </section>
          )}

          {/* Available: not attached; too-large docs are inert with a text label. */}
          {shownAvailable.length > 0 && (
            <section style={s.group} aria-label={t("context.groups.available")}>
              <h3 style={s.groupTitle}>{t("context.groups.available")}</h3>
              <div style={s.list}>
                {shownAvailable.map((d) => (
                  <div key={d.path} style={s.row({ muted: d.too_large, problem: false })}>
                    <DocRowContent
                      path={d.path}
                      root={d.root}
                      tokens={d.tokens}
                      status={d.too_large ? t("context.tooLarge") : null}
                      checked={false}
                      inert={d.too_large}
                      onToggle={onToggle}
                      onPreview={setPreviewPath}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Inherited via skills: read-only, counted in the total (AC-20). */}
          {shownInherited.length > 0 && (
            <section style={s.group} aria-label={t("context.groups.inherited")}>
              <h3 style={s.groupTitle}>{t("context.groups.inherited")}</h3>
              <div style={s.list}>
                {shownInherited.map((r) => (
                  <div key={`${r.skill_id}:${r.path}`} style={s.row({ muted: true, problem: false })}>
                    <DocRowContent
                      path={r.path}
                      root={rootOf(r.path)}
                      tokens={r.tokens}
                      status={r.duplicate ? t("context.duplicate") : null}
                      note={t("context.viaSkill", { skill: r.skill_name })}
                      onPreview={setPreviewPath}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
          {filtering && nothingShown && <div style={s.noMatch}>{t("context.noMatch", { query: query.trim() })}</div>}
        </>
      )}

      <div style={s.footer} aria-live="polite">
        <span style={s.total}>{t(pending ? "context.totalEstimating" : "context.total", { count: total })}</span>
        <span style={s.note}>{t("context.totalNote")}</span>
      </div>

      {previewPath && (
        <Modal title={previewPath} subtitle={t("context.previewTitle")} onClose={() => setPreviewPath(null)}>
          <div style={s.previewBody}>
            <DocPreview repoId={repoId} path={previewPath} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div style={{ ...s.wrap, ...s.loading }} aria-busy="true">
      <Skeleton height={24} width={200} />
      {Array.from({ length: LOADING_ROWS }, (_, i) => (
        <Skeleton key={i} height={42} />
      ))}
    </div>
  );
}
