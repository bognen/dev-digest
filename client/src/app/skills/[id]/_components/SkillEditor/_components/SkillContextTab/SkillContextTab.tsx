/* Skill editor "Context" tab: attach project docs (specs/docs/insights) to the skill for the active
   repo. Saves immediately (optimistic via useSetSkillContext, no Save button). "Serializes as" shows
   the server-built `serialized` block verbatim (the single reviewer-core renderer, AC-19). */
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
import { Badge, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { DocPreview } from "@/components/project-context/DocPreview";
import { useActiveRepo } from "@/lib/repo-context";
import { useProjectDocs, useSetSkillContext, useSkillContext } from "@/lib/hooks/project-context";
import { DRAG_ACTIVATION_DISTANCE } from "./constants";
import { DocRow } from "./DocRow";
import { buildRows, reorderPaths, togglePath } from "./helpers";
import { SortableDocRow } from "./SortableDocRow";
import { s } from "./styles";

export function SkillContextTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();
  const ctx = useSkillContext(skillId, repoId);
  const docs = useProjectDocs(repoId);
  const setContext = useSetSkillContext(skillId);
  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const sensors = useSensors(
    // Drag only starts after a few px of movement so plain clicks stay clicks.
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!repoId) {
    return <EmptyState icon="Folder" title={t("context.noRepo.title")} body={t("context.noRepo.body")} />;
  }
  if (ctx.isLoading || docs.isLoading) {
    return (
      <div style={s.wrap} role="status" aria-label={t("context.loading")}>
        <Skeleton height={24} width={260} />
        <Skeleton height={160} />
      </div>
    );
  }
  if (ctx.isError || docs.isError || !ctx.data) {
    return (
      <ErrorState
        title={t("context.loadError")}
        onRetry={() => {
          void ctx.refetch();
          void docs.refetch();
        }}
      />
    );
  }

  const state = ctx.data;
  const attachedPaths = state.attached.map((a) => a.path);
  const rows = buildRows(state.attached, docs.data?.docs ?? [], filter);

  const filtering = filter.trim() !== "";

  const save = (paths: string[]) => setContext.mutate({ repoId, paths });
  const toggle = (path: string) => save(togglePath(attachedPaths, path));
  const togglePreview = (path: string) => setPreviewPath(previewPath === path ? null : path);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) save(reorderPaths(attachedPaths, String(active.id), String(over.id)));
  };

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge>{t("context.attached", { count: state.attached.length })}</Badge>
        <span style={s.spacer} />
        <input
          type="search"
          style={s.filter}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("context.filterPlaceholder")}
          aria-label={t("context.filterLabel")}
        />
      </div>
      <p style={s.subtitle}>{t("context.subtitle")}</p>
      <p style={s.subtitle}>{t("context.orderHint")}</p>
      <p style={s.total} aria-live="polite">
        {t("context.total", { count: state.total_tokens })}
      </p>
      {setContext.isError && (
        <p role="alert" style={s.note}>
          {t("context.saveError")}
        </p>
      )}

      {rows.length === 0 ? (
        <p style={s.note}>{t(filter.trim() ? "context.noMatches" : "context.empty")}</p>
      ) : (
        <DndContext
          id={`skill-context-${skillId}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={rows.filter((r) => r.attached).map((r) => r.path)} strategy={verticalListSortingStrategy}>
            <ul style={s.list} aria-label={t("context.listLabel")}>
              {rows.map((r) => {
                const rowProps = { row: r, open: previewPath === r.path, onToggle: toggle, onTogglePreview: togglePreview };
                const preview = previewPath === r.path && (
                  <div style={s.preview}>
                    <DocPreview repoId={repoId} path={r.path} />
                  </div>
                );
                return r.attached ? (
                  <SortableDocRow key={r.path} {...rowProps} dragDisabled={filtering}>
                    {preview}
                  </SortableDocRow>
                ) : (
                  <li key={r.path}>
                    <DocRow {...rowProps} />
                    {preview}
                  </li>
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div style={s.serializesLabel}>{t("context.serializesAs")}</div>
      <pre className="mono" style={s.pre} aria-label={t("context.serializesAs")}>
        {state.serialized ?? t("context.serializedEmpty")}
      </pre>
    </div>
  );
}
