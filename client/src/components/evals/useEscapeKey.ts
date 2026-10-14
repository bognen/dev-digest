/* useEscapeKey — close an eval dialog on Esc (NFR-7). The kit Modal has no key handling. */
"use client";

import React from "react";

export function useEscapeKey(onEscape: () => void, enabled = true) {
  const ref = React.useRef(onEscape);
  ref.current = onEscape;
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
