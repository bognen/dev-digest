import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingSectionState } from "@devdigest/shared";
import onboardingMessages from "../../../../../../../../../messages/en/onboarding.json";
import { TourSectionCard } from "./TourSectionCard";

afterEach(cleanup);

function renderCard(state: OnboardingSectionState, reason: string | null): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages }}>
      <TourSectionCard sectionKey="architecture" state={state} reason={reason}>
        <p>child content</p>
      </TourSectionCard>
    </NextIntlClientProvider>,
  );
}

describe("TourSectionCard", () => {
  it("AC-25: ok renders children; requires_generation renders the note first, then children", () => {
    renderCard("ok", null);
    expect(screen.getByText("child content")).toBeInTheDocument();
    expect(screen.queryByText("Requires generation")).toBeNull();
    cleanup();

    renderCard("requires_generation", null);
    const note = screen.getByText("Requires generation");
    const child = screen.getByText("child content");
    expect(note.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC-24: not_available shows the reason (or a generic label) and no children", () => {
    renderCard("not_available", "no import graph");
    expect(screen.getByText("Not available: no import graph")).toBeInTheDocument();
    expect(screen.queryByText("child content")).toBeNull();
    cleanup();

    renderCard("not_available", null);
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.queryByText("child content")).toBeNull();
  });
});
