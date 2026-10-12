import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { TourRunLocally } from "@devdigest/shared";
import onboardingMessages from "../../../../../../../../../messages/en/onboarding.json";
import { RunLocallySection } from "./RunLocallySection";

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(cleanup);

function renderSection(section: TourRunLocally): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages }}>
      <RunLocallySection section={section} />
    </NextIntlClientProvider>,
  );
}

const OK: TourRunLocally = {
  state: "ok",
  reason: null,
  steps: [
    { kind: "install", command: "pnpm install", source: "package.json" },
    { kind: "run", command: "docker compose up -d && pnpm dev", source: "README.md" },
  ],
};

describe("RunLocallySection", () => {
  it("AC-30/AC-31/NFR-6b: shows the review notice, inert commands with source labels; copy writes exactly the command", async () => {
    renderSection(OK);

    expect(
      screen.getByText("These commands come from the repository. Review them before running — DevDigest never runs them."),
    ).toBeInTheDocument();
    expect(screen.getByText("from package.json")).toBeInTheDocument();
    expect(screen.getByText("from README.md")).toBeInTheDocument();

    // Commands are plain text in <code>, never actionable controls.
    const code = screen.getByText("docker compose up -d && pnpm dev");
    expect(code.tagName).toBe("CODE");
    expect(code.closest("a, button")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy command: docker compose up -d && pnpm dev" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("docker compose up -d && pnpm dev");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("AC-24: with no commands detected it says 'Not available' with the reason and shows no copy buttons", () => {
    renderSection({ state: "not_available", reason: "no manifest or README fences found", steps: [] });
    expect(screen.getByText("Not available: no manifest or README fences found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy command/ })).toBeNull();
  });
});
