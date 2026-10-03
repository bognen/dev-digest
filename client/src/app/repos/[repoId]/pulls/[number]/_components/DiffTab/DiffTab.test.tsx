import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, type RenderResult } from "@testing-library/react";

import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const mutate = vi.fn();
let smartDiffState: { data: SmartDiff | undefined; isLoading?: boolean; isError?: boolean };

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useFindingAction: () => ({ isPending: false, mutate }),
}));
vi.mock("@/lib/hooks/smart-diff", () => ({
  useSmartDiff: () => smartDiffState,
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);
beforeEach(() => {
  mutate.mockReset();
});

const patch = (name: string) => `@@ -1,2 +1,3 @@\n context ${name}\n+added ${name}\n tail ${name}`;
const mk = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: patch(path) });

// pr.files order (original order) deliberately differs from smart order.
const FILES: PrFile[] = [
  mk("README.md"),
  mk("pnpm-lock.yaml"),
  mk("src/a.test.ts"),
  mk("src/core.ts"),
  mk("src/routes.ts"),
];

const sf = (path: string, finding_lines: number[] = []) => ({ path, additions: 1, deletions: 0, finding_lines });
const SMART: SmartDiff = {
  groups: [
    { role: "core", files: [sf("src/core.ts", [2])] },
    { role: "tests", files: [sf("src/a.test.ts")] },
    { role: "wiring", files: [sf("src/routes.ts")] },
    { role: "docs", files: [sf("README.md")] },
    { role: "boilerplate", files: [sf("pnpm-lock.yaml")] },
  ],
  split_suggestion: { too_big: false, total_lines: 5, proposed_splits: [] },
};

const finding = (id: string, over: Partial<FindingRecord> = {}): FindingRecord => ({
  id,
  severity: "CRITICAL",
  category: "security",
  title: `Title ${id}`,
  file: "src/core.ts",
  start_line: 2,
  end_line: 2,
  rationale: "because",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  ...over,
});
const review = (findings: FindingRecord[]): ReviewRecord => ({
  id: "r1",
  pr_id: "pr1",
  agent_id: "a1",
  run_id: null,
  kind: "review",
  verdict: null,
  summary: null,
  score: null,
  model: null,
  created_at: "2026-01-01T00:00:00Z",
  findings,
});

function renderTab(props: Partial<React.ComponentProps<typeof DiffTab>> = {}): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} headSha="sha" reviews={[]} {...props} />
    </NextIntlClientProvider>,
  );
}

/** Group header buttons (the only buttons carrying aria-expanded), in DOM order. */
const headerNames = (): string[] =>
  screen
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("aria-expanded"))
    .map((b) => b.textContent ?? "");

describe("DiffTab smart order", () => {
  beforeEach(() => {
    smartDiffState = { data: SMART };
  });

  it("groups files Core, Tests, Wiring, Docs, Boilerplate; docs/boilerplate start collapsed", () => {
    renderTab();

    const names = headerNames();
    expect(names).toHaveLength(5);
    ["Core", "Tests", "Wiring", "Docs", "Boilerplate"].forEach((label, i) => {
      expect(names[i]).toContain(label);
      expect(names[i]).toContain("1 files");
    });

    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Boilerplate/ }));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Docs/ }));
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("still shows a disabled header for a role with no files", () => {
    smartDiffState = { data: { ...SMART, groups: SMART.groups.filter((g) => g.role !== "wiring") } };
    renderTab({ files: FILES.filter((f) => f.path !== "src/routes.ts") });
    const names = headerNames();
    expect(names).toHaveLength(5);
    expect(names[2]).toContain("Wiring");
    expect(names[2]).toContain("0 files");
    expect(screen.getByRole("button", { name: /Wiring/ })).toBeDisabled();
  });
});

describe("DiffTab findings", () => {
  beforeEach(() => {
    smartDiffState = { data: SMART };
  });

  it("shows counts, dots, inline finding with severity pill, and wires Accept", () => {
    renderTab({ reviews: [review([finding("f1")])] });

    const core = screen.getByRole("button", { name: /Core/ });
    expect(within(core).getByLabelText("1 finding")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Tests/ })).queryByLabelText(/finding/)).toBeNull();

    // file card dot only on the file with an open finding
    expect(screen.getAllByRole("button", { name: "Go to first finding" })).toHaveLength(1);

    // finding card is rendered beneath its line, expanded, plus a severity pill
    expect(screen.getByText("Title f1")).toBeInTheDocument();
    expect(screen.getAllByText("Critical").length).toBeGreaterThanOrEqual(1); // severity pill

    fireEvent.click(screen.getByText("Accept"));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });

  it("dismissed-only file has no dot", () => {
    renderTab({ reviews: [review([finding("d1", { dismissed_at: "2026-01-02T00:00:00Z" })])] });
    expect(screen.queryByRole("button", { name: "Go to first finding" })).not.toBeInTheDocument();
  });

  it("a finding whose line is not in the patch appears in the outside-the-diff block", () => {
    renderTab({ reviews: [review([finding("off", { start_line: 99, end_line: 99 })])] });
    expect(screen.getByText("Findings outside the visible diff")).toBeInTheDocument();
    expect(screen.getByText("Title off")).toBeInTheDocument();
  });
});

describe("DiffTab order toggle", () => {
  beforeEach(() => {
    smartDiffState = { data: SMART };
  });

  it("switches to original order (no groups, findings inline) and back to smart order", () => {
    renderTab({ reviews: [review([finding("f1")])] });

    const smartBtn = screen.getByRole("button", { name: "Smart order" });
    const origBtn = screen.getByRole("button", { name: "Original order" });
    expect(smartBtn).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(origBtn);
    expect(origBtn).toHaveAttribute("aria-pressed", "true");
    expect(smartBtn).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: /Core/ })).not.toBeInTheDocument();
    expect(screen.getByText("Title f1")).toBeInTheDocument();

    // all files rendered in pr.files order (docs/boilerplate not collapsed here)
    const paths = FILES.map((f) => screen.getByText(f.path));
    for (let i = 1; i < paths.length; i++) {
      expect(paths[i - 1]!.compareDocumentPosition(paths[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    fireEvent.click(smartBtn);
    expect(screen.getByRole("button", { name: /Core/ })).toBeInTheDocument();
  });
});

describe("DiffTab edge cases", () => {
  it("renders a file missing from a stale smart-diff under Core", () => {
    smartDiffState = { data: { ...SMART, groups: SMART.groups.filter((g) => g.role !== "wiring") } };
    renderTab();
    // routes.ts is not in any group -> appended to core, which is expanded
    expect(screen.getByText("src/routes.ts")).toBeInTheDocument();
    expect(headerNames()[0]).toContain("Core");
    expect(headerNames()[0]).toContain("2 files");
  });

  it("falls back to original order with no toggle while smart-diff is loading", () => {
    smartDiffState = { data: undefined, isLoading: true };
    renderTab();
    expect(screen.queryByRole("button", { name: "Smart order" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Core/ })).not.toBeInTheDocument();
    FILES.forEach((f) => expect(screen.getByText(f.path)).toBeInTheDocument());
  });

  it("shows the large-PR notice with proposed splits only when too_big", () => {
    smartDiffState = {
      data: {
        ...SMART,
        split_suggestion: {
          too_big: true,
          total_lines: 1234,
          proposed_splits: [
            { name: "Backend API", files: ["src/core.ts", "src/routes.ts"] },
            { name: "Docs", files: ["README.md"] },
          ],
        },
      },
    };
    const { unmount } = renderTab();

    const note = screen.getByRole("note");
    expect(within(note).getByText("This PR is large (1234 changed lines)")).toBeInTheDocument();
    expect(within(note).getByText(prReview.smartDiff.largeBody)).toBeInTheDocument();
    expect(within(note).getAllByRole("listitem")).toHaveLength(2);
    expect(within(note).getByText("Backend API (2 files)")).toBeInTheDocument();
    expect(within(note).getByText("Docs (1 files)")).toBeInTheDocument();
    unmount();

    smartDiffState = { data: SMART };
    renderTab();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(/This PR is large/)).not.toBeInTheDocument();
  });

  it("falls back to original order with no groups or toggle when smart-diff errors, findings still inline", () => {
    smartDiffState = { data: undefined, isError: true };
    renderTab({ reviews: [review([finding("f1")])] });

    expect(headerNames()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Smart order" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Original order" })).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    const paths = FILES.map((f) => screen.getByText(f.path));
    for (let i = 1; i < paths.length; i++) {
      expect(paths[i - 1]!.compareDocumentPosition(paths[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByText("Title f1")).toBeInTheDocument();
  });
});

describe("DiffTab finding visibility + jump", () => {
  beforeEach(() => {
    smartDiffState = { data: SMART };
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("toolbar button hides and re-shows all inline findings", () => {
    renderTab({ reviews: [review([finding("f1")])] });
    expect(screen.getByText("Title f1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide findings (1)" }));
    expect(screen.queryByText("Title f1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show findings (1)" }));
    expect(screen.getByText("Title f1")).toBeInTheDocument();
  });

  it("clicking the severity pill collapses and reopens that finding", () => {
    renderTab({ reviews: [review([finding("f1")])] });
    const pill = screen.getByRole("button", { name: "Show or hide this finding" });
    fireEvent.click(pill);
    expect(screen.queryByText("Title f1")).not.toBeInTheDocument();
    fireEvent.click(pill);
    expect(screen.getByText("Title f1")).toBeInTheDocument();
  });

  it("clicking the file's finding indicator reveals a hidden finding and scrolls to it", () => {
    renderTab({ reviews: [review([finding("f1")])] });
    fireEvent.click(screen.getByRole("button", { name: "Hide findings (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Go to first finding" }));
    expect(screen.getByText("Title f1")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
