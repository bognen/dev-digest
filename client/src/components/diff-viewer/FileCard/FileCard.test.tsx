import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@devdigest/shared";
import shell from "../../../../messages/en/shell.json";
import brief from "../../../../messages/en/brief.json";
import type { DiffFocusApi, DiffFocusTarget } from "../focus";
import { FileCard } from "./FileCard";

const MARKER = brief.navigation.targetMarker;
const NO_DIFF = brief.navigation.noDiff;

// Two hunks: new-side 1..3 and 50..52. Joined without a trailing newline
// (a trailing newline would add an empty ctx row).
const PATCH = [
  "@@ -1,2 +1,3 @@",
  " ctx one",
  "+added two",
  " ctx three",
  "@@ -50,2 +50,3 @@",
  " ctx fifty",
  "+added fifty-one",
  " ctx fifty-two",
].join("\n");

const file = (over: Partial<PrFile> = {}): PrFile => ({
  path: "src/a.ts",
  additions: 1,
  deletions: 0,
  patch: PATCH,
  ...over,
});
// Above AUTO_EXPAND_MAX_LINES (200) -> starts collapsed when uncontrolled.
const bigFile = (over: Partial<PrFile> = {}): PrFile => file({ additions: 300, ...over });

/** Focus api whose claim() is true only the first time a nonce is seen. */
function makeFocus(target: DiffFocusTarget | null, claimed: Set<number> = new Set()): DiffFocusApi {
  return {
    target,
    noDiffLabel: NO_DIFF,
    targetMarkerLabel: MARKER,
    claim: (nonce) => {
      if (claimed.has(nonce)) return false;
      claimed.add(nonce);
      return true;
    },
  };
}

function ui(props: React.ComponentProps<typeof FileCard>): React.ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={{ shell, brief }}>
      <FileCard {...props} />
    </NextIntlClientProvider>
  );
}
function renderCard(props: React.ComponentProps<typeof FileCard>): RenderResult {
  return render(ui(props));
}

const scrollSpy = vi.fn();
const rowOf = (text: string): HTMLElement => screen.getByText(text).closest("[tabindex]") as HTMLElement;
const headerOf = (path: string): HTMLElement => screen.getByText(path).parentElement as HTMLElement;
const scrolledEls = (): Element[] => scrollSpy.mock.contexts as Element[];

let origScroll: typeof Element.prototype.scrollIntoView | undefined;
let origMatchMedia: typeof window.matchMedia | undefined;

beforeEach(() => {
  scrollSpy.mockReset();
  origScroll = Element.prototype.scrollIntoView;
  origMatchMedia = window.matchMedia;
  Element.prototype.scrollIntoView = scrollSpy;
});
afterEach(() => {
  cleanup();
  Element.prototype.scrollIntoView = origScroll as typeof Element.prototype.scrollIntoView;
  window.matchMedia = origMatchMedia as typeof window.matchMedia;
  vi.restoreAllMocks();
});

describe("FileCard focus request", () => {
  it("AC-2/AC-25/AC-27: opens a collapsed card, highlights + marks + scrolls + focuses the in-hunk line", () => {
    const { rerender } = renderCard({ file: bigFile() });
    // collapsed and untouched without a focus request
    expect(screen.queryByText("added two")).not.toBeInTheDocument();

    rerender(ui({ file: bigFile(), focus: makeFocus({ path: "src/a.ts", line: 2, nonce: 1 }) }));

    const line = screen.getByText("added two").closest('[aria-current="location"]') as HTMLElement;
    expect(line).toBeTruthy();
    expect(within(line).getByRole("img", { name: MARKER })).toBeInTheDocument();
    // exactly one highlighted line
    expect(document.querySelectorAll('[aria-current="location"]')).toHaveLength(1);

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrolledEls()[0]).toBe(line);
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    expect(line).toHaveFocus();
  });

  it("AC-27: prefers-reduced-motion scrolls with behavior 'auto'", () => {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
    })) as unknown as typeof window.matchMedia;
    renderCard({ file: file(), focus: makeFocus({ path: "src/a.ts", line: 2, nonce: 1 }) });
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });

  it("AC-3: a null line scrolls to and focuses the file header, with no line highlight", () => {
    renderCard({ file: file(), focus: makeFocus({ path: "src/a.ts", line: null, nonce: 1 }) });
    const header = headerOf("src/a.ts");
    expect(scrolledEls()).toEqual([header]);
    expect(header).toHaveFocus();
    expect(document.querySelector('[aria-current="location"]')).toBeNull();
    expect(screen.queryByRole("img", { name: MARKER })).not.toBeInTheDocument();
  });

  it("AC-4: a line outside every hunk scrolls to the nearest hunk row without a line highlight", () => {
    // 40 is closer to the second hunk (50..52) than the first (1..3)
    renderCard({ file: file(), focus: makeFocus({ path: "src/a.ts", line: 40, nonce: 1 }) });
    const hunk = rowOf("@@ -50,2 +50,3 @@");
    expect(scrolledEls()).toEqual([hunk]);
    expect(hunk).toHaveFocus();
    expect(document.querySelector('[aria-current="location"]')).toBeNull();
    expect(screen.queryByRole("img", { name: MARKER })).not.toBeInTheDocument();
  });

  it("AC-8/EC-3: a file with no patch shows the no-diff status and focuses the header", () => {
    renderCard({ file: file({ patch: null }), focus: makeFocus({ path: "src/a.ts", line: 5, nonce: 1 }) });
    expect(screen.getByRole("status")).toHaveTextContent(NO_DIFF);
    expect(screen.queryByText(shell.diffViewer.noDiffText)).not.toBeInTheDocument();
    const header = headerOf("src/a.ts");
    expect(scrolledEls()).toEqual([header]);
    expect(header).toHaveFocus();
  });

  it("AC-10/AC-11: the nonce is claimed once; a new nonce for the same line scrolls again", () => {
    const claimed = new Set<number>();
    const target = { path: "src/a.ts", line: 2, nonce: 1 };
    const { rerender } = renderCard({ file: file(), focus: makeFocus(target, claimed) });
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    // same nonce, fresh api object -> no second scroll
    rerender(ui({ file: file(), focus: makeFocus({ ...target }, claimed) }));
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    // new nonce, same path/line -> scrolls again, still exactly one highlight
    rerender(ui({ file: file(), focus: makeFocus({ ...target, nonce: 2 }, claimed) }));
    expect(scrollSpy).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
  });

  it("a request for another path leaves the card untouched", () => {
    renderCard({ file: bigFile(), focus: makeFocus({ path: "src/other.ts", line: 2, nonce: 1 }) });
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("added two")).not.toBeInTheDocument();
  });

  it("NFR-2: header and hunk show the focus outline once focused", () => {
    const { unmount } = renderCard({ file: file(), focus: makeFocus({ path: "src/a.ts", line: null, nonce: 1 }) });
    expect(headerOf("src/a.ts").style.outline).toContain("2px solid");
    unmount();

    renderCard({ file: file(), focus: makeFocus({ path: "src/a.ts", line: 40, nonce: 1 }) });
    expect(rowOf("@@ -50,2 +50,3 @@").style.outline).toContain("2px solid");
  });

  it("without a focus request the default rendering is unchanged (no tabindex, marker or aria-current)", () => {
    renderCard({ file: file() });
    expect(headerOf("src/a.ts")).not.toHaveAttribute("tabindex");
    expect(document.querySelector("[tabindex]")).toBeNull();
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("NFR-3: edge targets (NaN, negative, huge, deleted-file, binary) never log errors or throw", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const deleted = ["@@ -1,2 +0,0 @@", "-gone one", "-gone two"].join("\n");
    const cases: Array<[PrFile, number | null]> = [
      [file(), Number.NaN],
      [file(), -5],
      [file(), 1_000_000],
      [file(), 2.5],
      [file({ patch: deleted }), 1],
      [file({ patch: null }), null],
    ];
    cases.forEach(([f, line], i) => {
      const { unmount } = renderCard({ file: f, focus: makeFocus({ path: "src/a.ts", line, nonce: i + 1 }) });
      expect(document.querySelector('[aria-current="location"]')).toBeNull();
      unmount();
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
