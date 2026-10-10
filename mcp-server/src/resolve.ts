import {
  AgentsSchema,
  PullsSchema,
  ReposSchema,
  parseResponse,
  type ApiAgent,
} from "./api-schemas.js";
import { AmbiguousMatchError, MAX_CANDIDATES, NotFoundError } from "./errors.js";
import type { ApiClient, RequestOptions } from "./ports.js";

/**
 * Turn the human-friendly flat tool arguments (owner/name, PR number, agent
 * id-or-name) into API ids. No caching in v1. Not-found/ambiguous cases throw
 * typed errors that errors.ts renders with candidate lists.
 */

export interface ResolvedRepo {
  id: string;
  fullName: string;
}

export interface ResolvedPull {
  /** Internal PR id used in /pulls/:id/... paths. */
  id: string;
  number: number;
  title: string;
}

export interface ResolvedAgent {
  id: string;
  name: string;
  enabled: boolean;
}

/** Percent-encode an API-supplied id before placing it in a URL path. */
export function pathSegment(id: string): string {
  return encodeURIComponent(id);
}

/**
 * GET /repos, then match case-insensitively on full_name ("owner/name").
 * A bare name (no slash) is accepted only if exactly one repo has that name.
 */
export async function resolveRepo(
  api: ApiClient,
  input: string,
  opts?: RequestOptions,
): Promise<ResolvedRepo> {
  const wanted = input.trim().toLowerCase();
  const repos = parseResponse("GET /repos", ReposSchema, await api.get("/repos", opts));
  const names = repos.map((r) => r.full_name);

  const matches = wanted.includes("/")
    ? repos.filter((r) => r.full_name.toLowerCase() === wanted)
    : repos.filter((r) => r.name.toLowerCase() === wanted);

  if (matches.length === 1) {
    const m = matches[0]!;
    return { id: m.id, fullName: m.full_name };
  }
  if (matches.length > 1) {
    throw new AmbiguousMatchError(
      "repo",
      input,
      matches.map((r) => r.full_name),
    );
  }
  throw new NotFoundError("repo", input, names.slice(0, MAX_CANDIDATES));
}

/**
 * GET /repos/:id/pulls (this call syncs from GitHub, idempotent) and find the
 * PR by number. A PR row with a null id is not synced yet = not found.
 * Callers should pass a long timeout (max(httpTimeoutMs, 30000)) via opts.
 */
export async function resolvePull(
  api: ApiClient,
  repo: ResolvedRepo,
  prNumber: number,
  opts?: RequestOptions,
): Promise<ResolvedPull> {
  const pulls = parseResponse(
    "GET /repos/:id/pulls",
    PullsSchema,
    await api.get(`/repos/${pathSegment(repo.id)}/pulls`, opts),
  );
  const hit = pulls.find((p) => p.number === prNumber);
  if (hit?.id) return { id: hit.id, number: hit.number, title: hit.title };

  const available = pulls
    .filter((p) => p.id)
    .map((p) => String(p.number))
    .slice(0, MAX_CANDIDATES);
  throw new NotFoundError("pr", String(prNumber), available, repo.fullName);
}

/**
 * GET /agents; exact id first, else case-insensitive exact name. Must run
 * BEFORE any POST because the server does not validate RunRequest.agentId.
 * Disabled agents are allowed (caller flags agent_enabled:false).
 */
export async function resolveAgent(
  api: ApiClient,
  input: string,
  opts?: RequestOptions,
): Promise<ResolvedAgent> {
  const agents = parseResponse("GET /agents", AgentsSchema, await api.get("/agents", opts));
  const wanted = input.trim();

  const toResolved = (a: ApiAgent): ResolvedAgent => ({ id: a.id, name: a.name, enabled: a.enabled });

  const byId = agents.find((a) => a.id === wanted);
  if (byId) return toResolved(byId);

  const lower = wanted.toLowerCase();
  const byName = agents.filter((a) => a.name.toLowerCase() === lower);
  if (byName.length === 1) return toResolved(byName[0]!);
  if (byName.length > 1) {
    throw new AmbiguousMatchError(
      "agent",
      input,
      byName.map((a) => `${a.name} (${a.id})`),
    );
  }
  throw new NotFoundError(
    "agent",
    input,
    agents.slice(0, MAX_CANDIDATES).map((a) => a.name),
  );
}
