/**
 * LLM Message Pattern judge, on the subscription. Binary PASS/FAIL per practice, PASS only with
 * a verbatim evidence quote. The judge defaults to a stronger family than the task to soften
 * single-model self-preference; the structural mitigations (blind + binary + verbatim) do the
 * rest, since on a shared subscription the families overlap.
 */

import { EVAL_JUDGE_MODEL } from "../config.js";
import { runContent } from "../runtime/dispatch.js";

const JUDGE_RUBRIC =
  "You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each " +
  "practice independently.\n" +
  "Rules: (1) exactly PASS or FAIL per practice, no scales. (2) PASS only when a direct " +
  "verbatim quote from the OUTPUT is evidence the practice was met — a keyword is not " +
  "evidence. (3) Reply with ONLY minified JSON:\n" +
  '{"results":[{"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}';

export interface Verdict {
  results: { practice: string; passed: boolean; evidence: string }[];
  passed: number;
  total: number;
  score: number;
}

/** Max judge calls per verdict: a malformed reply is re-asked, never scored as a crash. */
const JUDGE_ATTEMPTS = 3;

function parseVerdict(text: string, expected: number): Verdict["results"] {
  // Strip a ```json fence if present, then take the outermost object.
  const body = text.replace(/```(?:json)?/gi, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const obj = JSON.parse(body.slice(start, end + 1));
  if (!Array.isArray(obj.results)) throw new Error("judge JSON missing results[]");
  if (obj.results.length !== expected) {
    throw new Error(`judge returned ${obj.results.length} results for ${expected} practices`);
  }
  for (const r of obj.results) {
    if (typeof r?.passed !== "boolean") throw new Error("judge result missing boolean `passed`");
  }
  return obj.results;
}

/** Judge an output against a list of practices. Model defaults to the stronger judge family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;
  let lastError = "";
  for (let attempt = 1; attempt <= JUDGE_ATTEMPTS; attempt++) {
    // On a retry, tell the judge exactly what was wrong with its previous reply.
    const ask = lastError
      ? `${prompt}\n\nYour previous reply was rejected (${lastError}). Reply with ONLY valid minified JSON ` +
        `using double-quoted keys, one result per practice (${practices.length} total).`
      : prompt;
    const res = await runContent(ask, { allowedTools: [], maxTurns: 1, model });
    if (res.isError) {
      lastError = `judge call failed: ${res.text.slice(0, 200)}`;
      continue;
    }
    try {
      const results = parseVerdict(res.text, practices.length);
      const passed = results.filter((r) => r.passed).length;
      return { results, passed, total: results.length, score: passed / results.length };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`judge gave no valid verdict after ${JUDGE_ATTEMPTS} attempts: ${lastError}`);
}
