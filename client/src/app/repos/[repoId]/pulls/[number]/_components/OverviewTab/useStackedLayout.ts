import { useSyncExternalStore } from "react";
import { OVERVIEW_STACK_QUERY } from "./constants";

function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(OVERVIEW_STACK_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const mql = getMediaQueryList();
  if (!mql) return () => {};
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return getMediaQueryList()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True when the viewport is narrower than 768px (stack the Overview grid). */
export function useStackedLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
