import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { BriefBody } from "./BriefBody";

/** SPEC-04 client cases: AC-4/5 (summary vs legacy), AC-12/13 (missing inputs), EC-1, EC-8, NFR-4b. */

afterEach(cleanup);

function sentinelize(node: unknown, path: string[] = []): unknown {
  if (typeof node === "string") return `@@${path.join(".")}@@`;
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, sentinelize(v, [...path, k])]));
  }
  return node;
}

const BASE: PrBrief = {
  what: "Legacy what text.",
  why: "Legacy why text.",
  risk_level: "low",
  risks: [],
  review_focus: [],
};

function renderBody(brief: Partial<PrBrief>, msgs: unknown = messages): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: msgs as typeof messages }}>
      <BriefBody brief={{ ...BASE, ...brief }} />
    </NextIntlClientProvider>,
  );
}

describe("BriefBody", () => {
  it("AC-4/AC-5/EC-1: summary replaces what/why; absent or blank summary falls back to what/why", () => {
    const first = renderBody({ summary: "Short summary." });
    expect(screen.getByTestId("brief-summary")).toHaveTextContent("Short summary.");
    expect(screen.queryByText("Legacy what text.")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy why text.")).not.toBeInTheDocument();
    first.unmount();

    for (const summary of [undefined, "   "]) {
      const r = renderBody({ summary });
      expect(screen.queryByTestId("brief-summary")).toBeNull();
      expect(screen.getByText("Legacy what text.")).toBeInTheDocument();
      expect(screen.getByText("Legacy why text.")).toBeInTheDocument();
      r.unmount();
    }
  });

  it("AC-12/EC-8: all four missing inputs are named from the catalogue, without role=status", () => {
    const all = ["intent", "blast_radius", "linked_issue", "specs"] as const;
    const first = renderBody({ missing_inputs: [...all] });
    const note = screen.getByTestId("brief-missing-inputs");
    for (const label of Object.values(messages.missingInputs.input)) {
      expect(note).toHaveTextContent(label);
    }
    expect(note).not.toHaveAttribute("role");
    expect(screen.queryByRole("status")).toBeNull();
    first.unmount();

    renderBody({ missing_inputs: [...all] }, sentinelize(messages));
    const sent = screen.getByTestId("brief-missing-inputs");
    expect(sent).toHaveTextContent("@@missingInputs.statement@@");
  });

  it("AC-12: sentinel catalogue resolves each input label key", () => {
    // The statement template is a sentinel, so assert on a template-preserving catalogue instead.
    const msgs = {
      ...messages,
      missingInputs: {
        statement: "{inputs}",
        input: sentinelize(messages.missingInputs.input),
      },
    };
    renderBody({ missing_inputs: ["intent", "blast_radius", "linked_issue", "specs"] }, msgs);
    const note = screen.getByTestId("brief-missing-inputs");
    for (const k of ["intent", "blast_radius", "linked_issue", "specs"]) {
      expect(note).toHaveTextContent(`@@${k}@@`);
    }
  });

  it("AC-13: empty or undefined missing_inputs renders no statement", () => {
    const first = renderBody({ missing_inputs: [] });
    expect(screen.queryByTestId("brief-missing-inputs")).toBeNull();
    first.unmount();
    renderBody({ missing_inputs: undefined });
    expect(screen.queryByTestId("brief-missing-inputs")).toBeNull();
  });

  it("NFR-4b: markup in summary and what/why renders as literal text", () => {
    const IMG = "<img src=x onerror=alert(1)>";
    const SCRIPT = "<script>window.__pwn=1</script>";
    const first = renderBody({ summary: `sum ${IMG} ${SCRIPT}` });
    expect(screen.getByTestId("brief-summary")).toHaveTextContent(`sum ${IMG} ${SCRIPT}`);
    expect(first.container.querySelector("img, script")).toBeNull();
    first.unmount();

    const second = renderBody({ what: `what ${IMG}`, why: `why ${SCRIPT}` });
    expect(screen.getByText(`what ${IMG}`)).toBeInTheDocument();
    expect(screen.getByText(`why ${SCRIPT}`)).toBeInTheDocument();
    expect(second.container.querySelector("img, script")).toBeNull();
  });
});
