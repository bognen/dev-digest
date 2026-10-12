import { z } from 'zod';

/**
 * Project context (SPEC-01): repo docs (specs/docs/insights) attached to
 * agents and skills and injected into the review prompt. Contracts for the
 * docs browser, the per-agent / per-skill attachment state and the setters.
 */

export const ProjectDocRoot = z.enum(['specs', 'docs', 'insights']);
export type ProjectDocRoot = z.infer<typeof ProjectDocRoot>;

export const ProjectDocSkipReason = z.enum([
  'missing',
  'unreadable',
  'too_large',
  'over_budget',
  'refused_containment',
]);
export type ProjectDocSkipReason = z.infer<typeof ProjectDocSkipReason>;

/** A repo-relative doc path as sent by clients (containment is checked server-side). */
const DocPath = z.string().min(1).max(512);

export const ProjectDocListItem = z.object({
  path: z.string(),
  root: ProjectDocRoot,
  size_bytes: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative().nullable(),
  too_large: z.boolean(),
  used_by_agents: z.number().int().nonnegative(),
});
export type ProjectDocListItem = z.infer<typeof ProjectDocListItem>;

export const ProjectDocList = z.object({
  repo_id: z.string(),
  roots: z.array(ProjectDocRoot),
  docs: z.array(ProjectDocListItem),
});
export type ProjectDocList = z.infer<typeof ProjectDocList>;

export const ProjectDocContent = z.object({
  path: z.string(),
  root: ProjectDocRoot,
  content: z.string(),
  tokens: z.number().int().nonnegative(),
});
export type ProjectDocContent = z.infer<typeof ProjectDocContent>;

export const ContextAttachmentRow = z.object({
  path: z.string(),
  root: ProjectDocRoot,
  tokens: z.number().int().nonnegative().nullable(),
  state: z.enum(['ok', 'missing', 'too_large', 'unreadable', 'refused_containment']),
});
export type ContextAttachmentRow = z.infer<typeof ContextAttachmentRow>;

export const InheritedContextRow = z.object({
  path: z.string(),
  tokens: z.number().int().nonnegative().nullable(),
  skill_id: z.string(),
  skill_name: z.string(),
  duplicate: z.boolean(),
});
export type InheritedContextRow = z.infer<typeof InheritedContextRow>;

export const ContextOverhead = z.object({
  heading_tokens: z.number().int().nonnegative(),
  separator_tokens: z.number().int().nonnegative(),
});
export type ContextOverhead = z.infer<typeof ContextOverhead>;

export const AgentContextState = z.object({
  repo_id: z.string(),
  discovered_count: z.number().int().nonnegative(),
  attached: z.array(ContextAttachmentRow),
  inherited: z.array(InheritedContextRow),
  total_tokens: z.number().int().nonnegative(),
  budget_tokens: z.number().int().nonnegative(),
  dropped: z.array(z.object({ path: z.string(), reason: ProjectDocSkipReason })),
  overhead: ContextOverhead,
});
export type AgentContextState = z.infer<typeof AgentContextState>;

export const SkillContextState = z.object({
  repo_id: z.string(),
  discovered_count: z.number().int().nonnegative(),
  attached: z.array(ContextAttachmentRow),
  total_tokens: z.number().int().nonnegative(),
  serialized: z.string().nullable(),
  overhead: ContextOverhead,
});
export type SkillContextState = z.infer<typeof SkillContextState>;

/** PUT body for agent/skill attachments: ordered, unique, bounded. */
export const SetContextDocsBody = z.object({
  repo_id: z.string().uuid(),
  paths: z
    .array(DocPath)
    .max(100)
    .refine((paths) => new Set(paths).size === paths.length, {
      message: 'paths must be unique',
    }),
});
export type SetContextDocsBody = z.infer<typeof SetContextDocsBody>;

export const ContextRepoQuery = z.object({
  repo_id: z.string().uuid(),
});
export type ContextRepoQuery = z.infer<typeof ContextRepoQuery>;

export const ProjectDocQuery = z.object({
  path: DocPath,
});
export type ProjectDocQuery = z.infer<typeof ProjectDocQuery>;
