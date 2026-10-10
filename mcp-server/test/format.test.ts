import { describe, expect, it } from "vitest";
import type { ApiAgent, ApiConvention, ApiFinding } from "../src/api-schemas.js";
import {
  UNTRUSTED_NOTICE,
  capResponse,
  countBySeverity,
  latestPerAgent,
  minScore,
  sortConventions,
  sortFindings,
  toConciseAgent,
  toConciseConvention,
  toConciseFinding,
  toFullFinding,
  truncateText,
  withUntrusted,
  worstVerdict,
} from "../src/format.js";

const finding = (over: Partial<ApiFinding> = {}): ApiFinding => ({
  id: "f1",
  severity: "WARNING",
  category: "bug",
  title: "t",
  file: "a.ts",
  start_line: 5,
  end_line: 5,
  rationale: "why",
  suggestion: null,
  dismissed_at: null,
  ...over,
});

describe("sortFindings / countBySeverity", () => {
  it("sorts CRITICAL > WARNING > SUGGESTION, then file, then line, without mutating", () => {
    const input = [
      finding({ id: "1", severity: "SUGGESTION", file: "a.ts" }),
      finding({ id: "2", severity: "CRITICAL", file: "z.ts", start_line: 1 }),
      finding({ id: "3", severity: "WARNING", file: "b.ts", start_line: 9 }),
      finding({ id: "4", severity: "WARNING", file: "b.ts", start_line: 2 }),
      finding({ id: "5", severity: "CRITICAL", file: "a.ts", start_line: 7 }),
    ];
    const ids = sortFindings(input).map((f) => f.id);
    expect(ids).toEqual(["5", "2", "4", "3", "1"]);
    expect(input[0]!.id).toBe("1");
    expect(countBySeverity(input)).toEqual({ critical: 2, warning: 2, suggestion: 1 });
  });
});

describe("finding shaping", () => {
  it("concise omits end_line when equal, includes agent; full adds capped rationale/suggestion", () => {
    expect(toConciseFinding(finding(), "sec")).toEqual({
      severity: "WARNING",
      category: "bug",
      title: "t",
      file: "a.ts",
      line: 5,
      agent: "sec",
    });
    expect(toConciseFinding(finding({ end_line: 9 })).end_line).toBe(9);
    const full = toFullFinding(finding({ rationale: "r".repeat(900), suggestion: "s".repeat(900) }));
    expect(full.rationale).toHaveLength(600);
    expect(full.suggestion).toHaveLength(400);
    expect(full.id).toBe("f1");
    expect(toFullFinding(finding()).suggestion).toBeUndefined();
  });

  it("truncateText leaves short text and ends cut text with an ellipsis within the cap", () => {
    expect(truncateText("abc", 5)).toBe("abc");
    expect(truncateText("abcdefgh", 5)).toBe("ab...");
  });
});

describe("latestPerAgent", () => {
  const r = (id: string, agent: string | null, at: string) => ({ id, agent_id: agent, created_at: at });
  it("keeps the newest per agent and keeps null-agent rows separately", () => {
    const out = latestPerAgent([
      r("old-a", "A", "2026-01-01T00:00:00Z"),
      r("new-a", "A", "2026-02-01T00:00:00Z"),
      r("b", "B", "2026-01-15T00:00:00Z"),
      r("n1", null, "2026-01-01T00:00:00Z"),
      r("n2", null, "2026-01-02T00:00:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["new-a", "b", "n1", "n2"]);
  });
});

describe("worstVerdict / minScore", () => {
  it("ranks request_changes > comment > approve and ignores null", () => {
    expect(worstVerdict(["approve", "comment"])).toBe("comment");
    expect(worstVerdict(["approve", null, "request_changes", "comment"])).toBe("request_changes");
    expect(worstVerdict([null])).toBeNull();
    expect(worstVerdict([])).toBeNull();
  });
  it("takes the minimum score, ignoring null", () => {
    expect(minScore([80, null, 55, 90])).toBe(55);
    expect(minScore([null])).toBeNull();
  });
});

describe("agent and convention shaping", () => {
  it("toConciseAgent whitelists fields (no system_prompt) and caps description at 140", () => {
    const raw = {
      id: "a1",
      name: "Sec",
      description: "d".repeat(300),
      provider: "openai",
      model: "m",
      enabled: true,
      system_prompt: "SECRET PROMPT",
    } as ApiAgent;
    const out = toConciseAgent(raw);
    expect(Object.keys(out).sort()).toEqual(["description", "enabled", "id", "model", "name"]);
    expect(out.description).toHaveLength(140);
    expect(toConciseAgent({ ...raw, description: null }).description).toBe("");
  });

  it("sorts conventions by confidence then occurrences and renders path:line evidence", () => {
    const c = (id: string, confidence: number, occurrences: number): ApiConvention => ({
      id,
      category: "naming",
      rule: id,
      rationale: "x".repeat(500),
      evidence_path: "src/a.ts",
      evidence_line: 12,
      occurrences,
      confidence,
      status: "accepted",
    });
    const sorted = sortConventions([c("lo", 0.5, 9), c("hi-few", 0.9, 1), c("hi-many", 0.9, 5)]);
    expect(sorted.map((x) => x.id)).toEqual(["hi-many", "hi-few", "lo"]);
    const shaped = toConciseConvention(c("r", 1, 1));
    expect(shaped.evidence).toBe("src/a.ts:12");
    expect(shaped.rationale).toHaveLength(200);
    expect(toConciseConvention({ ...c("r", 1, 1), evidence_line: null }).evidence).toBe("src/a.ts");
  });
});

describe("capResponse", () => {
  it("returns payload untouched when under the cap", () => {
    const p = { count: 2, findings: [1, 2], truncated: 0 };
    expect(capResponse(p, "findings", 1000)).toEqual({ text: JSON.stringify(p), dropped: 0 });
  });

  it("drops trailing items to fit, sets truncated (adding prior) and a hint", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ title: `finding number ${i}` }));
    const { text, dropped } = capResponse({ findings: items, truncated: 3 }, "findings", 500);
    expect(text.length).toBeLessThanOrEqual(500);
    const parsed = JSON.parse(text) as { findings: unknown[]; truncated: number; hint: string };
    expect(dropped).toBeGreaterThan(0);
    expect(parsed.findings).toHaveLength(50 - dropped);
    expect(parsed.findings[0]).toEqual(items[0]);
    expect(parsed.truncated).toBe(3 + dropped);
    expect(parsed.hint).toContain("500");
  });

  it("never emits invalid JSON when even an empty list cannot fit: output parses and is <= max", () => {
    for (const max of [2, 20, 50, 100, 150, 400]) {
      const r = capResponse({ big: "x".repeat(2000), findings: [1, 2] }, "findings", max);
      expect(r.text.length).toBeLessThanOrEqual(max);
      expect(() => JSON.parse(r.text)).not.toThrow();
    }
    const nonList = capResponse({ big: "x".repeat(2000) }, "findings", 100);
    expect(nonList.text.length).toBeLessThanOrEqual(100);
    expect(() => JSON.parse(nonList.text)).not.toThrow();
  });

  it("keeps `untrusted` as the first key when items are dropped and when only a minimal object fits", () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ title: `finding ${i}` }));
    const payload = withUntrusted({ findings: items, truncated: 0 });
    const cut = JSON.parse(capResponse(payload, "findings", 1000).text) as Record<string, unknown>;
    expect(Object.keys(cut)[0]).toBe("untrusted");
    expect(cut.untrusted).toBe(UNTRUSTED_NOTICE);
    expect((cut.findings as unknown[]).length).toBeLessThan(200);

    const minimal = JSON.parse(
      capResponse(withUntrusted({ pad: "x".repeat(5000), findings: [1] }), "findings", 600).text,
    ) as Record<string, unknown>;
    expect(Object.keys(minimal)[0]).toBe("untrusted");
  });
});

describe("untrusted labeling, per-field caps and sanitizing of API text", () => {
  // tag chars (U+E0041/42), RLO, RLI, ZWSP, BOM, NEL (C1), LINE SEPARATOR
  const HIDDEN = "a\u{E0041}\u{E0042}b\u202Ec\u2066d\u200Be\uFEFFf\u0085g\u2028h";
  const FORBIDDEN = /[\u{E0000}-\u{E007F}\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u0080-\u009F\u2028\u2029]/u;

  it("withUntrusted puts the constant notice first", () => {
    const out = withUntrusted({ a: 1 });
    expect(Object.keys(out)).toEqual(["untrusted", "a"]);
    expect(out.untrusted).toBe(UNTRUSTED_NOTICE);
  });

  it("caps title 200 / category 40 / file 300 / agent 80 on findings", () => {
    const f = toConciseFinding(
      finding({ title: "t".repeat(500), category: "c".repeat(100), file: "f".repeat(900) }),
      "n".repeat(200),
    );
    expect(f.title).toHaveLength(200);
    expect(f.category).toHaveLength(40);
    expect(f.file).toHaveLength(300);
    expect(f.agent).toHaveLength(80);
  });

  it("strips tag/bidi/zero-width/C1/separator characters from every finding field", () => {
    const clean = toFullFinding(
      finding({ title: HIDDEN, category: HIDDEN, file: HIDDEN, rationale: HIDDEN, suggestion: HIDDEN }),
      HIDDEN,
    );
    for (const v of [clean.title, clean.category, clean.file, clean.rationale, clean.suggestion, clean.agent]) {
      expect(v).not.toMatch(FORBIDDEN);
    }
    expect(clean.title).toBe("abcdefgh");
  });

  it("caps rule 300 / category 40 / evidence 300 on conventions and strips hidden chars", () => {
    const base = { id: "1", status: "accepted", occurrences: 1, confidence: 1, rationale: null } as unknown as ApiConvention;
    const c = toConciseConvention({
      ...base,
      rule: "r".repeat(900),
      category: "c".repeat(90),
      evidence_path: "p".repeat(900),
      evidence_line: 7,
    });
    expect(c.rule).toHaveLength(300);
    expect(c.category).toHaveLength(40);
    expect(c.evidence).toHaveLength(300);
    const tagged = toConciseConvention({ ...base, rule: HIDDEN, category: "x", evidence_path: HIDDEN, evidence_line: null });
    expect(tagged.rule).toBe("abcdefgh");
    expect(tagged.evidence).toBe("abcdefgh");
  });

  it("caps agent name at 80 and strips hidden chars from agent fields", () => {
    const a = toConciseAgent({
      id: "a",
      name: "n".repeat(300) + "\u{E0049}",
      description: HIDDEN,
      provider: "p",
      model: "m",
      enabled: true,
    } as ApiAgent);
    expect(a.name).toHaveLength(80);
    expect(a.description).toBe("abcdefgh");
  });
});
