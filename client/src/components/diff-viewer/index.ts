/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract. */
export { DiffViewer } from "./DiffViewer";
export { isAutoExpanded } from "./FileCard";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingApi, FindingAnchor } from "./findings";
