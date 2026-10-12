import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const get = vi.fn();
const post = vi.fn();
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } };
});

import { ApiError } from "../api";
import { onboardingTourKeys, useGenerateOnboardingTour, useOnboardingTour } from "./onboarding-tour";

afterEach(() => vi.clearAllMocks());

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const base = { repo: { id: "r1", full_name: "acme/api" }, tour: null, provenance: null, current_index_sha: null, last_failure: null };

describe("useOnboardingTour", () => {
  it("AC-1/AC-2: reads only (GET, never POST) and polls only while status is 'generating'", async () => {
    const { qc, wrapper } = setup();
    get.mockResolvedValue({ ...base, status: "none" });
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/repos/r1/onboarding");
    expect(post).not.toHaveBeenCalled();

    const options = qc.getQueryCache().find({ queryKey: onboardingTourKeys.state("r1") })!.options as {
      refetchInterval: (q: unknown) => unknown;
    };
    const interval = options.refetchInterval;
    const q = (status: string) => ({ state: { data: { status } } });
    expect(interval(q("generating"))).toBeGreaterThan(0);
    for (const s of ["none", "generated", "skeleton"]) expect(interval(q(s))).toBe(false);
  });
});

describe("useGenerateOnboardingTour", () => {
  it("writes the POST result into the state cache; a 409 refreshes (invalidates) the state instead of failing silently", async () => {
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useGenerateOnboardingTour("r1"), { wrapper });

    post.mockResolvedValueOnce({ ...base, status: "generated" });
    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(qc.getQueryData(onboardingTourKeys.state("r1"))).toMatchObject({ status: "generated" }));
    expect(post).toHaveBeenCalledWith("/repos/r1/onboarding/generate", {});

    const invalidate = vi.spyOn(qc, "invalidateQueries");
    post.mockRejectedValueOnce(new ApiError("already running", 409, "generation_in_progress"));
    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: onboardingTourKeys.state("r1") }));
  });
});
