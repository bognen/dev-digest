import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Markdown } from "./Markdown";

afterEach(cleanup);

const SOURCE =
  "[good](src/app.ts) [bad](javascript:alert(1)) [ext](https://evil.example/x) <script>window.__pwned = 1</script> <b>raw</b>";

const policy = (href: string): string | null =>
  href === "src/app.ts" ? "https://github.com/acme/api/blob/abc1234/src/app.ts" : null;

describe("Markdown", () => {
  it("AC-35: with transformHref only allowed hrefs become new-tab noopener anchors; others are plain text; raw HTML is inert", () => {
    const { container } = render(<Markdown transformHref={policy}>{SOURCE}</Markdown>);

    const good = screen.getByRole("link", { name: "good" });
    expect(good).toHaveAttribute("href", "https://github.com/acme/api/blob/abc1234/src/app.ts");
    expect(good).toHaveAttribute("target", "_blank");
    expect(good.getAttribute("rel")).toContain("noopener");

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("bad")).toBeInTheDocument();
    expect(screen.getByText("ext")).toBeInTheDocument();

    // No raw HTML: nothing parsed into elements, nothing executed.
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("without transformHref links render as before (no forced new tab) and empty input renders nothing", () => {
    const { container, rerender } = render(<Markdown>{"[docs](https://example.com/docs)"}</Markdown>);
    const a = screen.getByRole("link", { name: "docs" });
    expect(a).toHaveAttribute("href", "https://example.com/docs");
    expect(a).not.toHaveAttribute("target");

    rerender(<Markdown>{null}</Markdown>);
    expect(container).toBeEmptyDOMElement();
  });
});
