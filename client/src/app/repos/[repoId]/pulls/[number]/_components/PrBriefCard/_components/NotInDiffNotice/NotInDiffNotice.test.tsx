import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { NotInDiffNotice } from "./NotInDiffNotice";

afterEach(cleanup);

function renderNotice(externalHref?: string): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <NotInDiffNotice externalHref={externalHref} />
    </NextIntlClientProvider>,
  );
}

describe("NotInDiffNotice", () => {
  it("AC-5/AC-6: renders the catalogue message as a status, with no link when no externalHref", () => {
    renderNotice();
    expect(screen.getByRole("status")).toHaveTextContent(messages.navigation.notInDiff);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("AC-7: with externalHref renders an Open on GitHub link that opens safely", () => {
    renderNotice("https://github.com/acme/demo/blob/sha/a.ts#L1");
    const link = screen.getByRole("link", { name: messages.navigation.openExternal });
    expect(link).toHaveAttribute("href", "https://github.com/acme/demo/blob/sha/a.ts#L1");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
    expect(link.getAttribute("rel")).toMatch(/noreferrer/);
  });
});
