import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { OVERVIEW_STACK_QUERY } from "./constants";
import { useStackedLayout } from "./useStackedLayout";

function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return matches;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  const fn = vi.fn(() => mql);
  vi.stubGlobal("matchMedia", fn);
  return {
    fn,
    set(next: boolean) {
      matches = next;
      listeners.forEach((l) => l());
    },
    listeners,
  };
}

describe("useStackedLayout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useStackedLayout());
    expect(result.current).toBe(false);
  });

  it("follows the media query, re-renders on change and unsubscribes", () => {
    const mm = mockMatchMedia(true);
    const { result, unmount } = renderHook(() => useStackedLayout());
    expect(mm.fn).toHaveBeenCalledWith(OVERVIEW_STACK_QUERY);
    expect(result.current).toBe(true);

    act(() => mm.set(false));
    expect(result.current).toBe(false);

    unmount();
    expect(mm.listeners.size).toBe(0);
  });
});
