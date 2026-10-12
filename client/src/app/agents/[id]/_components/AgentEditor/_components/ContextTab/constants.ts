import type { ContextAttachmentRow, ProjectDocRoot } from "@devdigest/shared";

/** Pointer must move this many px before a drag starts (keeps checkbox/handle clicks working). */
export const DRAG_ACTIVATION_DISTANCE = 6;

/** Skeleton rows shown while the docs and the attachment state load. */
export const LOADING_ROWS = 4;

/** Root tag colours (the root name is always shown as text too, so colour is never the only signal). */
export const ROOT_COLORS: Record<ProjectDocRoot, { color: string; bg: string }> = {
  specs: { color: "var(--accent-text)", bg: "var(--accent-bg)" },
  docs: { color: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { color: "var(--warn)", bg: "var(--warn-bg)" },
};

/** Attachment states that have no readable content to preview. */
export const NO_PREVIEW_STATES: readonly ContextAttachmentRow["state"][] = [
  "missing",
  "unreadable",
  "refused_containment",
];
