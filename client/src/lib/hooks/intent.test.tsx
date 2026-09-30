import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const get = vi.fn();
const post = vi.fn();
vi.mock("../api", () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

import { usePrIntent } from "./intent";

afterEach(() => vi.clearAllMocks());

describe("usePrIntent", () => {
  it("only reads the cached intent — a 'not_generated' response never triggers a derive (POST)", async () => {
    get.mockResolvedValue({ intent: null, unavailable_reason: "not_generated" });
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePrIntent("pr-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/pulls/pr-1/intent");
    expect(post).not.toHaveBeenCalled();
  });
});
