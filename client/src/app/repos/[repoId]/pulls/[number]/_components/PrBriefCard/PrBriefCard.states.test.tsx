import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefPage, PrFile } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import * as toastLib from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { PrBriefCard } from "./PrBriefCard";

/**
 * SPEC-03 gap-closing cases for PrBriefCard: AC-6, AC-13, AC-14/23 (EC-11),
 * AC-22/24 (sentinel catalogue), AC-30 (injection), EC-5/7/9 at card level.
 * EC-10 (reduced motion, AC-27) is not exercisable here: the scroll call lives
 * in the diff view, the card only forwards onFocusFile.
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

type Props = {
  onFocusFile?: (file: string, line: number | null) => void;
  files?: PrFile[];
  reviewRunCount?: number;
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

function expandDetails() {
  fireEvent.click(screen.getByRole("button", { name: /show details|@@details\.show@@/i }));
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
    what: "Old what text.",
    why: "Old why text.",
    risk_level: "high",
    risks: [
      {
        kind: "auth_surface",
        title: "Risk title one",
        explanation: "Risk explanation one.",
        severity: "high",
        file_refs: ["src/a.ts:5", "src/b.ts"],
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

function withBrief(o: Partial<NonNullable<BriefPage["brief"]>>): BriefPage {
  return { ...PAGE, brief: { ...PAGE.brief!, ...o } };
}

describe("PrBriefCard - risk header (AC-6)", () => {
  it("AC-6: clicking a risk header twice flips aria-expanded true then false and never navigates", () => {
    pageData = PAGE;
    const onFocusFile = vi.fn();
    renderCard({ onFocusFile, files: FILES });
    expandDetails();

    const header = screen.getByRole("button", { name: /Risk title one/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Risk explanation one.")).toBeInTheDocument();
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Risk explanation one.")).not.toBeInTheDocument();
    expect(onFocusFile).not.toHaveBeenCalled();
  });
});

describe("PrBriefCard - generating to generated (AC-13)", () => {
  it("AC-13: skeleton and no stale body while generating; new body and no skeleton after", () => {
    pageData = PAGE;
    mutationPending = true;
    const { container, rerender } = renderCard();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("Old what text.")).not.toBeInTheDocument();

    mutationPending = false;
    pageData = withBrief({ what: "Brand new what.", why: "Brand new why." });
    rerender(ui(messages, {}));

    expect(container.querySelectorAll(".skeleton")).toHaveLength(0);
    expect(screen.getByText("Brand new what.")).toBeInTheDocument();
    expect(screen.getByText("Brand new why.")).toBeInTheDocument();
    expect(screen.queryByText("Old what text.")).not.toBeInTheDocument();
    expect(screen.queryByText(messages.status.generating)).not.toBeInTheDocument();
  });
});

describe("PrBriefCard - failed generation (AC-14, AC-23, EC-11)", () => {
  it("AC-14/EC-11: ApiError message is toasted; stale body and catalogue failure line stay", () => {
    pageData = PAGE;
    mutationFailed = true;
    const { container } = renderCard();

    expect(container.querySelectorAll(".skeleton")).toHaveLength(0);
    expect(screen.getByText("Old what text.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(messages.status.failed);

    fireEvent.click(screen.getByRole("button", { name: messages.generate.regenerate }));
    const opts = mutate.mock.calls[0]![1] as { onError: (e: unknown) => void };
    opts.onError(new ApiError("Provider is down", 502));
    expect(toastApi.error).toHaveBeenLastCalledWith("Provider is down");
  });

  it("AC-23/EC-11: plain Error and empty-message ApiError fall back to generate.error; empty state stays", () => {
    pageData = EMPTY;
    mutationFailed = true;
    renderCard();

    expect(screen.getByText(messages.section.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.section.emptyBody)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(messages.status.failed);

    fireEvent.click(screen.getByRole("button", { name: messages.generate.generate }));
    const opts = mutate.mock.calls[0]![1] as { onError: (e: unknown) => void };
    opts.onError(new Error("boom"));
    expect(toastApi.error).toHaveBeenLastCalledWith(messages.generate.error);
    opts.onError(new ApiError("", 500));
    expect(toastApi.error).toHaveBeenLastCalledWith(messages.generate.error);
    expect(toastApi.error).toHaveBeenCalledTimes(2);
  });
});

function sentinelize(node: unknown, path: string[] = []): unknown {
  if (typeof node === "string") return `@@${path.join(".")}@@`;
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, sentinelize(v, [...path, k])]));
  }
  return node;
}

describe("PrBriefCard - catalogue sentinels (AC-22, AC-24)", () => {
  const SENT = sentinelize(messages);

  it("AC-22/AC-24: card, risk, focus and not-in-diff labels all come from the catalogue", () => {
    pageData = withBrief({
      review_focus: [
        { file: "src/a.ts", line: 3, reason: "r1" },
        { file: "src/gone.ts", line: 1, reason: "r2" },
      ],
    });
    renderCard({ onFocusFile: vi.fn(), files: FILES, reviewRunCount: 0 }, SENT);

    for (const k of [
      "section.title",
      "risk.badge.high",
      "reviewNotRun",
      "details.show",
    ]) {
      expect(screen.getAllByText(`@@${k}@@`).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("button", { name: "@@generate.regenerate@@" })).toBeInTheDocument();
    expect(screen.getByText(/^@@provenance\.generatedBy@@$/)).toBeInTheDocument();

    expandDetails();
    expect(screen.getByText("@@details.hide@@")).toBeInTheDocument();
    for (const k of ["section.risks", "section.focus", "risk.level.high", "risk.kind.auth_surface"]) {
      expect(screen.getByText(`@@${k}@@`)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "src/gone.ts:1" }));
    expect(screen.getByText("@@navigation.notInDiff@@")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "@@navigation.openExternal@@" })).toBeInTheDocument();
  });

  it("AC-22/AC-24: empty, skeleton, failed and no-risk/no-focus lines are catalogue text", () => {
    pageData = EMPTY;
    const first = renderCard({}, SENT);
    expect(screen.getByText("@@section.emptyTitle@@")).toBeInTheDocument();
    expect(screen.getByText("@@section.emptyBody@@")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "@@generate.generate@@" })).toBeInTheDocument();
    first.unmount();

    mutationPending = true;
    const second = renderCard({}, SENT);
    expect(screen.getByRole("status")).toHaveTextContent("@@status.generating@@");
    second.unmount();

    mutationPending = false;
    mutationFailed = true;
    pageData = PAGE;
    const third = renderCard({}, SENT);
    expect(screen.getByRole("status")).toHaveTextContent("@@status.failed@@");
    third.unmount();

    mutationFailed = false;
    pageData = withBrief({ risks: [], review_focus: [] });
    renderCard({}, SENT);
    expandDetails();
    expect(screen.getByText("@@section.noRisks@@")).toBeInTheDocument();
    expect(screen.getByText("@@focus.empty@@")).toBeInTheDocument();
  });

  it("AC-23: the toast fallback is the catalogue sentinel", () => {
    pageData = PAGE;
    renderCard({}, SENT);
    fireEvent.click(screen.getByRole("button", { name: "@@generate.regenerate@@" }));
    const opts = mutate.mock.calls[0]![1] as { onError: (e: unknown) => void };
    opts.onError(new Error("x"));
    expect(toastApi.error).toHaveBeenCalledWith("@@generate.error@@");
  });
});

describe("PrBriefCard - untrusted text (AC-30)", () => {
  const SCRIPT = "<script>window.__pwn=1</script>";
  const IMG = "<img src=x onerror=alert(1)>";
  const LINK = '<a href="javascript:alert(1)">click</a>';

  it("AC-30: markup in what, why, risk title/explanation, file refs and focus fields stays inert text", () => {
    const scriptsBefore = document.querySelectorAll("script").length;
    const risk = PAGE.brief!.risks[0]!;
    pageData = withBrief({
      what: `what ${SCRIPT}`,
      why: `why ${IMG}`,
      risks: [
        {
          ...risk,
          title: `title ${SCRIPT} ${IMG}`,
          explanation: `expl ${SCRIPT} ${IMG} ${LINK}`,
          file_refs: [`${LINK}:7`, `${IMG}`],
        },
      ],
      review_focus: [{ file: `${SCRIPT}${LINK}`, line: 2, reason: `reason ${IMG} ${LINK}` }],
    });

    for (const props of [{ onFocusFile: vi.fn(), files: FILES }, {}] as Props[]) {
      const { container } = renderCard(props);
      expandDetails();
      fireEvent.click(screen.getByRole("button", { name: /Auth surface title/ }));

      expect(screen.getByText(`what ${SCRIPT}`)).toBeInTheDocument();
      expect(screen.getByText(`why ${IMG}`)).toBeInTheDocument();
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("a[href^='javascript']")).toBeNull();
      expect(container.querySelector("[onerror]")).toBeNull();
      expect(document.querySelectorAll("script")).toHaveLength(scriptsBefore);
      // Any anchor present must be a pinned https host link, never brief-derived markup.
      for (const a of Array.from(container.querySelectorAll("a"))) {
        expect(a.getAttribute("href") ?? "").not.toMatch(/javascript:|<|>/);
      }
      expect((window as unknown as { __pwn?: number }).__pwn).toBeUndefined();
      cleanup();
    }
  });

  it("AC-30: clicking a hostile ref shows the notice; any anchor is only the pinned encoded host link", () => {
    const risk = PAGE.brief!.risks[0]!;
    pageData = withBrief({ risks: [{ ...risk, title: "T", file_refs: [`${LINK}`] }], review_focus: [] });
    const { container } = renderCard({ onFocusFile: vi.fn(), files: FILES });
    expandDetails();
    fireEvent.click(screen.getByRole("button", { name: /Auth surface T$/ }));
    fireEvent.click(screen.getByRole("button", { name: LINK }));
    expect(screen.getByText(messages.navigation.notInDiff)).toBeInTheDocument();
    // The only anchor allowed is the pinned, percent-encoded host blob link - never brief markup.
    const anchors = Array.from(container.querySelectorAll("a"));
    for (const a of anchors) {
      const href = a.getAttribute("href") ?? "";
      expect(href).toMatch(/^https:\/\/github\.com\/acme\/demo\/blob\/sha-head\/[^<>" ]*$/);
      expect(a).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
    expect(container.querySelector("a[href^='javascript']")).toBeNull();
    expect(container.querySelector("img, script")).toBeNull();
  });
});

describe("PrBriefCard - edge cases at card level (EC-5, EC-7, EC-9)", () => {
  it("EC-5/AC-3: null focus line and a line-less risk ref both forward line null", () => {
    const risk = PAGE.brief!.risks[0]!;
    pageData = withBrief({
      risks: [{ ...risk, title: "R", file_refs: ["src/b.ts"] }],
      review_focus: [{ file: "src/a.ts", line: null, reason: "whole file" }],
    });
    const onFocusFile = vi.fn();
    renderCard({ onFocusFile, files: FILES });
    expandDetails();
    fireEvent.click(screen.getByRole("button", { name: "src/a.ts" }));
    expect(onFocusFile).toHaveBeenLastCalledWith("src/a.ts", null);
    fireEvent.click(screen.getByRole("button", { name: /Auth surface R$/ }));
    fireEvent.click(screen.getByRole("button", { name: "src/b.ts" }));
    expect(onFocusFile).toHaveBeenLastCalledWith("src/b.ts", null);
  });

  it("EC-5: an empty PR file list treats every reference as not in the diff", () => {
    pageData = PAGE;
    const onFocusFile = vi.fn();
    renderCard({ onFocusFile, files: [] });
    expandDetails();
    fireEvent.click(screen.getByRole("button", { name: "src/a.ts:3" }));
    expect(onFocusFile).not.toHaveBeenCalled();
    expect(screen.getByText(messages.navigation.notInDiff)).toBeInTheDocument();
  });

  it("EC-7/AC-10: repeated clicks on the same target each navigate; different out-of-diff targets keep one notice", () => {
    pageData = withBrief({
      review_focus: [
        { file: "src/a.ts", line: 3, reason: "in" },
        { file: "src/x.ts", line: 1, reason: "out1" },
        { file: "src/y.ts", line: 2, reason: "out2" },
      ],
    });
    const onFocusFile = vi.fn();
    renderCard({ onFocusFile, files: FILES });
    expandDetails();

    const inDiff = screen.getByRole("button", { name: "src/a.ts:3" });
    fireEvent.click(inDiff);
    fireEvent.click(inDiff);
    fireEvent.click(inDiff);
    expect(onFocusFile).toHaveBeenCalledTimes(3);
    expect(onFocusFile).toHaveBeenNthCalledWith(3, "src/a.ts", 3);

    const outA = screen.getByRole("button", { name: "src/x.ts:1" });
    const outB = screen.getByRole("button", { name: "src/y.ts:2" });
    fireEvent.click(outA);
    fireEvent.click(outA);
    expect(screen.getAllByText(messages.navigation.notInDiff)).toHaveLength(1);
    fireEvent.click(outB);
    expect(screen.getAllByText(messages.navigation.notInDiff)).toHaveLength(1);
    expect(within(outB.closest("li")!).getByText(messages.navigation.notInDiff)).toBeInTheDocument();

    // A later successful navigation clears the notice.
    fireEvent.click(inDiff);
    expect(screen.queryByText(messages.navigation.notInDiff)).not.toBeInTheDocument();
  });

  it("EC-9/AC-26: header, ref and focus controls are tabbable native buttons that can take focus", () => {
    pageData = PAGE;
    renderCard({ onFocusFile: vi.fn(), files: FILES });
    expandDetails();
    fireEvent.click(screen.getByRole("button", { name: /Risk title one/ }));

    const controls = [
      screen.getByRole("button", { name: /Risk title one/ }),
      screen.getByRole("button", { name: "src/a.ts:5" }),
      screen.getByRole("button", { name: "src/a.ts:3" }),
    ];
    for (const c of controls) {
      expect(c.tagName).toBe("BUTTON");
      expect(c).not.toHaveAttribute("tabindex", "-1");
      expect(c).toBeEnabled();
      c.focus();
      expect(c).toHaveFocus();
    }
  });
});
