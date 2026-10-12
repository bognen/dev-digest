"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@devdigest/ui";
import { DocRow, type DocRowProps } from "./DocRow";
import { s } from "./styles";

export interface SortableDocRowProps extends Omit<DocRowProps, "handle"> {
  /** True while a filter is active: reordering a filtered subset would be ambiguous. */
  dragDisabled: boolean;
  /** Expanded preview panel, rendered under the row. */
  children?: React.ReactNode;
}

/** One draggable attached row: the grip handle is the only drag activator (keyboard-operable, NFR-7). */
export function SortableDocRow({ dragDisabled, children, ...rowProps }: SortableDocRowProps) {
  const t = useTranslations("skills");
  const { path } = rowProps.row;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: path,
    disabled: dragDisabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
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
    <li ref={setNodeRef} style={style} data-testid={`context-row-${path}`}>
      <DocRow {...rowProps} handle={handle} />
      {children}
    </li>
  );
}
