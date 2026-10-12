import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTourState, OnboardingTourProvenance, OnboardingTour } from "@devdigest/shared";
import onboardingMessages from "../../../../../../../messages/en/onboarding.json";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "repo-1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo-1", activeRepo: { full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/components/mermaid-diagram", () => ({ MermaidDiagram: () => null }));

// Mock at the hook boundary.
type QueryState = { data?: OnboardingTourState; isLoading: boolean; isError: boolean; refetch: () => void };
let query: QueryState;
const refetch = vi.fn();
const generateMutate = vi.fn();
vi.mock("@/lib/hooks/onboarding-tour", () => ({
  useOnboardingTour: () => query,
  useGenerateOnboardingTour: () => ({ mutate: generateMutate, isPending: false, isError: false, error: null }),
}));

import { OnboardingTourView } from "./OnboardingTourView";

const scrollIntoView = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
  cleanup();
  refetch.mockReset();
  generateMutate.mockReset();
  scrollIntoView.mockReset();
  writeText.mockClear();
});

const TWO_HOURS_AGO = new Date(Date.now() - 2 * 3600_000).toISOString();

const TOUR: OnboardingTour = {
  architecture: {
    state: "ok",
    reason: null,
    stack: [{ name: "TypeScript", evidence: "tsconfig.json" }],
    structure: [{ path: "src", files: 12 }],
    routes: ["GET /payments"],
    summary_markdown: "Payments service overview.",
    diagram: null,
  },
  critical_paths: {
    state: "ok",
    reason: null,
    items: [{ path: "src/index.ts", importers: 7, role: "Entry point", role_source: "llm" }],
  },
  run_locally: {
    state: "ok",
    reason: null,
    steps: [{ kind: "install", command: "pnpm install", source: "package.json" }],
  },
  reading_path: {
    state: "ok",
    reason: null,
    items: [{ position: 1, path: "src/app.ts", reason: "Start here", score: 0.9 }],
    hotness: { applied: true, window_days: 90, note: null },
  },
  first_tasks: {
    state: "ok",
    reason: null,
    items: [{ title: "Add a health check", rationale: "Small and safe.", files: ["src/app.ts"] }],
  },
  basis: { files_indexed: 12, files_considered: 12 },
  link_paths: ["src/index.ts", "src/app.ts"],
};

const PROV: OnboardingTourProvenance = {
  status: "generated",
  skeleton_reason: null,
  skeleton_detail: null,
  generated_at: TWO_HOURS_AGO,
  indexed_sha: "abc1234567890",
  index_status: "ready",
  provider: "anthropic",
  model: "claude-test",
  files_indexed: 12,
  files_considered: 12,
  tokens_in: 4000,
  tokens_out: 1000,
  cost_usd: 0.0123,
};

function state(over: Partial<OnboardingTourState> = {}): OnboardingTourState {
  return {
    status: "generated",
    repo: { id: "repo-1", full_name: "acme/payments-api" },
    tour: TOUR,
    provenance: PROV,
    current_index_sha: "abc1234567890",
    last_failure: null,
    ...over,
  };
}

function setData(over: Partial<OnboardingTourState> = {}): void {
  query = { data: state(over), isLoading: false, isError: false, refetch };
}

function renderView(): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages }}>
      <OnboardingTourView />
    </NextIntlClientProvider>,
  );
}

describe("OnboardingTourView", () => {
  it("AC-27/AC-28/AC-29/AC-31/AC-37/NFR-6: header, five ordered collapsible cards, nav, Open link, notice, footer", () => {
    setData();
    renderView();

    expect(screen.getByRole("heading", { level: 1, name: /Onboarding for acme\/payments-api/ })).toBeInTheDocument();
    expect(screen.getByText("Generated from index of 12 files · last refreshed 2h ago")).toBeInTheDocument();

    // Five sections, fixed order, collapsible cards.
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim())).toEqual([
      expect.stringContaining("Architecture overview"),
      expect.stringContaining("Critical paths"),
      expect.stringContaining("How to run locally"),
      expect.stringContaining("Guided reading path"),
      expect.stringContaining("First tasks"),
    ]);
    const toggle = screen.getByRole("button", { name: /Critical paths/ });
    // Native <button>: operable with Enter/Space; exposes expanded state (NFR-6a).
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    // "On this page" nav scrolls to and marks the chosen section.
    const nav = within(screen.getByRole("navigation", { name: "On this page" }));
    expect(nav.getAllByRole("link")).toHaveLength(5);
    fireEvent.click(nav.getByRole("link", { name: "How to run locally" }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(nav.getByRole("link", { name: "How to run locally" })).toHaveAttribute("aria-current", "true");
    expect(nav.getByRole("link", { name: "Architecture overview" })).not.toHaveAttribute("aria-current");

    // Open links to GitHub at the stored commit, new tab, noopener; accessible name has the path.
    const open = screen.getByRole("link", { name: /Open src\/index\.ts on GitHub/ });
    expect(open).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/abc1234567890/src/index.ts");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open.getAttribute("rel")).toContain("noopener");

    // Commands notice is present whenever commands are shown.
    expect(screen.getByText(/These commands come from the repository\. Review them before running/)).toBeInTheDocument();

    // Optional footer.
    expect(screen.getByText(/Model claude-test/)).toBeInTheDocument();
    expect(screen.getByText(/5k tokens/)).toBeInTheDocument();
    expect(screen.getByText(/Cost \$0\.0123/)).toBeInTheDocument();
  });

  it("AC-30/NFR-6b: copy button name includes the command and copies exactly it", async () => {
    setData();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Copy command: pnpm install" }));
    expect(writeText).toHaveBeenCalledWith("pnpm install");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("AC-32: stale note shows both short ids; absent when equal", () => {
    setData({ current_index_sha: "def5678999999" });
    const view = renderView();
    const note = screen.getByText(/may be out of date/);
    expect(note).toHaveTextContent("abc1234");
    expect(note).toHaveTextContent("def5678");
    expect(note.textContent).not.toContain("abc12345");
    view.unmount();

    setData({ current_index_sha: "abc1234567890" });
    renderView();
    expect(screen.queryByText(/may be out of date/)).toBeNull();
  });

  it("AC-26/NFR-6c: status is text -- 'Generated' and each skeleton reason", () => {
    const cases: Array<[OnboardingTourProvenance["skeleton_reason"], string]> = [
      ["index_degraded", "Skeleton — index degraded"],
      ["index_failed", "Skeleton — index failed"],
      ["index_not_built", "Skeleton — index not built"],
      ["llm_unavailable", "Skeleton — LLM unavailable"],
      ["invalid_output", "Skeleton — generation failed"],
    ];
    setData();
    const generated = renderView();
    expect(screen.getByText("Generated")).toBeInTheDocument();
    generated.unmount();

    for (const [reason, text] of cases) {
      setData({
        status: "skeleton",
        provenance: { ...PROV, status: "skeleton", skeleton_reason: reason },
      });
      const v = renderView();
      expect(screen.getByText(text)).toBeInTheDocument();
      v.unmount();
    }

    setData({
      status: "skeleton",
      provenance: { ...PROV, status: "skeleton", skeleton_reason: "llm_unavailable", skeleton_detail: "quota exceeded" },
    });
    renderView();
    expect(screen.getByText(/Skeleton — LLM unavailable: quota exceeded/)).toBeInTheDocument();
  });

  it("AC-24/AC-25: 'Not available: <reason>' and 'Requires generation' section states", () => {
    setData({
      tour: {
        ...TOUR,
        run_locally: { state: "not_available", reason: "no manifest found", steps: [] },
        architecture: { ...TOUR.architecture, state: "requires_generation", summary_markdown: null },
        first_tasks: { state: "requires_generation", reason: null, items: [] },
      },
    });
    renderView();
    expect(screen.getByText("Not available: no manifest found")).toBeInTheDocument();
    expect(screen.getAllByText("Requires generation")).toHaveLength(2);
  });

  it("AC-5: last_failure notice renders next to the kept tour", () => {
    setData({ last_failure: { reason: "LLM timed out", at: TWO_HOURS_AGO } });
    renderView();
    expect(screen.getByText(/Last regeneration failed: LLM timed out/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Architecture overview/ })).toBeInTheDocument();
  });

  it("AC-33/AC-1: loading, error (with retry), empty (CTA, no auto-generate) and generating states are distinct", () => {
    // loading
    query = { isLoading: true, isError: false, refetch };
    const loading = renderView();
    expect(loading.container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    loading.unmount();

    // error + retry
    query = { isLoading: false, isError: true, refetch };
    const err = renderView();
    expect(screen.getByText("Couldn’t load the onboarding tour")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    err.unmount();

    // empty: CTA, nothing generated on open
    setData({ status: "none", tour: null, provenance: null, current_index_sha: null });
    const empty = renderView();
    expect(generateMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing is generated until you ask/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate onboarding tour" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
    empty.unmount();

    // generating, no previous tour: text, and no Generate/Regenerate action
    setData({ status: "generating", tour: null, provenance: null, current_index_sha: null });
    const generating = renderView();
    expect(screen.getByText("Generating onboarding tour…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
    generating.unmount();

    // generating over a previous tour: shown read-only, still no action
    setData({ status: "generating" });
    renderView();
    expect(screen.getByText("Generating onboarding tour…")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Architecture overview/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate|regenerate/i })).toBeNull();
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });
});
