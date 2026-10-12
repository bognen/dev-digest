import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboardingMessages from "../../../../../../../../../messages/en/onboarding.json";
import { SectionNav } from "./SectionNav";

afterEach(cleanup);

function renderNav(active: Parameters<typeof SectionNav>[0]["active"], onSelect = vi.fn()): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages }}>
      <SectionNav active={active} onSelect={onSelect} />
    </NextIntlClientProvider>,
  );
}

describe("SectionNav", () => {
  it("AC-28/NFR-6a: 'On this page' lists the five sections in fixed order, marks only the active one, and reports selection", () => {
    const onSelect = vi.fn();
    renderNav("reading_path", onSelect);

    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
    expect(nav).toContainElement(links[0]!);

    // Active entry is conveyed programmatically, only on one entry.
    expect(links.filter((l) => l.getAttribute("aria-current") === "true")).toEqual([links[3]]);

    fireEvent.click(screen.getByRole("link", { name: "First tasks" }));
    expect(onSelect).toHaveBeenCalledWith("first_tasks");
  });
});
