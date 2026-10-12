"use client";

import React from "react";
import { SCROLL_SPY_ROOT_MARGIN, SECTION_ORDER, type SectionKey } from "../constants";
import { sectionId } from "../helpers";

/**
 * Scroll-spy for the "On this page" nav (AC-28). Uses IntersectionObserver when present;
 * without it the nav still works click-only (select sets the active entry directly).
 * `enabled` is false while no section cards are mounted.
 */
export function useActiveSection(enabled: boolean) {
  const [active, setActive] = React.useState<SectionKey>(SECTION_ORDER[0]);

  React.useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = SECTION_ORDER.find((k) => sectionId(k) === entry.target.id);
          if (key) setActive(key);
        }
      },
      { rootMargin: SCROLL_SPY_ROOT_MARGIN },
    );
    for (const key of SECTION_ORDER) {
      const el = document.getElementById(sectionId(key));
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [enabled]);

  const select = React.useCallback((key: SectionKey) => {
    setActive(key);
    document.getElementById(sectionId(key))?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, []);

  return { active, select };
}
