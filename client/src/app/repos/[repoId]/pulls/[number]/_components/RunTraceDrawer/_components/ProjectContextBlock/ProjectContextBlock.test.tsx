import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextTrace, RunTrace } from "@devdigest/shared";
import runsMessages from "../../../../../../../../../../messages/en/runs.json";

let TRACE: RunTrace;
vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: TRACE, isLoading: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import { ProjectContextBlock } from "./ProjectContextBlock";
import RunTraceDrawer from "../../RunTraceDrawer";

const CONTEXT: ProjectContextTrace = {
  docs: [
    { path: "specs/b.md", tokens: 30, text: "BODY OF B: first" },
    { path: "specs/a.md", tokens: 70, text: "BODY OF A: second" },
  ],
  skipped: [
    { path: "docs/gone.md", reason: "missing" },
    { path: "docs/late.md", reason: "over_budget" },
  ],
  total_tokens: 112,
  budget_tokens: 8000,
};

const SPECS = '<untrusted source="project-doc:specs/b.md">\nBODY OF B: first\n</untrusted>';

const BASE_TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 2, grounding: "2/2 passed", cost_usd: 0.06 },
  prompt_assembly: { system: "You are a reviewer.", skills: null, memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [],
  raw_output: "{}",
  memory_pulled: [],
  specs_read: [],
  log: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBlock(context: ProjectContextTrace = CONTEXT): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: runsMessages }}>
      <ProjectContextBlock context={context} specs={SPECS} />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextBlock", () => {
  it("AC-37/AC-38/AC-40: collapsed row shows untrusted, doc count and tokens; expanding lists docs in injection order, opens full text, and lists skipped/dropped separately", () => {
    renderBlock();
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    expect(screen.getByText("untrusted")).toBeInTheDocument();
    expect(screen.getByText("2 docs")).toBeInTheDocument();
    expect(screen.getByText("≈ 112 tokens")).toBeInTheDocument();
    expect(screen.queryByText("specs/b.md")).toBeNull();

    fireEvent.click(screen.getByText("expand"));
    const paths = screen.getAllByText(/^(specs|docs)\/.*\.md$/).map((el) => el.textContent);
    // Injection order (b before a), then the skipped list.
    expect(paths).toEqual(["specs/b.md", "specs/a.md", "docs/gone.md", "docs/late.md"]);
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText("over budget")).toBeInTheDocument();
    expect(screen.getByText("Skipped / dropped")).toBeInTheDocument();

    const openers = screen.getAllByRole("button", { name: "Open full text" });
    expect(openers).toHaveLength(2); // skipped docs have no text to open
    fireEvent.click(openers[1]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("BODY OF A: second")).toBeInTheDocument();
  });

  it("AC-42: Copy writes the heading plus the stored block body to the clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderBlock();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(`## Project context\n${SPECS}`);
  });

  it("AC-41/AC-43: inside the drawer the new block replaces the generic row, specs_read lists paths, and an old trace without project_context still renders", () => {
    TRACE = { ...BASE_TRACE, project_context: CONTEXT, specs_read: ["specs/b.md", "specs/a.md"], prompt_assembly: { ...BASE_TRACE.prompt_assembly, specs: SPECS } };
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={{ runs: runsMessages }}>
        <RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("untrusted")).toBeInTheDocument();
    expect(screen.getByText("2 docs")).toBeInTheDocument();
    // specs_read paths are listed in the Configuration section (block still collapsed).
    expect(screen.getByText("specs/b.md")).toBeInTheDocument();
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.queryByText("Project context (dynamic)")).toBeNull();
    unmount();

    // Old trace (pre-feature): no project_context, legacy specs text.
    TRACE = { ...BASE_TRACE, prompt_assembly: { ...BASE_TRACE.prompt_assembly, specs: "legacy specs text" } };
    render(
      <NextIntlClientProvider locale="en" messages={{ runs: runsMessages }}>
        <RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("untrusted")).toBeNull();
    expect(screen.getByText("Project context (dynamic)")).toBeInTheDocument();
  });
});
