import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../../messages/en/context.json";

// Mock at the hook boundary: the component only reads useProjectDoc.
type DocState = {
  data?: { path: string; root: "specs" | "docs" | "insights"; content: string; tokens: number };
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  refetch: () => void;
};
let docState: DocState;
const refetch = vi.fn();
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDoc: () => docState,
}));

import { DocPreview } from "./DocPreview";

afterEach(() => {
  cleanup();
  refetch.mockReset();
});

function setContent(content: string) {
  docState = {
    data: { path: "specs/a.md", root: "specs", content, tokens: 42 },
    isLoading: false,
    isError: false,
    refetch,
  };
}

function renderPreview(): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <DocPreview repoId="repo-1" path="specs/a.md" />
    </NextIntlClientProvider>,
  );
}

describe("DocPreview", () => {
  it("AC-3: renders headings, lists, code and tables as Markdown, with path, root, mode and tokens", () => {
    setContent(
      ["# Title", "", "## Sub", "", "- one", "- two", "", "Use `npm test` now.", "", "| h1 | h2 |", "| -- | -- |", "| c1 | c2 |"].join(
        "\n",
      ),
    );
    renderPreview();
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Sub" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("npm test").tagName).toBe("CODE");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "h1" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "c2" })).toBeInTheDocument();

    const article = screen.getByRole("article", { name: "Preview of specs/a.md" });
    expect(article).toHaveTextContent("specs/a.md");
    expect(article).toHaveTextContent("Preview");
    expect(article).toHaveTextContent("≈ 42 tokens");
  });

  it("AC-4/NFR-4c: raw HTML stays inert and javascript: links are stripped", () => {
    setContent(
      [
        "<script>window.__pwned = 1</script>",
        "",
        '<img src="x" onerror="window.__pwned = 2">',
        "",
        "[bad](javascript:alert(1)) and [good](https://example.com)",
      ].join("\n"),
    );
    renderPreview();
    const article = screen.getByRole("article");
    expect(article.querySelector("script")).toBeNull();
    expect(article.querySelector("img")).toBeNull();
    expect(article.querySelector("[onerror]")).toBeNull();
    const hrefs = Array.from(article.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.toLowerCase().startsWith("javascript:"))).toBe(false);
    expect(hrefs).toContain("https://example.com");
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("AC-8: shows a loading status, then an error state whose Retry refetches", () => {
    docState = { isLoading: true, isError: false, refetch };
    const { rerender } = renderPreview();
    expect(screen.getByRole("status", { name: "Loading document" })).toBeInTheDocument();

    docState = { isLoading: false, isError: true, error: new Error("File is too large"), refetch };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
        <DocPreview repoId="repo-1" path="specs/a.md" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load this document");
    expect(screen.getByRole("alert")).toHaveTextContent("File is too large");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
