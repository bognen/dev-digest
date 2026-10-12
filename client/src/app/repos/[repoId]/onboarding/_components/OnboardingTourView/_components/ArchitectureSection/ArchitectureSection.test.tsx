import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { TourArchitecture } from "@devdigest/shared";
import onboardingMessages from "../../../../../../../../../messages/en/onboarding.json";

// AC-19: an unparseable diagram must not break the page.
const parse = vi.fn().mockResolvedValue(false);
const render_ = vi.fn();
vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), parse: (...a: unknown[]) => parse(...a), render: (...a: unknown[]) => render_(...a) },
}));

import { ArchitectureSection } from "./ArchitectureSection";

afterEach(cleanup);
beforeEach(() => {
  parse.mockClear();
  render_.mockClear();
});

const SECTION: TourArchitecture = {
  state: "ok",
  reason: null,
  stack: [{ name: "Fastify", evidence: "package.json" }],
  structure: [{ path: "src/modules", files: 1 }, { path: "test", files: 4 }],
  routes: ["GET /payments"],
  summary_markdown: "The core is [the app](src/app.ts) and [evil](javascript:alert(1)) <script>alert(1)</script>",
  diagram: "flowchart TD\n  A --> B",
};

const hrefPolicy = (href: string): string | null =>
  href === "src/app.ts" ? "https://github.com/acme/api/blob/abc1234/src/app.ts" : null;

function renderSection(section: TourArchitecture): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages }}>
      <ArchitectureSection section={section} transformHref={hrefPolicy} />
    </NextIntlClientProvider>,
  );
}

describe("ArchitectureSection", () => {
  it("AC-35/AC-19/AC-28: a generated section shows only prose + diagram; links follow the allowlist, markup stays inert, an invalid diagram renders nothing", async () => {
    const { container } = renderSection(SECTION);

    // Design: generated overview = summary + diagram only, no deterministic lists.
    expect(screen.queryByText("Stack")).toBeNull();
    expect(screen.queryByText("Structure")).toBeNull();
    expect(screen.queryByText("Routes")).toBeNull();
    expect(screen.queryByText("Fastify")).toBeNull();
    expect(screen.queryByText("src/modules")).toBeNull();
    expect(screen.queryByText("GET /payments")).toBeNull();

    // Allowlisted path -> GitHub link at the stored commit (new tab, noopener).
    const ok = screen.getByRole("link", { name: "the app" });
    expect(ok).toHaveAttribute("href", "https://github.com/acme/api/blob/abc1234/src/app.ts");
    expect(ok).toHaveAttribute("target", "_blank");
    expect(ok.getAttribute("rel")).toContain("noopener");

    // javascript: is plain text, not a link; raw <script> is never injected.
    expect(screen.queryByRole("link", { name: "evil" })).toBeNull();
    expect(screen.getByText("evil")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();

    // Diagram rejected by mermaid.parse: no diagram, prose still there, nothing thrown.
    await waitFor(() => expect(parse).toHaveBeenCalled());
    expect(render_).not.toHaveBeenCalled();
    expect(screen.getByText(/The core is/)).toBeInTheDocument();
  });

  it("AC-25: the skeleton (ok facts, no narrative) shows the deterministic Stack / Structure / Routes lists", () => {
    renderSection({ ...SECTION, summary_markdown: null, diagram: null });
    expect(screen.getByText("Stack")).toBeInTheDocument();
    expect(screen.getByText("Structure")).toBeInTheDocument();
    expect(screen.getByText("Routes")).toBeInTheDocument();
    expect(screen.getByText("Fastify")).toBeInTheDocument();
    expect(screen.getByText("src/modules")).toBeInTheDocument();
    expect(screen.getByText("1 file")).toBeInTheDocument();
    expect(screen.getByText("4 files")).toBeInTheDocument();
    expect(screen.getByText("GET /payments")).toBeInTheDocument();
  });

  it("AC-25: the server skeleton (requires_generation, no narrative/diagram) shows the note plus Stack / Structure (file counts) / Routes, and no diagram", () => {
    renderSection({ ...SECTION, state: "requires_generation", summary_markdown: null, diagram: null });
    expect(screen.getByText("Requires generation")).toBeInTheDocument();
    expect(screen.getByText("Stack")).toBeInTheDocument();
    expect(screen.getByText("Structure")).toBeInTheDocument();
    expect(screen.getByText("Routes")).toBeInTheDocument();
    expect(screen.getByText("Fastify")).toBeInTheDocument();
    expect(screen.getByText("src/modules")).toBeInTheDocument();
    expect(screen.getByText("1 file")).toBeInTheDocument();
    expect(screen.getByText("4 files")).toBeInTheDocument();
    expect(screen.getByText("GET /payments")).toBeInTheDocument();
    expect(parse).not.toHaveBeenCalled();
    expect(render_).not.toHaveBeenCalled();
  });

  it("AC-24: not_available with populated facts shows only the reason, no lists", () => {
    renderSection({ ...SECTION, state: "not_available", reason: "no import graph", summary_markdown: null, diagram: null });
    expect(screen.getByText("Not available: no import graph")).toBeInTheDocument();
    expect(screen.queryByText("Stack")).toBeNull();
    expect(screen.queryByText("GET /payments")).toBeNull();
  });

  it("AC-24: a section that is not available shows the reason instead of content", () => {
    renderSection({ ...SECTION, state: "not_available", reason: "no import graph for this language", summary_markdown: null, diagram: null });
    expect(screen.getByText("Not available: no import graph for this language")).toBeInTheDocument();
    expect(screen.queryByText("Fastify")).toBeNull();
  });
});
