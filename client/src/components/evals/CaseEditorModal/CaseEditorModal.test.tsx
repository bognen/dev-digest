import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { bodyOf, calledWith, evalCase, mockFetch, renderWithProviders, run } from "../_test/harness";
import { CaseEditorModal } from "./CaseEditorModal";

/** SPEC-06 case editor: AC-43, AC-44 (client check), AC-45 (server error), AC-48, NFR-4. */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DIFF = "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,2 +10,3 @@\n port: 3000,\n+  stripeKey: \"sk_live_x\",\n };";

function open(existing = null as ReturnType<typeof evalCase> | null) {
  const onClose = vi.fn();
  renderWithProviders(
    <CaseEditorModal ownerKind="agent" ownerId="a1" ownerName="Security Reviewer" existing={existing} onClose={onClose} />,
  );
  return onClose;
}

const textbox = (placeholder: string) => screen.getByPlaceholderText(placeholder) as HTMLInputElement;
/** The Diff tab's only textarea (its multi-line placeholder defeats placeholder queries). */
const diffBox = () => document.querySelector("textarea") as HTMLTextAreaElement;

describe("CaseEditorModal", () => {
  it("renders name, Diff/Files/PR meta tabs, preview and expectations (AC-43)", () => {
    mockFetch({});
    open(evalCase());
    expect(screen.getByText("Eval case · stripe-key-leak")).toBeInTheDocument();
    for (const tab of ["Diff", "Files", "PR meta"]) expect(screen.getByText(tab)).toBeInTheDocument();
    expect(screen.getByDisplayValue("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByDisplayValue("src/config.ts")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("12")).toHaveLength(2); // start + end line
  });

  it("previews the pasted diff and renders injected markup as text (NFR-4)", () => {
    mockFetch({});
    open();
    expect(screen.getByText("Paste a unified diff to preview it.")).toBeInTheDocument();
    const evil = "--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n+<script>alert(1)</script>";
    fireEvent.change(diffBox(), {
      target: { value: evil },
    });
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getAllByText(/<script>alert\(1\)<\/script>/).length).toBeGreaterThan(0);
  });

  it("adds files on the Files tab", () => {
    mockFetch({});
    open();
    fireEvent.click(screen.getByText("Files"));
    fireEvent.click(screen.getByRole("button", { name: "Add file" }));
    expect(screen.getByPlaceholderText("Path")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove file 1" })).toBeInTheDocument();
  });

  it("blocks saving without a diff hunk (AC-44)", () => {
    const fetch = mockFetch({});
    open();
    fireEvent.change(textbox("stripe-key-leak"), { target: { value: "my-case" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Diff must contain at least one file hunk");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the server's validation message (AC-45)", async () => {
    mockFetch({
      "POST /eval/cases": {
        status: 422,
        body: { error: { code: "validation_error", message: 'Expectation 1: file "src/nope.ts" is not in the diff' } },
      },
    });
    open();
    fireEvent.change(textbox("stripe-key-leak"), { target: { value: "x" } });
    fireEvent.change(diffBox(), {
      target: { value: DIFF },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("is not in the diff");
  });

  it("saves, then runs the case when Run on save is on (AC-48)", async () => {
    const saved = evalCase({ id: "new1", name: "x" });
    const fetch = mockFetch({
      "POST /eval/cases": saved,
      "POST /eval/cases/new1/run": { status: 202, body: run({ id: "rc", scope: "case", status: "running" }) },
      "GET /eval/runs/rc": { ...run({ id: "rc", scope: "case", status: "running" }), results: [] },
    });
    open();
    fireEvent.change(textbox("stripe-key-leak"), { target: { value: "x" } });
    fireEvent.change(diffBox(), {
      target: { value: DIFF },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add expectation" }));
    expect(screen.getByDisplayValue("src/config.ts")).toBeInTheDocument(); // pre-filled from the diff
    const lineInputs = screen.getAllByText(/^(Start|End) line$/).map((l) => l.closest("label")!.querySelector("input")!);
    fireEvent.change(lineInputs[0]!, { target: { value: "11" } });
    fireEvent.change(lineInputs[1]!, { target: { value: "11" } });
    fireEvent.click(screen.getByRole("switch", { name: "Run on save" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calledWith(fetch, "POST", "/eval/cases/new1/run")).toBe(true));
    expect(bodyOf(fetch, "POST", "/eval/cases")).toMatchObject({
      owner_kind: "agent",
      owner_id: "a1",
      name: "x",
      expectations: [{ type: "must_find", file: "src/config.ts", start_line: 11, end_line: 11 }],
    });
  });
});
