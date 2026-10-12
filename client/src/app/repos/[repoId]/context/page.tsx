import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context (Project Context, view-only). Thin route entry: the view,
   list, styles, helpers and i18n are colocated under _components. */
export default function ProjectContextPage() {
  return <ProjectContextView />;
}
