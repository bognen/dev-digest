/* Pure helpers for ProjectContextBlock. */

/** Heading the server's renderer puts above the block (assembly.specs is the body without it). */
export const PROJECT_CONTEXT_HEADING = "## Project context";

/** Text copied by the copy button: heading + stored block body (AC-42). */
export function buildProjectContextCopyText(specs: string | null | undefined): string {
  return specs ? `${PROJECT_CONTEXT_HEADING}\n${specs}` : PROJECT_CONTEXT_HEADING;
}
