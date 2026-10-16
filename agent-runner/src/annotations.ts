import type { CiFailOn, Finding } from '@devdigest/shared';
import { countBlockers } from '@devdigest/reviewer-core';

/**
 * Findings surfaced in the Actions UI: one workflow-command annotation per
 * finding (shown on the run page, linked to file:line) and a markdown table
 * for `$GITHUB_STEP_SUMMARY`. Titles, rationales and paths are model / PR
 * controlled, so every value is escaped: annotation data cannot contain a
 * newline (no second `::command::` line) and table cells cannot break out of
 * the table or render HTML.
 */

const MAX_MESSAGE = 300;

/** `@actions/core` escapeData: `%`, CR and LF. */
export function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** `@actions/core` escapeProperty: escapeData plus `:` and `,`. */
export function escapeProperty(s: string): string {
  return escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

const isBlocker = (f: Finding, failOn: CiFailOn): boolean => countBlockers([f], failOn) > 0;

function level(f: Finding, failOn: CiFailOn): 'error' | 'warning' | 'notice' {
  if (isBlocker(f, failOn)) return 'error';
  return f.severity === 'SUGGESTION' ? 'notice' : 'warning';
}

function oneLine(s: string, max: number): string {
  const flat = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function findingAnnotations(findings: readonly Finding[], failOn: CiFailOn): string[] {
  return findings.map((f) => {
    const props = [
      `file=${escapeProperty(f.file)}`,
      `line=${f.start_line}`,
      `endLine=${Math.max(f.end_line, f.start_line)}`,
      `title=${escapeProperty(`${f.severity}: ${oneLine(f.title, 120)}`)}`,
    ].join(',');
    return `::${level(f, failOn)} ${props}::${escapeData(oneLine(f.rationale, MAX_MESSAGE))}`;
  });
}

function cell(s: string): string {
  return oneLine(s, 200)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/`/g, "'");
}

export function buildFindingsSummary(
  agentName: string,
  findings: readonly Finding[],
  failOn: CiFailOn,
  blockers: number,
): string {
  const head = `### ${cell(agentName)}: ${findings.length} finding(s), ${blockers} blocking (fail on: ${failOn})`;
  if (findings.length === 0) return `${head}\n`;
  const rows = findings.map(
    (f) =>
      `| ${isBlocker(f, failOn) ? 'yes' : ''} | ${f.severity} | \`${cell(f.file)}:${f.start_line}\` | ${cell(f.title)} |`,
  );
  return [head, '', '| Blocking | Severity | Location | Finding |', '|---|---|---|---|', ...rows, ''].join('\n');
}
