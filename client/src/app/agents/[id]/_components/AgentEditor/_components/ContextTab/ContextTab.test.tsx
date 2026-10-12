import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentContextState, ProjectDocList } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import runsMessages from "../../../../../../../../messages/en/runs.json";
import contextMessages from "../../../../../../../../messages/en/context.json";

const REPO = "repo-1";
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo-1", activeRepo: { full_name: "acme/app" }, reposLoaded: true }),
}));

import { ContextTab } from "./ContextTab";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function doc(path: string, tokens: number | null, extra: Partial<ProjectDocList["docs"][number]> = {}) {
  return {
    path,
    root: path.split("/")[0] as "specs" | "docs" | "insights",
    size_bytes: 100,
    tokens,
    too_large: false,
    used_by_agents: 0,
    ...extra,
  };
}

const LIST: ProjectDocList = {
  repo_id: REPO,
  roots: ["specs", "docs", "insights"],
  docs: [
    doc("specs/a.md", 100),
    doc("specs/b.md", 200),
    doc("docs/c.md", 50),
    doc("docs/d.md", 10),
    doc("docs/huge.md", null, { too_large: true }),
    doc("insights/e.md", 5),
    doc("insights/f.md", 40),
  ],
};

const STATE: AgentContextState = {
  repo_id: REPO,
  discovered_count: 7,
  attached: [
    { path: "specs/a.md", root: "specs", tokens: 100, state: "ok" },
    { path: "specs/b.md", root: "specs", tokens: 200, state: "ok" },
  ],
  inherited: [{ path: "insights/f.md", tokens: 40, skill_id: "s1", skill_name: "secret-gate", duplicate: false }],
  total_tokens: 360,
  budget_tokens: 8000,
  dropped: [],
  overhead: { heading_tokens: 10, separator_tokens: 5 },
};

let state: AgentContextState;
let listFail = false;
const puts: { repo_id: string; paths: string[] }[] = [];
let putResolve: ((s: AgentContextState) => void) | null = null;

function json(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status }));
}

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  if (init?.method === "PUT" && path === "/agents/ag1/context") {
    puts.push(JSON.parse(String(init.body)));
    return new Promise<Response>((resolve) => {
      putResolve = (s) => resolve(new Response(JSON.stringify(s), { status: 200 }));
    });
  }
  if (path === `/repos/${REPO}/context`) {
    return listFail ? json({ error: { message: "boom" } }, 500) : json(LIST);
  }
  if (path.startsWith(`/repos/${REPO}/context/file`)) {
    return json({ path: "specs/a.md", root: "specs", content: "# Spec A heading", tokens: 100 });
  }
  if (path.startsWith("/agents/ag1/context")) return json(state);
  return json({ error: { message: "not found" } }, 404);
});

beforeEach(() => {
  state = STATE;
  listFail = false;
  puts.length = 0;
  putResolve = null;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTab(): RenderResult {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <NextIntlClientProvider
        locale="en"
        messages={{ agents: agentsMessages, skills: skillsMessages, runs: runsMessages, context: contextMessages }}
      >
        <ContextTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const region = (name: string) => screen.getByRole("region", { name });

describe("ContextTab", () => {
  it("AC-13/AC-26/AC-20: shows 'N of M attached', token counts, inherited via-skill rows without a checkbox, and filters by name", async () => {
    renderTab();
    expect(await screen.findByText("2 of 7 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 360 tokens")).toBeInTheDocument(); // exact server total, includes inherited

    const attached = within(region("Attached"));
    expect(attached.getByText("≈ 100 tokens")).toBeInTheDocument();
    expect(attached.getByText("≈ 200 tokens")).toBeInTheDocument();

    const inherited = within(region("Inherited via skills"));
    expect(inherited.getByText("via secret-gate")).toBeInTheDocument();
    expect(inherited.queryByRole("checkbox")).toBeNull();

    // Too-large available doc is inert and labelled in words.
    const available = within(region("Available"));
    expect(available.getByText("Too large")).toBeInTheDocument();
    expect(available.queryByRole("checkbox", { name: /huge\.md/ })).toBeNull();

    fireEvent.change(screen.getByLabelText("Filter documents…"), { target: { value: "specs/b" } });
    expect(within(region("Attached")).getByText("b.md")).toBeInTheDocument();
    expect(screen.queryByText("a.md")).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter documents…"), { target: { value: "zzz" } });
    expect(screen.getByText(/No documents match/)).toBeInTheDocument();
  });

  it("AC-23/AC-25: toggling saves immediately with an instant estimate, then shows the exact server total", async () => {
    renderTab();
    await screen.findByText("2 of 7 attached");
    fireEvent.click(within(region("Available")).getByRole("checkbox", { name: /c\.md/ }));

    // a100 + b200 + c50 + inherited f40 = 390, + heading 10 + 3 separators x 5 = 415.
    expect(await screen.findByText("≈ 415 tokens (updating…)")).toBeInTheDocument();
    await waitFor(() => expect(puts).toEqual([{ repo_id: REPO, paths: ["specs/a.md", "specs/b.md", "docs/c.md"] }]));

    putResolve!({
      ...STATE,
      attached: [...STATE.attached, { path: "docs/c.md", root: "docs", tokens: 50, state: "ok" }],
      total_tokens: 420,
    });
    expect(await screen.findByText("≈ 420 tokens")).toBeInTheDocument();
    expect(screen.queryByText(/updating/)).toBeNull();
    expect(screen.getByText("3 of 7 attached")).toBeInTheDocument();
  });

  it("AC-14: Preview opens the document without changing attachments", async () => {
    renderTab();
    await screen.findByText("2 of 7 attached");
    fireEvent.click(within(region("Available")).getByRole("button", { name: "Preview docs/d.md" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("heading", { name: "Spec A heading" })).toBeInTheDocument();
    expect(puts).toEqual([]);
    expect(screen.getByText("2 of 7 attached")).toBeInTheDocument();
  });

  it("NFR-7: handles and checkboxes carry the document name; problem states are text labels", async () => {
    state = {
      ...STATE,
      attached: [...STATE.attached, { path: "docs/gone.md", root: "docs", tokens: null, state: "missing" }],
      dropped: [{ path: "specs/b.md", reason: "over_budget" }],
    };
    renderTab();
    await screen.findByText("3 of 7 attached");
    const attached = within(region("Attached"));
    expect(attached.getByRole("button", { name: "Drag to reorder specs/a.md" })).toBeInTheDocument();
    expect(attached.getByRole("checkbox", { name: /a\.md/ })).toHaveAttribute("aria-checked", "true");
    expect(attached.getByText("Missing from the checkout")).toBeInTheDocument();
    expect(attached.getByText("Not injected: over the token budget")).toBeInTheDocument();
  });

  it("NFR-7: dragging is disabled while a filter is active (hint in the handle title)", async () => {
    renderTab();
    await screen.findByText("2 of 7 attached");
    expect(screen.getByRole("button", { name: "Drag to reorder specs/a.md" })).not.toHaveAttribute("title");
    fireEvent.change(screen.getByLabelText("Filter documents…"), { target: { value: "specs" } });
    expect(screen.getByRole("button", { name: "Drag to reorder specs/a.md" })).toHaveAttribute(
      "title",
      "Clear the filter to reorder",
    );
  });

  it("NFR-7: the drag handle is a keyboard-focusable sortable activator (jsdom has no layout, so the move itself is not simulated)", async () => {
    renderTab();
    await screen.findByText("2 of 7 attached");
    const handle = screen.getByRole("button", { name: "Drag to reorder specs/a.md" });
    handle.focus();
    expect(handle).toHaveFocus();
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");
    // Opening a keyboard drag (Space) without moving must not save anything.
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    expect(puts).toEqual([]);
  });

  it("AC-8: a load failure shows an error state with retry", async () => {
    listFail = true;
    renderTab();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load project context");
    listFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("2 of 7 attached")).toBeInTheDocument();
  });
});
