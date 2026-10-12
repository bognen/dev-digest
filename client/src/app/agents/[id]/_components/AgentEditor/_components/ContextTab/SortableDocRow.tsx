"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@devdigest/ui";
import { DocRowContent, type DocRowContentProps } from "./DocRowContent";
import { s } from "./styles";

export interface SortableDocRowProps extends Omit<DocRowContentProps, "handle" | "checked" | "inert" | "note"> {
  /** True while a filter is active: reordering a filtered subset would be ambiguous. */
  dragDisabled: boolean;
}

/** One draggable attached row: the grip handle is the only drag activator (keyboard-operable). */
export function SortableDocRow({ dragDisabled, status, ...content }: SortableDocRowProps) {
  const t = useTranslations("agents");
  const { path } = content;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: path,
    disabled: dragDisabled,
  });

  const style: React.CSSProperties = {
    ...s.row({ muted: false, problem: !!status }),
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    boxShadow: isDragging ? "var(--shadow-drawer)" : undefined,
    position: "relative",
    zIndex: isDragging ? 1 : undefined,
  };

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={t("context.dragHandle", { name: path })}
      title={dragDisabled ? t("context.dragDisabledTitle") : undefined}
      style={{ ...s.handle, cursor: dragDisabled ? "not-allowed" : isDragging ? "grabbing" : "grab" }}
    >
      <Icon.Menu size={16} />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} data-testid={`context-row-${path}`}>
      <DocRowContent {...content} status={status} checked handle={handle} />
    </div>
  );
}
