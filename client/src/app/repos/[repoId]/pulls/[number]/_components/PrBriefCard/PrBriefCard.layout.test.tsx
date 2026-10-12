import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefPage, PrFile } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import * as toastLib from "@/lib/toast";
import { PrBriefCard } from "./PrBriefCard";

/**
 * SPEC-05 card-level cases (plan step 5): AC-4, AC-7, AC-8, AC-9, AC-16, AC-17,
 * AC-19, AC-20, AC-23, NFR-3, EC-7, EC-8 and the render-prop contract
 * (parts null/non-null per state; no remount across generated -> generating -> generated).
 */

const mutate = vi.fn();
let pageData: BriefPage | undefined;
let mutationPending = false;
let mutationFailed = false;

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => ({ data: pageData, isLoading: false }),
  useGenerateBrief: () => ({ mutate, isPending: mutationPending, isError: mutationFailed }),
}));

vi.mock("../RunReviewDropdown", () => ({
  RunReviewDropdown: () => <button type="button">Run Review</button>,
}));

const toastApi = { toast: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.spyOn(toastLib, "useToast").mockReturnValue(toastApi);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  pageData = undefined;
  mutationPending = false;
  mutationFailed = false;
});

type Parts = { panel: React.ReactNode; riskAreas: React.ReactNode | null; reviewFocus: React.ReactNode | null };
type Props = {
  onFocusFile?: (file: string, line: number | null) => void;
  files?: PrFile[];
  reviewRunCount?: number;
  children?: (parts: Parts) => React.ReactNode;
};

function ui(msgs: unknown, props: Props) {
  return (
    <NextIntlClientProvider locale="en" messages={{ brief: msgs as typeof messages }}>
      <PrBriefCard prId="pr-1" repoFullName="acme/demo" {...props} />
    </NextIntlClientProvider>
  );
}

function renderCard(props: Props = {}, msgs: unknown = messages): RenderResult {
  return render(ui(msgs, props));
}

const FILES = [{ path: "src/a.ts" }, { path: "src/b.ts" }] as PrFile[];

const PAGE: BriefPage = {
  status: "generated",
  reason: null,
  current_head_sha: "sha-head",
  stale_markers: [],
  provenance: {
    head_sha: "sha-head",
    generated_at: "2026-08-13T00:00:00Z",
    model: "gpt-4.1",
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
  },
  brief: {
    what: "What text.",
    why: "Why text.",
    risk_level: "high",
    risks: [
      {
        kind: "auth_surface",
        title: "Risk title one",
        explanation: "Risk explanation one.",
        severity: "high",
        file_refs: ["src/a.ts:12-18", "src/b.ts"],
      },
    ],
    review_focus: [{ file: "src/a.ts", line: 3, reason: "Focus reason." }],
  },
};

const EMPTY: BriefPage = {
  status: "none",
  reason: null,
  brief: null,
  provenance: null,
  current_head_sha: "s",
  stale_markers: [],
};

function withBrief(o: Partial<NonNullable<BriefPage["brief"]>>, p: Partial<BriefPage> = {}): BriefPage {
  return { ...PAGE, ...p, brief: { ...PAGE.brief!, ...o } };
}

/** Render-prop that exposes the parts it received and lays them out. */
function capture() {
  const seen: Parts[] = [];
  const children = (parts: Parts) => {
    seen.push(parts);
    return (
      <div>
        <div data-testid="panel">{parts.panel}</div>
        <div data-testid="risks">{parts.riskAreas}</div>
        <div data-testid="focus">{parts.reviewFocus}</div>
      </div>
    );
  };
  return { seen, children, last: () => seen[seen.length - 1]! };
}

describe("PrBriefCard layout - risk rows and regions (AC-4, AC-7, AC-8, AC-9, EC-7, EC-8)", () => {
  it("AC-7/EC-7/AC-4: collapsed row shows title and first ref only as inert text; no details toggle", () => {
    pageData = PAGE;
    renderCard({ onFocusFile: vi.fn(), files: FILES });

    const header = screen.getByRole("button", { name: /Risk title one/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(within(header).getByText("src/a.ts:12-18")).toBeInTheDocument();
    expect(within(header).queryByText("src/b.ts")).not.toBeInTheDocument();
    // The ref is plain text: no nested control or link, and no standalone ref button.
    expect(header.querySelector("a, button")).toBeNull();
    expect(screen.queryByRole("button", { name: "src/a.ts:12-18" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /src\/a\.ts/ })).not.toBeInTheDocument();
    expect(screen.queryByText("src/b.ts")).not.toBeInTheDocument();

    // AC-4: no disclosure toggle anywhere.
    expect(screen.queryByText(/show details|hide details/i)).not.toBeInTheDocument();
    for (const b of screen.getAllByRole("button")) {
      if (b === header) continue;
      expect(b.getAttribute("aria-expanded")).toBeNull();
    }
  });

  it("EC-8: long title and ref styles do not truncate (no nowrap / ellipsis)", () => {
    const long = "very/long/".repeat(30) + "file.ts:99";
    const risk = PAGE.brief!.risks[0]!;
    pageData = withBrief({ risks: [{ ...risk, title: "T".repeat(200), file_refs: [long] }] });
    renderCard();
    const header = screen.getByRole("button", { name: /T{200}/ });
    const ref = within(header).getByText(long);
    for (const el of [header, ref, within(header).getByText("T".repeat(200))]) {
      expect(el.style.whiteSpace).not.toBe("nowrap");
      expect(el.style.textOverflow).not.toBe("ellipsis");
    }
  });

  it("AC-8: expanding shows explanation and both refs as buttons; header ref not duplicated; in-diff ref navigates", () => {
    pageData = PAGE;
    const onFocusFile = vi.fn();
    renderCard({ onFocusFile, files: FILES });

    const header = screen.getByRole("button", { name: /Risk title one/ });
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Risk explanation one.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/a.ts:12-18" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/b.ts" })).toBeInTheDocument();
    // The first ref appears once (expanded list only), not also in the header.
    expect(screen.getAllByText("src/a.ts:12-18")).toHaveLength(1);

    // (A "12-18" range tail is not parsed as a line by splitFileRef, so use the plain ref.)
    fireEvent.click(screen.getByRole("button", { name: "src/b.ts" }));
    expect(onFocusFile).toHaveBeenCalledWith("src/b.ts", null);
  });

  it("AC-9/AC-23: zero risks shows the no-risks text under the Risk areas region", () => {
    pageData = withBrief({ risks: [] });
    renderCard();
    const region = screen.getByRole("region", { name: messages.section.risks });
    expect(within(region).getByText(messages.section.noRisks)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: messages.section.focus })).toBeInTheDocument();
  });

  it("AC-23: details.* keys are gone and section.focus / section.risks render from the catalogue", () => {
    expect((messages as Record<string, unknown>).details).toBeUndefined();
    expect(messages.section.focus).toBe("Review focus - read these first");

    const sentinelize = (node: unknown, path: string[] = []): unknown => {
      if (typeof node === "string") return `@@${path.join(".")}@@`;
      if (node && typeof node === "object") {
        return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, sentinelize(v, [...path, k])]));
      }
      return node;
    };
    pageData = PAGE;
    renderCard({ onFocusFile: vi.fn(), files: FILES }, sentinelize(messages));
    expect(screen.getByRole("region", { name: "@@section.risks@@" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "@@section.focus@@" })).toBeInTheDocument();
    expect(screen.queryByText(/@@details\./)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.section.focus)).not.toBeInTheDocument();
  });
});

describe("PrBriefCard layout - render-prop contract (AC-16, AC-17, AC-19, AC-20)", () => {
  it("AC-16: no brief -> riskAreas and reviewFocus are null", () => {
    pageData = EMPTY;
    const c = capture();
    renderCard({ children: c.children });
    expect(c.last().riskAreas).toBeNull();
    expect(c.last().reviewFocus).toBeNull();
    expect(c.last().panel).toBeTruthy();
    expect(screen.getByRole("button", { name: messages.generate.generate })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: messages.section.risks })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: messages.section.focus })).not.toBeInTheDocument();
  });

  it("AC-17: generating -> parts are null and old rows are not shown", () => {
    pageData = PAGE;
    mutationPending = true;
    const c = capture();
    renderCard({ children: c.children });
    expect(c.last().riskAreas).toBeNull();
    expect(c.last().reviewFocus).toBeNull();
    expect(screen.queryByText("Risk title one")).not.toBeInTheDocument();
    expect(screen.queryByText("Focus reason.")).not.toBeInTheDocument();
  });

  it("AC-19/AC-20: failed-with-brief and possibly_stale keep both parts non-null and rendered", () => {
    pageData = PAGE;
    mutationFailed = true;
    const failed = capture();
    renderCard({ children: failed.children });
    expect(failed.last().riskAreas).not.toBeNull();
    expect(failed.last().reviewFocus).not.toBeNull();
    expect(screen.getByText("Risk title one", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Focus reason.", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(messages.status.failed);
    cleanup();

    mutationFailed = false;
    pageData = withBrief({}, { status: "possibly_stale", stale_markers: ["intent"] as BriefPage["stale_markers"] });
    const stale = capture();
    renderCard({ children: stale.children });
    expect(stale.last().riskAreas).not.toBeNull();
    expect(stale.last().reviewFocus).not.toBeNull();
    expect(screen.getByRole("region", { name: messages.section.risks })).toBeInTheDocument();
    expect(screen.getByText(/may be out of date/)).toBeInTheDocument();
  });

  it("without children the default layout still renders panel, risks and focus", () => {
    pageData = PAGE;
    renderCard({ onFocusFile: vi.fn(), files: FILES });
    expect(screen.getByText("What text.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: messages.section.risks })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: messages.section.focus })).toBeInTheDocument();
  });

  it("no remount: a stateful child in the render-prop tree survives generated -> generating -> generated", () => {
    const mounts = vi.fn();
    const unmounts = vi.fn();
    function Counter() {
      const [n, setN] = React.useState(0);
      React.useEffect(() => {
        mounts();
        return () => unmounts();
      }, []);
      return (
        <button type="button" data-testid="counter" onClick={() => setN((x) => x + 1)}>
          count:{n}
        </button>
      );
    }
    const children = (parts: Parts) => (
      <div>
        <div>{parts.panel}</div>
        <Counter />
        {parts.riskAreas}
        {parts.reviewFocus}
      </div>
    );

    pageData = PAGE;
    const { rerender } = renderCard({ children });
    fireEvent.click(screen.getByTestId("counter"));
    fireEvent.click(screen.getByTestId("counter"));
    expect(screen.getByTestId("counter")).toHaveTextContent("count:2");

    mutationPending = true;
    rerender(ui(messages, { children }));
    expect(screen.queryByText("Risk title one")).not.toBeInTheDocument();
    expect(screen.getByTestId("counter")).toHaveTextContent("count:2");

    mutationPending = false;
    pageData = withBrief({ what: "Newer what." });
    rerender(ui(messages, { children }));
    expect(screen.getByText("Newer what.")).toBeInTheDocument();
    expect(screen.getByText("Risk title one", { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId("counter")).toHaveTextContent("count:2");

    expect(mounts).toHaveBeenCalledTimes(1);
    expect(unmounts).not.toHaveBeenCalled();
  });
});

describe("PrBriefCard layout - untrusted text in the collapsed header (NFR-3)", () => {
  it("NFR-3: hostile title and first ref render as inert text, never an element or link", () => {
    const IMG = "<img src=x onerror=alert(1)>";
    const LINK = '<a href="javascript:alert(1)">click</a>';
    const risk = PAGE.brief!.risks[0]!;
    pageData = withBrief({
      risks: [{ ...risk, title: `T ${IMG}`, file_refs: [`javascript:alert(1)`, LINK] }],
      review_focus: [],
    });
    const onFocusFile = vi.fn();
    const { container } = renderCard({ onFocusFile, files: FILES });

    const header = screen.getByRole("button", { name: /^.*T <img/ });
    expect(within(header).getByText("javascript:alert(1)")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a[href^='javascript']")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(header.querySelector("a")).toBeNull();

    fireEvent.click(header);
    expect(onFocusFile).not.toHaveBeenCalled();
  });
});
