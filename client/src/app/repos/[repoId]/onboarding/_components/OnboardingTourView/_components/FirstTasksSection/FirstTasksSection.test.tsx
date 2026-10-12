import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { TourFirstTasks } from "@devdigest/shared";
import onboardingMessages from "../../../../../../../../../messages/en/onboarding.json";
import { FirstTasksSection } from "./FirstTasksSection";

afterEach(cleanup);

function renderSection(section: TourFirstTasks): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages }}>
      <FirstTasksSection section={section} fullName="acme/api" sha="abc1234" transformHref={() => null} />
    </NextIntlClientProvider>,
  );
}

describe("FirstTasksSection", () => {
  it("AC-25: requires_generation with no items shows just the note (no list, no task headings)", () => {
    renderSection({ state: "requires_generation", reason: null, items: [] });
    expect(screen.getByText("Requires generation")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  it("an ok section lists its tasks with titles", () => {
    renderSection({
      state: "ok",
      reason: null,
      items: [
        { title: "Add a payments test", rationale: "Covers the route.", files: ["src/pay.ts"] },
        { title: "Fix the docs", rationale: "Stale.", files: [] },
      ],
    });
    expect(screen.getByRole("heading", { level: 3, name: "Add a payments test" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Fix the docs" })).toBeInTheDocument();
    expect(screen.getByText("src/pay.ts")).toBeInTheDocument();
    expect(screen.queryByText("Requires generation")).toBeNull();
  });
});
