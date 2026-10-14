import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { dashboard, mockFetch, renderWithProviders } from "@/components/evals/_test/harness";

/** SPEC-06 AC-51 (skill Evals tab) + AC-63 (no host agent → running disabled with a hint). */

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import { SkillEvalsTab } from "./SkillEvalsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SKILL: Skill = {
  id: "s1",
  name: "secret-leakage-gate",
  description: "",
  type: "security",
  source: "manual",
  body: "b",
  enabled: true,
  version: 3,
  injection_detected: false,
  injection_matches: [],
};

const SKILL_CASE = {
  id: "c1",
  owner_kind: "skill",
  owner_id: "s1",
  name: "stripe-key-leak",
  input_diff: "d",
  input_files: [],
  input_meta: { pr_title: "", pr_body: "", source: null },
  expected_output: { expectations: [] },
  notes: null,
  source_finding_id: null,
  created_at: "x",
  updated_at: "x",
  last_result: null,
};

function routes(agentsUsing: { id: string; name: string }[]) {
  return {
    "GET /agents": [],
    "GET /skills/s1/stats": {
      used_by: agentsUsing.length,
      pull_rate: null,
      accept_rate: null,
      findings_30d: 0,
      agents_using: agentsUsing,
      findings_by_category: [],
    },
    "GET /eval/dashboard/skill/s1?days=0": dashboard({ owner_kind: "skill", owner_id: "s1", owner_name: "secret-leakage-gate", alert: null }),
    "GET /eval/cases?owner_kind=skill&owner_id=s1": [SKILL_CASE],
  };
}

describe("SkillEvalsTab", () => {
  it("shows the skill's cases with a host picker (AC-51)", async () => {
    mockFetch(routes([{ id: "a1", name: "Security Reviewer" }]));
    renderWithProviders(<SkillEvalsTab skill={SKILL} />);
    expect(await screen.findByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("Host agent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeEnabled();
  });

  it("disables running with a hint when no agent can host the skill (AC-63)", async () => {
    mockFetch(routes([]));
    renderWithProviders(<SkillEvalsTab skill={SKILL} />);
    expect(await screen.findByText("Pick a host agent to run skill evals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
  });
});
