import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi, type MockInstance } from "vitest";
import { render, screen, cleanup, fireEvent, within, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BriefPage, FindingRecord, PrFile, ReviewRecord } from "@devdigest/shared";
import brief from "../../../../../../messages/en/brief.json";
import prReview from "../../../../../../messages/en/prReview.json";
import shell from "../../../../../../messages/en/shell.json";

/**
 * SPEC-03 (PR Brief polish) — page-level integration: Overview brief click ->
 * Files changed focus (AC-1), not-in-diff notice (AC-7), no re-scroll on tab
 * return (AC-11), Findings/Diff finding jump + banner placement (AC-28),
 * untrusted brief text is inert (NFR-5). Hooks are mocked at the `@/lib/...`
 * alias boundary; `next/navigation` is a tiny in-memory router.
 */

// ---- in-memory next/navigation ------------------------------------------
const nav = vi.hoisted(() => {
  let params = new URLSearchParams();
  const listeners = new Set<() => void>();
  return {
    get: () => params,
    reset: (qs = "") => {
      params = new URLSearchParams(qs);
      listeners.forEach((l) => l());
    },
    replace: (url: string) => {
      const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
      params = new URLSearchParams(q);
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});

vi.mock("next/navigation", async () => {
  const R = await import("react");
  return {
    useParams: () => ({ repoId: "repo-1", number: "7" }),
    useRouter: () => ({ replace: nav.replace, push: nav.replace }),
    useSearchParams: () => {
      // Snapshot must be referentially stable between changes.
      const snap = R.useSyncExternalStore(nav.subscribe, () => nav.get().toString(), () => "");
      return R.useMemo(() => new URLSearchParams(snap), [snap]);
    },
  };
});

// ---- hook fixtures -------------------------------------------------------
const state = vi.hoisted(() => ({
  pulls: [] as unknown[],
  pr: undefined as unknown,
  reviews: [] as unknown[],
  runs: [] as unknown[],
  briefPage: undefined as unknown,
}));

const noopMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false };

vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: state.pulls, isLoading: false }),
  usePullDetail: () => ({ data: state.pr, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => noopMutation,
  useFindingAction: () => noopMutation,
  useSmartDiff: () => ({ data: undefined }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: state.reviews, refetch: vi.fn() }),
  usePrRuns: () => ({ data: state.runs }),
  usePrActiveRuns: () => ({ data: [] }),
  useCancelRun: () => noopMutation,
  useDeleteRun: () => noopMutation,
  useDeleteReview: () => noopMutation,
  useFindingAction: () => noopMutation,
}));
vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => ({ data: state.briefPage, isLoading: false }),
  useGenerateBrief: () => noopMutation,
}));
vi.mock("@/lib/hooks/smart-diff", () => ({
  smartDiffKey: (id: string) => ["smart-diff", id],
  useSmartDiff: () => ({ data: undefined }),
}));
vi.mock("@/lib/hooks/intent", () => ({ prIntentKey: (id: string) => ["intent", id] }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo-1", full_name: "acme/demo" }, repos: [], reposLoaded: true }),
  useRepoNotFound: () => false,
}));

// Boundaries with their own tests / heavy chrome / unrelated data.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks/multi-agent", () => ({ useLatestMultiRun: () => ({ data: undefined }) }));
vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown", () => ({
  RunReviewDropdown: () => <button type="button">Run Review</button>,
}));
vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard", () => ({
  IntentCard: ({ riskAreas }: { riskAreas?: React.ReactNode }) => <div>intent-stub{riskAreas}</div>,
}));
vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard", () => ({
  BlastRadiusCard: () => <div>blast-stub</div>,
}));

import * as toastLib from "@/lib/toast";
import PRDetailPage from "./page";

vi.spyOn(toastLib, "useToast").mockReturnValue({
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
});

// ---- fixtures ------------------------------------------------------------
const patch = (n: string) => `@@ -1,2 +1,3 @@\n context ${n}\n+added ${n}\n tail ${n}`;
const mk = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: patch(path) });
const FILES = [mk("src/core.ts"), mk("src/other.ts")];

const finding = (over: Partial<FindingRecord> = {}): FindingRecord => ({
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Unsafe thing",
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
const REVIEW = {
  id: "r1",
  pr_id: "pr-1",
  agent_id: "a1",
  agent_name: "Security",
  run_id: "run-1",
  kind: "review",
  verdict: "request_changes",
  summary: "Needs work.",
  score: 40,
  model: null,
  created_at: "2026-01-01T00:00:00Z",
  findings: [finding()],
} as unknown as ReviewRecord;

const briefPage = (over: { status?: BriefPage["status"]; explanation?: string } = {}): BriefPage =>
  ({
    status: over.status ?? "generated",
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
      what: "Adds rate limiting.",
      why: "Prevents abuse.",
      risk_level: "high",
      risks: [
        {
          kind: "auth_surface",
          title: "New endpoint",
          explanation: over.explanation ?? "Plain explanation.",
          severity: "high",
          file_refs: [],
        },
      ],
      review_focus: [
        { file: "src/core.ts", line: 2, reason: "Core logic." },
        { file: "src/missing.ts", line: null, reason: "Gone from the diff." },
      ],
    },
  }) as unknown as BriefPage;

function renderPage(): RenderResult {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief, prReview, shell }}>
        <PRDetailPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const scrollIntoView = vi.fn();
let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
  fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in tests"));
  nav.reset("");
  state.pulls = [{ id: "pr-1", number: 7 }];
  state.pr = {
    id: "pr-1",
    number: 7,
    title: "Rate limit",
    body: null,
    author: "ada",
    status: "open",
    head_sha: "sha-head",
    files: FILES,
    files_count: FILES.length,
    commits: [],
  };
  state.reviews = [];
  state.runs = [];
  state.briefPage = briefPage();
});
afterEach(() => {
  cleanup();
  fetchSpy.mockRestore();
});

const tabButton = (name: RegExp) => screen.getByRole("button", { name });

describe("PR detail page: brief navigation", () => {
  it("AC-1/AC-7/AC-11/NFR-5: focus click opens Files changed and scrolls once; absent file stays on Overview; tab return does not re-scroll", () => {
    renderPage();
    expect(nav.get().get("tab")).toBeNull();

    // AC-7: absent file -> stays on Overview, notice shown, nothing scrolled.
    fireEvent.click(screen.getByRole("button", { name: "src/missing.ts" }));
    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();
    expect(nav.get().get("tab")).toBeNull();
    expect(screen.queryByText("Files changed · 2 files")).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();

    // AC-1: present file -> Files changed tab, target card rendered + scrolled.
    fireEvent.click(screen.getByRole("button", { name: "src/core.ts:2" }));
    expect(nav.get().get("tab")).toBe("diff");
    expect(screen.getByText("Files changed · 2 files")).toBeInTheDocument();
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
    expect(screen.getByText("added src/core.ts")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    // AC-11: leave and come back through the header tabs -> no new scroll.
    fireEvent.click(tabButton(/^overview/i));
    expect(nav.get().get("tab")).toBe("overview");
    fireEvent.click(tabButton(/files changed/i));
    expect(screen.getByText("Files changed · 2 files")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    // A fresh brief click (new nonce) scrolls again.
    fireEvent.click(tabButton(/^overview/i));
    fireEvent.click(screen.getByRole("button", { name: "src/core.ts:2" }));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);

    // NFR-5 (no network): navigation never fetched anything.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("AC-28: an earlier_state brief navigates end-to-end through the page", () => {
    state.briefPage = briefPage({ status: "earlier_state" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "src/core.ts:2" }));
    expect(nav.get().get("tab")).toBe("diff");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("NFR-5: script markup in a brief explanation renders as inert text", () => {
    state.briefPage = briefPage({ explanation: "<script>alert(1)</script>" });
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: /New endpoint/ }));
    expect(container.querySelector("script")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });
});

describe("PR detail page: review banner and finding jump", () => {
  beforeEach(() => {
    state.reviews = [REVIEW];
  });

  it("the latest-review banner sits above the brief on Overview", () => {
    renderPage();
    const banner = screen.getByRole("region", { name: brief.banner.regionLabel });
    expect(within(banner).getByText("Request changes")).toBeInTheDocument();
    const what = screen.getByText("Adds rate limiting.");
    expect(banner.compareDocumentPosition(what) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC-28: Findings tab keeps its in-run banner (no Overview region); Files tab finding jump still scrolls to the finding", () => {
    nav.reset("tab=findings");
    renderPage();
    expect(screen.queryByRole("region", { name: brief.banner.regionLabel })).not.toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();

    fireEvent.click(tabButton(/files changed/i));
    scrollIntoView.mockReset();
    fireEvent.click(screen.getByRole("button", { name: shell.diffViewer.goToFinding }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("finding-f1"));
  });
});

describe("PR detail page: SPEC-05 Overview layout", () => {
  const riskRegion = () => screen.getByRole("region", { name: brief.section.risks });
  const focusRegion = () => screen.getByRole("region", { name: brief.section.focus });
  const withRef = () => {
    const page = briefPage() as unknown as { brief: { risks: { file_refs: string[] }[] } };
    page.brief.risks[0]!.file_refs = ["src/core.ts:2"];
    state.briefPage = page;
  };

  it("AC-3/AC-13: Risk areas and Review focus are visible with no click, and focus navigation needs no details toggle", () => {
    renderPage();
    expect(riskRegion()).toBeInTheDocument();
    expect(within(riskRegion()).getByText("New endpoint")).toBeInTheDocument();
    expect(within(focusRegion()).getByRole("button", { name: "src/core.ts:2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show details|hide details/i })).not.toBeInTheDocument();

    fireEvent.click(within(focusRegion()).getByRole("button", { name: "src/core.ts:2" }));
    expect(nav.get().get("tab")).toBe("diff");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("AC-8: expanding a risk then clicking its in-diff ref opens Files changed and scrolls once", () => {
    withRef();
    renderPage();
    const header = within(riskRegion()).getByRole("button", { name: /New endpoint/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(within(riskRegion()).getByRole("button", { name: "src/core.ts:2" }));
    expect(nav.get().get("tab")).toBe("diff");
    expect(screen.getByText("Files changed · 2 files")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("AC-2: banner precedes the brief panel, which precedes Review focus", () => {
    state.reviews = [REVIEW];
    renderPage();
    const banner = screen.getByRole("region", { name: brief.banner.regionLabel });
    const panel = screen.getByText("Adds rate limiting.");
    const focus = focusRegion();
    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(banner, panel)).toBe(true);
    expect(follows(panel, focus)).toBe(true);
    expect(follows(banner, focus)).toBe(true);
  });
});
