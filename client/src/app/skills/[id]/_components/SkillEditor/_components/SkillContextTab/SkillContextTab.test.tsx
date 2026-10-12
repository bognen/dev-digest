import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProjectDocList, SkillContextState } from "@devdigest/shared";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import runsMessages from "../../../../../../../../messages/en/runs.json";
import contextMessages from "../../../../../../../../messages/en/context.json";

const REPO = "repo-1";
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo-1", activeRepo: { full_name: "acme/app" }, reposLoaded: true }),
}));

import { SkillContextTab } from "./SkillContextTab";

const SERIALIZED = "## Project context\n\n<untrusted source=\"project-doc:specs/a.md\">\nSpec A body\n</untrusted>";

const LIST: ProjectDocList = {
  repo_id: REPO,
  roots: ["specs", "docs"],
  docs: [
    { path: "specs/a.md", root: "specs", size_bytes: 10, tokens: 100, too_large: false, used_by_agents: 0 },
    { path: "docs/b.md", root: "docs", size_bytes: 10, tokens: 60, too_large: false, used_by_agents: 0 },
    { path: "docs/huge.md", root: "docs", size_bytes: 9e6, tokens: null, too_large: true, used_by_agents: 0 },
  ],
};

const STATE: SkillContextState = {
  repo_id: REPO,
  discovered_count: 3,
  attached: [{ path: "specs/a.md", root: "specs", tokens: 100, state: "ok" }],
  total_tokens: 112,
  serialized: SERIALIZED,
  overhead: { heading_tokens: 10, separator_tokens: 5 },
};

const puts: { repo_id: string; paths: string[] }[] = [];

function json(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status }));
}

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  if (init?.method === "PUT" && path === "/skills/sk1/context") {
    const body = JSON.parse(String(init.body)) as { repo_id: string; paths: string[] };
    puts.push(body);
    return json({
      ...STATE,
      attached: [...STATE.attached, { path: "docs/b.md", root: "docs", tokens: 60, state: "ok" }],
      total_tokens: 180,
      serialized: "## Project context\n\nA and B",
    });
  }
  if (path === `/repos/${REPO}/context`) return json(LIST);
  if (path.startsWith(`/repos/${REPO}/context/file`)) {
    return json({ path: "specs/a.md", root: "specs", content: "# Preview heading", tokens: 100 });
  }
  if (path.startsWith("/skills/sk1/context")) return json(STATE);
  return json({ error: { message: "not found" } }, 404);
});

beforeEach(() => {
  puts.length = 0;
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
        messages={{ skills: skillsMessages, agents: agentsMessages, runs: runsMessages, context: contextMessages }}
      >
        <SkillContextTab skillId="sk1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillContextTab", () => {
  it("AC-24/AC-26/AC-19: shows the inheritance note, the total, per-row tokens, and 'Serializes as' verbatim from the server", async () => {
    renderTab();
    expect(await screen.findByText("1 attached")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("≈ 112 tokens attached")).toBeInTheDocument();

    const list = within(screen.getByRole("list", { name: "Project documents" }));
    expect(list.getByText("≈ 100 tokens")).toBeInTheDocument();
    expect(list.getByText("≈ 60 tokens")).toBeInTheDocument();

    const pre = screen.getByLabelText("Serializes as", { selector: "pre" });
    expect(pre.textContent).toBe(SERIALIZED);
    expect(pre.textContent!.startsWith("## Project context")).toBe(true);
  });

  it("AC-15/AC-25: toggling saves immediately with the ordered path list and shows the server's new total and block", async () => {
    renderTab();
    await screen.findByText("1 attached");
    fireEvent.click(screen.getByRole("checkbox", { name: "Attach docs/b.md to this skill" }));
    await waitFor(() => expect(puts).toEqual([{ repo_id: REPO, paths: ["specs/a.md", "docs/b.md"] }]));
    expect(await screen.findByText("≈ 180 tokens attached")).toBeInTheDocument();
    expect(screen.getByText("2 attached")).toBeInTheDocument();
    expect(screen.getByLabelText("Serializes as", { selector: "pre" }).textContent).toBe("## Project context\n\nA and B");
  });

  it("too-large docs cannot be attached and are labelled in words (AC-9 UI, NFR-7)", async () => {
    renderTab();
    await screen.findByText("1 attached");
    expect(screen.getByRole("checkbox", { name: "Attach docs/huge.md to this skill" })).toBeDisabled();
    expect(screen.getByText("Too large")).toBeInTheDocument();
  });

  it("AC-14: Preview toggles the document preview and leaves attachments unchanged; filter narrows rows", async () => {
    renderTab();
    await screen.findByText("1 attached");
    const btn = screen.getByRole("button", { name: "Preview specs/a.md" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(await screen.findByRole("heading", { name: "Preview heading" })).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(puts).toEqual([]);
    expect(screen.getByText("1 attached")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter documents"), { target: { value: "huge" } });
    expect(screen.queryByRole("checkbox", { name: /specs\/a\.md/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: /huge\.md/ })).toBeInTheDocument();
  });

  it("AC-12/NFR-7: only attached rows have a drag handle named after the document", async () => {
    renderTab();
    await screen.findByText("1 attached");
    const list = within(screen.getByRole("list", { name: "Project documents" }));
    expect(list.getByRole("button", { name: "Drag to reorder specs/a.md" })).toBeInTheDocument();
    expect(list.queryByRole("button", { name: /Drag to reorder docs\/b\.md/ })).toBeNull();
    expect(list.queryByRole("button", { name: /Drag to reorder docs\/huge\.md/ })).toBeNull();
    expect(list.getAllByRole("button", { name: /^Drag to reorder / })).toHaveLength(1);
  });

  it("NFR-7: dragging is disabled while a filter is active (hint in the handle title)", async () => {
    renderTab();
    await screen.findByText("1 attached");
    expect(screen.getByRole("button", { name: "Drag to reorder specs/a.md" })).not.toHaveAttribute("title");
    fireEvent.change(screen.getByLabelText("Filter documents"), { target: { value: "specs" } });
    expect(screen.getByRole("button", { name: "Drag to reorder specs/a.md" })).toHaveAttribute(
      "title",
      "Clear the filter to reorder",
    );
  });

  it("NFR-7/AC-12: the drag handle is a keyboard-focusable sortable activator (jsdom has no layout, so the move itself is not simulated)", async () => {
    renderTab();
    await screen.findByText("1 attached");
    const handle = screen.getByRole("button", { name: "Drag to reorder specs/a.md" });
    handle.focus();
    expect(handle).toHaveFocus();
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");
    // Opening a keyboard drag without moving must not save anything.
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    expect(puts).toEqual([]);
  });
});
