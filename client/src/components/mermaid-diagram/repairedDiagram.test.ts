import { describe, it, expect } from "vitest";
import mermaid from "mermaid";

// Literal copy of what the server's repairDiagramLines() produces for the stored
// one-line diagram (not imported: packages are standalone). Guards that the repair
// output is actually parseable by the real mermaid used by the client.
const REPAIRED = [
  "flowchart LR",
  "  A[Client] --> B[Express]",
  "  B --> C[Kernel Middleware]",
  "  C --> D[Routes]",
  "  D --> E[Web Controllers]",
  "  D --> F[API Controllers]",
  "  E --> G[Views]",
  "  F --> H[JSON Response]",
  "  E --> I[User Model]",
  "  F --> I",
  "  I --> J[MongoDB]",
  "  B --> K[Passport]",
  "  K --> L[Local/Google/Twitter]",
  "  B --> M[Queue]",
  "  M --> N[Redis]",
].join("\n");

const ONE_LINE = REPAIRED.split("\n").map((l) => l.trim()).join(" ");

describe("repaired onboarding diagram", () => {
  it("AC-19: the repaired multiline text parses with mermaid, while the original one-liner does not", async () => {
    expect(await mermaid.parse(REPAIRED, { suppressErrors: true })).toBeTruthy();
    expect(await mermaid.parse(ONE_LINE, { suppressErrors: true })).toBeFalsy();
  });
});
