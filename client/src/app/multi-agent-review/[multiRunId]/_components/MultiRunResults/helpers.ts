import { CONFIGURE_HREF, CONFIGURE_PR_PARAM, TRACE_PARAM } from "./constants";

/** Results-page URL with `?trace=` set to `runId`, or removed when null; other params are kept. */
export function withTrace(pathname: string, search: URLSearchParams, runId: string | null): string {
  const next = new URLSearchParams(search.toString());
  if (runId) next.set(TRACE_PARAM, runId);
  else next.delete(TRACE_PARAM);
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Configure run URL with this multi-run's PR preselected (AC-42). */
export function configureHref(prId: string | null | undefined): string {
  return prId ? `${CONFIGURE_HREF}?${CONFIGURE_PR_PARAM}=${encodeURIComponent(prId)}` : CONFIGURE_HREF;
}
