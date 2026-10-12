import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectDocList } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import contextMessages from "../../../../../../../messages/en/context.json";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "repo-1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo-1", activeRepo: { full_name: "acme/app" } }),
  useRepoNotFound: () => false,
}));

// Mock at the hook boundary.
type ListState = { data?: ProjectDocList; isLoading: boolean; isError: boolean; error?: Error; refetch: () => void };
let listState: ListState;
const refetch = vi.fn();
const refreshMutate = vi.fn();
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: () => listState,
  useRefreshProjectDocs: () => ({ mutate: refreshMutate, isPending: false, isError: false, error: null }),
  useProjectDoc: (_repoId: string, path: string) => ({
    data: { path, root: "specs", content: `# Heading of ${path}`, tokens: 120 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(() => {
  cleanup();
  refetch.mockReset();
  refreshMutate.mockReset();
});

const LIST: ProjectDocList = {
  repo_id: "repo-1",
  roots: ["specs", "docs", "insights"],
  docs: [
    { path: "specs/a.md", root: "specs", size_bytes: 10, tokens: 120, too_large: false, used_by_agents: 3 },
    { path: "docs/guide/a.md", root: "docs", size_bytes: 10, tokens: 40, too_large: false, used_by_agents: 1 },
    { path: "docs/huge.md", root: "docs", size_bytes: 9e6, tokens: null, too_large: true, used_by_agents: 0 },
  ],
};

function renderView(): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("AC-1/AC-6/AC-26/AC-3: lists docs by full path with root, tokens, usage and 'Too large'; selecting previews as Markdown; no edit controls", () => {
    listState = { data: LIST, isLoading: false, isError: false, refetch };
    renderView();

    const nav = within(screen.getByRole("navigation", { name: "Project documents" }));
    // Same file name in two folders is told apart by full path.
    expect(nav.getByText("specs/a.md")).toBeInTheDocument();
    expect(nav.getByText("docs/guide/a.md")).toBeInTheDocument();
    expect(nav.getByText("≈ 120 tokens")).toBeInTheDocument();
    expect(nav.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(nav.getByText("Used by 1 agent")).toBeInTheDocument();
    expect(nav.getByText("Too large")).toBeInTheDocument();

    expect(screen.getByText("Select a document to preview it.")).toBeInTheDocument();
    fireEvent.click(nav.getByRole("button", { name: /specs\/a\.md/ }));
    expect(screen.getByRole("heading", { name: "Heading of specs/a.md" })).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveTextContent("Preview");

    // View only: no editor, upload or new-folder affordances.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /edit|upload|new folder/i })).toBeNull();
  });

  it("AC-5: Refresh triggers a checkout sync for the repo", () => {
    listState = { data: LIST, isLoading: false, isError: false, refetch };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refreshMutate).toHaveBeenCalledWith("repo-1");
  });

  it("AC-7: empty state names specs/, docs/ and insights/", () => {
    listState = { data: { ...LIST, docs: [] }, isLoading: false, isError: false, refetch };
    renderView();
    expect(screen.getByText("No project documents found")).toBeInTheDocument();
    const body = screen.getByText(/Add Markdown/);
    expect(body).toHaveTextContent("specs/");
    expect(body).toHaveTextContent("docs/");
    expect(body).toHaveTextContent("insights/");
  });

  it("AC-8: checkout_unavailable shows the reason with a Retry that refetches", () => {
    listState = {
      isLoading: false,
      isError: true,
      error: new ApiError("Checkout is missing on disk", 409, "checkout_unavailable"),
      refetch,
    };
    renderView();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Repository checkout unavailable");
    expect(alert).toHaveTextContent("Checkout is missing on disk");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("loading state is announced and shows no empty/error content", () => {
    listState = { isLoading: true, isError: false, refetch };
    renderView();
    expect(screen.getByRole("status", { name: "Loading documents" })).toBeInTheDocument();
    expect(screen.queryByText("No project documents found")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
