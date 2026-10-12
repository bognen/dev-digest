import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const post = vi.fn();
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, api: { get: vi.fn(), post: (...a: unknown[]) => post(...a) } };
});

import { useGenerateBrief } from "./brief";

afterEach(() => vi.clearAllMocks());

describe("useGenerateBrief", () => {
  it("posts to the canonical /pulls/:id/brief path with the regenerate flag", async () => {
    post.mockResolvedValue({ status: "generated" });
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useGenerateBrief("p1"), { wrapper });
    result.current.mutate({ regenerate: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/pulls/p1/brief", { regenerate: true });
  });
});
