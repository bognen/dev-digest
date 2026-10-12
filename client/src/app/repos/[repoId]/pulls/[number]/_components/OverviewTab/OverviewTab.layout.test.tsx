import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefPage, ReviewRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import intentMessages from "../../../../../../../../messages/en/intent.json";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import * as toastLib from "@/lib/toast";

/** SPEC-05: Overview layout (label, banner, brief panel, grid with Risk areas, Review focus). */

type IntentState = { data: unknown; isLoading: boolean; isError: boolean };

let reviewsData: ReviewRecord[] | undefined;
let briefPage: BriefPage | undefined;
let intentState: IntentState;
let genState: { isPending: boolean; isError: boolean };
const generateMutate = vi.fn();
const useBriefSpy = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: reviewsData }),
  usePrRuns: () => ({ data: undefined }),
}));
vi.mock("@/lib/hooks/brief", () => ({
  useBrief: (...args: unknown[]) => {
    useBriefSpy(...args);
    return { data: briefPage, isLoading: false };
  },
  useGenerateBrief: () => ({ mutate: generateMutate, ...genState }),
}));
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => intentState,
  useRegenerateIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/blast-radius", () => ({
  useBlastRadius: () => ({ data: undefined, isLoading: true }),
}));
vi.mock("../RunReviewDropdown", () => ({
  RunReviewDropdown: () => <button type="button">Run Review</button>,
}));

vi.spyOn(toastLib, "useToast").mockReturnValue({
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
});

import { OverviewTab } from "./OverviewTab";

const NOT_GENERATED: IntentState = {
  data: { intent: null, unavailable_reason: "not_generated" },
  isLoading: false,
  isError: false,
};

const INTENT_RECORD: IntentState = {
  data: {
    intent: {
      pr_id: "pr-1",
      intent: "Add webhook retries",
      in_scope: ["Retry logic"],
      out_of_scope: ["Queue rewrite"],
      confidence: "high",
      sources: ["title", "description"],
      ticket_refs: [],
      linked_issue: null,
      provider: null,
      model: null,
      head_sha: null,
      generated_at: "2026-10-01T00:00:00Z",
      stale: false,
    },
    unavailable_reason: null,
  },
  isLoading: false,
  isError: false,
};

beforeEach(() => {
  reviewsData = [];
  briefPage = undefined;
  intentState = NOT_GENERATED;
  genState = { isPending: false, isError: false };
  generateMutate.mockReset();
  useBriefSpy.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.spyOn(toastLib, "useToast").mockReturnValue({
    toast: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  });
});

const PROVENANCE = {
  head_sha: "sha-head",
  generated_at: "2026-08-13T00:00:00Z",
  model: "m",
  provider: "openai",
  attempts: 1,
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0.01,
  index_sha: "i",
  index_status: "full",
  index_reason: null,
  intent_resolved_at: null,
  dropped_inputs: 0,
};

interface Opts {
  status?: BriefPage["status"];
  summary?: string;
  risks?: Array<{ title: string; file_refs?: string[]; explanation?: string }>;
  focus?: Array<{ file: string; line: number | null; reason: string }>;
  stale_markers?: string[];
}

function page(o: Opts = {}): BriefPage {
  return {
    status: o.status ?? "generated",
    reason: null,
    current_head_sha: "sha-head",
    stale_markers: o.stale_markers ?? [],
    provenance: PROVENANCE,
    brief: {
      summary: o.summary ?? "Brief summary text",
      what: "W",
      why: "Y",
      risk_level: "medium",
      risks: (o.risks ?? []).map((r) => ({
        kind: "other",
        severity: "medium",
        title: r.title,
        explanation: r.explanation ?? "Because.",
        file_refs: r.file_refs ?? ["src/a.ts:3"],
      })),
      review_focus: o.focus ?? [],
    },
  } as unknown as BriefPage;
}

const NO_BRIEF = {
  status: "none",
  reason: null,
  brief: null,
  provenance: null,
  current_head_sha: "sha1",
  stale_markers: [],
} as unknown as BriefPage;

function review(): ReviewRecord {
  return {
    id: "rev",
    pr_id: "pr-1",
    agent_id: "a",
    run_id: "r",
    agent_name: "Agent A",
    kind: "review",
    verdict: "approve",
    summary: "All good.",
    score: 90,
    model: null,
    grounding: null,
    created_at: "2026-10-01T10:00:00Z",
    findings: [],
  };
}

function ui(
  props: Partial<React.ComponentProps<typeof OverviewTab>> = {},
  messages: Record<string, unknown> = {},
): React.ReactElement {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{
        brief: briefMessages,
        prReview: prReviewMessages,
        intent: intentMessages,
        blast: blastMessages,
        ...messages,
      }}
    >
      <OverviewTab prId="pr-1" prBody={null} repoFullName="acme/demo" reviewRunCount={1} {...props} />
    </NextIntlClientProvider>
  );
}

function renderOverview(
  props: Partial<React.ComponentProps<typeof OverviewTab>> = {},
  messages: Record<string, unknown> = {},
): RenderResult {
  return render(ui(props, messages));
}

const RISK_REGION = "Risk areas";
const FOCUS_REGION = briefMessages.section.focus;

function follows(a: Node, b: Node): boolean {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** The grid is the element whose inline display is "grid"; cells are its children. */
function cellOf(el: HTMLElement): HTMLElement {
  let cur: HTMLElement | null = el;
  while (cur && cur.parentElement) {
    if (cur.parentElement.style.display === "grid") return cur;
    cur = cur.parentElement;
  }
  throw new Error("element is not inside the grid");
}

const TWO_RISKS = [
  { title: "Risk One", file_refs: ["src/a.ts:12"] },
  { title: "Risk Two", file_refs: ["src/b.ts"] },
];
const TWO_FOCUS = [
  { file: "src/config.ts", line: 12, reason: "Config reason" },
  { file: "src/x.ts", line: null, reason: "No line reason" },
];

describe("OverviewTab layout (SPEC-05)", () => {
  it("AC-1/AC-2/AC-3/AC-4/AC-10/AC-11/AC-12: one label, DOM order, regions visible with no click, no details toggle", () => {
    reviewsData = [review()];
    briefPage = page({
      risks: TWO_RISKS,
      focus: [...TWO_FOCUS, { file: "src/c.ts", line: 1, reason: "C" }, { file: "src/d.ts", line: 2, reason: "D" }],
    });
    renderOverview();

    const labels = screen.getAllByText(briefMessages.section.title);
    expect(labels).toHaveLength(1);
    const banner = screen.getByRole("region", { name: "Latest review" });
    const panel = screen.getByText("Brief summary text");
    const risk = screen.getByRole("region", { name: RISK_REGION });
    const focus = screen.getByRole("region", { name: FOCUS_REGION });
    const grid = cellOf(risk).parentElement as HTMLElement;

    expect(follows(labels[0]!, banner)).toBe(true);
    expect(follows(banner, panel)).toBe(true);
    expect(follows(panel, grid)).toBe(true);
    expect(follows(grid, focus)).toBe(true);

    // AC-3: everything visible without any click.
    expect(within(risk).getByText("Risk One")).toBeInTheDocument();
    expect(within(risk).getByText("Risk Two")).toBeInTheDocument();
    expect(within(focus).getAllByRole("listitem")).toHaveLength(4);

    // AC-4
    expect(screen.queryByText(/show details/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hide details/i)).not.toBeInTheDocument();

    // AC-10: Blast radius is the sibling cell of the Risk areas (left) cell.
    const left = cellOf(risk);
    const blast = screen.getByText("Blast Radius");
    expect(left.parentElement).toBe(grid);
    expect(cellOf(blast)).not.toBe(left);
    expect(cellOf(blast).parentElement).toBe(grid);

    // AC-11/AC-12
    expect(screen.getByTestId("review-focus-count")).toHaveTextContent("4");
    expect(within(focus).getByText("src/config.ts:12")).toBeInTheDocument();
    expect(within(focus).getByText("Config reason")).toBeInTheDocument();
    expect(within(focus).getByText("src/x.ts")).toBeInTheDocument();
    expect(within(focus).getByText("No line reason")).toBeInTheDocument();
  });

  it("AC-2 / EC-11: without a review the banner is absent and the remaining order is unchanged", () => {
    reviewsData = [];
    briefPage = page({ risks: TWO_RISKS, focus: TWO_FOCUS });
    renderOverview();
    expect(screen.queryByRole("region", { name: "Latest review" })).not.toBeInTheDocument();
    const label = screen.getByText(briefMessages.section.title);
    const panel = screen.getByText("Brief summary text");
    const risk = screen.getByRole("region", { name: RISK_REGION });
    const focus = screen.getByRole("region", { name: FOCUS_REGION });
    expect(follows(label, panel)).toBe(true);
    expect(follows(panel, risk)).toBe(true);
    expect(follows(risk, focus)).toBe(true);
  });

  it("AC-5: with an intent record, Risk areas sit in the Intent card after the scope columns", () => {
    intentState = INTENT_RECORD;
    briefPage = page({ risks: TWO_RISKS, focus: TWO_FOCUS });
    renderOverview();
    const risk = screen.getByRole("region", { name: RISK_REGION });
    const statement = screen.getByText("Add webhook retries");
    const card = statement.parentElement as HTMLElement;
    expect(card).toContainElement(risk);
    expect(follows(screen.getByText(intentMessages.outOfScope), risk)).toBe(true);
    expect(follows(screen.getByText("Queue rewrite"), risk)).toBe(true);
  });

  it("AC-6 / EC-1: Risk areas stay in the left grid cell for loading, error and each unavailable reason", () => {
    briefPage = page({ risks: TWO_RISKS, focus: TWO_FOCUS });
    const states: IntentState[] = [
      { data: undefined, isLoading: true, isError: false },
      { data: undefined, isLoading: false, isError: true },
      NOT_GENERATED,
      { data: { intent: null, unavailable_reason: "provider_not_configured" }, isLoading: false, isError: false },
      { data: { intent: null, unavailable_reason: "generation_failed" }, isLoading: false, isError: false },
    ];
    for (const st of states) {
      intentState = st;
      const view = renderOverview();
      const risk = screen.getByRole("region", { name: RISK_REGION });
      const cell = cellOf(risk);
      expect(cell.parentElement!.firstElementChild).toBe(cell);
      expect(within(risk).getByText("Risk One")).toBeInTheDocument();
      view.unmount();
    }
  });

  it("AC-13/AC-14/AC-15/AC-24: focus click navigates in-diff, shows a notice otherwise; empty text without badge; keyboard-operable controls", () => {
    briefPage = page({ risks: TWO_RISKS, focus: TWO_FOCUS });
    const onFocusFile = vi.fn();
    const files = [{ path: "src/config.ts" }] as unknown as React.ComponentProps<typeof OverviewTab>["files"];
    const view = renderOverview({ onFocusFile, files });

    fireEvent.click(screen.getByText("src/config.ts:12"));
    expect(onFocusFile).toHaveBeenCalledWith("src/config.ts", 12);

    onFocusFile.mockClear();
    const absentRow = screen.getByText("src/x.ts").closest("li") as HTMLElement;
    fireEvent.click(within(absentRow).getByRole("button"));
    expect(onFocusFile).not.toHaveBeenCalled();
    expect(within(absentRow).getByText(briefMessages.navigation.notInDiff)).toBeInTheDocument();

    // AC-24: risk header is a native button with aria-expanded; focusable.
    const toggle = screen.getByRole("button", { name: /Risk One/ });
    toggle.focus();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const focusBtn = within(screen.getByRole("region", { name: FOCUS_REGION })).getAllByRole("button")[0]!;
    focusBtn.focus();
    expect(focusBtn).toHaveFocus();
    view.unmount();

    // AC-15
    briefPage = page({ risks: [], focus: [] });
    renderOverview();
    const focus = screen.getByRole("region", { name: FOCUS_REGION });
    expect(within(focus).getByText(briefMessages.focus.empty)).toBeInTheDocument();
    expect(screen.queryByTestId("review-focus-count")).not.toBeInTheDocument();
    // AC-9 (region-level)
    expect(
      within(screen.getByRole("region", { name: RISK_REGION })).getByText(briefMessages.section.noRisks),
    ).toBeInTheDocument();
  });

  it("AC-16: no brief -> empty panel with Generate, no regions; Intent and Blast stay", () => {
    briefPage = NO_BRIEF;
    renderOverview();
    expect(screen.getByText(briefMessages.section.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: briefMessages.generate.generate })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: RISK_REGION })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: FOCUS_REGION })).not.toBeInTheDocument();
    expect(screen.getByText(intentMessages.notAnalysed.title)).toBeInTheDocument();
    expect(screen.getByText("Blast Radius")).toBeInTheDocument();
  });

  it("AC-17/AC-18/AC-19/AC-20/AC-21: generating hides old parts; new page replaces; failure keeps prior; stale keeps regions; footer + refresh", () => {
    briefPage = page({ risks: [{ title: "Old Risk" }], focus: [{ file: "src/o.ts", line: 1, reason: "Old reason" }] });
    genState = { isPending: true, isError: false };
    const view = renderOverview();
    expect(screen.getByText(briefMessages.status.generating)).toBeInTheDocument();
    expect(screen.queryByText("Old Risk")).not.toBeInTheDocument();
    expect(screen.queryByText("Old reason")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: RISK_REGION })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: FOCUS_REGION })).not.toBeInTheDocument();

    // AC-18: generation finishes with a different brief.
    genState = { isPending: false, isError: false };
    briefPage = page({ risks: [{ title: "New Risk" }], focus: [{ file: "src/n.ts", line: 2, reason: "New reason" }] });
    view.rerender(ui());
    expect(screen.getByText("New Risk")).toBeInTheDocument();
    expect(screen.getByText("New reason")).toBeInTheDocument();
    expect(screen.queryByText("Old Risk")).not.toBeInTheDocument();

    // AC-21: footer elements and refresh.
    expect(screen.getByText(/Generated .* · m · /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Review" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: briefMessages.generate.regenerate }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
    expect(generateMutate.mock.calls[0]![0]).toEqual({ regenerate: true });

    // AC-19: failed regeneration keeps previous rows plus the status line.
    genState = { isPending: false, isError: true };
    view.rerender(ui());
    expect(screen.getByText("New Risk")).toBeInTheDocument();
    expect(screen.getByText("New reason")).toBeInTheDocument();
    expect(screen.getByText(briefMessages.status.failed)).toBeInTheDocument();

    // AC-20: possibly stale keeps regions and shows the stale text.
    genState = { isPending: false, isError: false };
    briefPage = page({ status: "possibly_stale", stale_markers: ["src/a.ts"], risks: [{ title: "Stale Risk" }], focus: TWO_FOCUS });
    view.rerender(ui());
    expect(screen.getByText("Stale Risk")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: FOCUS_REGION })).toBeInTheDocument();
    expect(screen.getByText(/may be out of date/)).toBeInTheDocument();
  });

  it("AC-21: 0 runs shows the 'Review not run yet' note", () => {
    briefPage = page({ risks: TWO_RISKS, focus: TWO_FOCUS });
    renderOverview({ reviewRunCount: 0 });
    expect(screen.getByText(briefMessages.reviewNotRun)).toBeInTheDocument();
  });

  it("AC-22 (structural): with matchMedia matching, the grid is a single track and order is Intent, Blast, Focus", () => {
    briefPage = page({ risks: TWO_RISKS, focus: TWO_FOCUS });
    const wide = renderOverview();
    const wideTracks = cellOf(screen.getByRole("region", { name: RISK_REGION })).parentElement!.style.gridTemplateColumns;
    wide.unmount();

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (q: string) => ({
        matches: true,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    try {
      renderOverview();
      const risk = screen.getByRole("region", { name: RISK_REGION });
      const grid = cellOf(risk).parentElement as HTMLElement;
      expect(grid.style.gridTemplateColumns).not.toBe(wideTracks);
      expect(grid.style.gridTemplateColumns.split("),").length).toBe(1);
      expect(follows(risk, screen.getByText("Blast Radius"))).toBe(true);
      expect(follows(screen.getByText("Blast Radius"), screen.getByRole("region", { name: FOCUS_REGION }))).toBe(true);
    } finally {
      // @ts-expect-error restore jsdom default (no matchMedia)
      delete window.matchMedia;
    }
  });

  it("AC-23: every new label comes from the catalogue (sentinels)", () => {
    const sentinelize = (o: unknown, path: string): unknown =>
      typeof o === "string"
        ? `[[${path}]]`
        : Object.fromEntries(
            Object.entries(o as Record<string, unknown>).map(([k, v]) => [k, sentinelize(v, path ? `${path}.${k}` : k)]),
          );
    const sentinel = sentinelize(briefMessages, "") as Record<string, unknown>;
    briefPage = page({ risks: [], focus: [] });
    renderOverview({}, { brief: sentinel });
    expect(screen.getAllByText("[[section.title]]")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "[[section.risks]]" })).toHaveTextContent("[[section.noRisks]]");
    const focus = screen.getByRole("region", { name: "[[section.focus]]" });
    expect(focus).toHaveTextContent("[[focus.empty]]");
    expect(screen.queryByText(briefMessages.section.focus)).not.toBeInTheDocument();
    expect(screen.queryByText(RISK_REGION)).not.toBeInTheDocument();
    expect(screen.queryByText(/details/i)).not.toBeInTheDocument();
  });

  it("NFR-1: no extra brief hook arguments and no fetch while rendering", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    briefPage = page({ risks: TWO_RISKS, focus: TWO_FOCUS });
    renderOverview();
    expect(useBriefSpy.mock.calls.length).toBeGreaterThan(0);
    for (const call of useBriefSpy.mock.calls) expect(call).toEqual(["pr-1"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(generateMutate).not.toHaveBeenCalled();
  });

  it("NFR-3: hostile risk title / focus reason render as inert text and a javascript: path never navigates", () => {
    const evil = '<img src=x onerror="alert(1)">';
    briefPage = page({
      risks: [{ title: evil, file_refs: ["javascript:alert(1)"] }],
      focus: [{ file: "javascript:alert(1)", line: null, reason: evil }],
    });
    const onFocusFile = vi.fn();
    const files = [{ path: "src/a.ts" }] as unknown as React.ComponentProps<typeof OverviewTab>["files"];
    const { container } = renderOverview({ onFocusFile, files });
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(evil).length).toBeGreaterThan(0);
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    const focus = screen.getByRole("region", { name: FOCUS_REGION });
    fireEvent.click(within(focus).getAllByRole("button")[0]!);
    expect(onFocusFile).not.toHaveBeenCalled();
  });
});
