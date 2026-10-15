/* useModalFocus — focus moves into the dialog on open, Escape closes it, and focus returns to
   the opener on close. Kept here because the shared `Modal` is not modified for this feature. */
"use client";

import { useEffect, useRef, type RefObject } from "react";

export function useModalFocus(root: RefObject<HTMLElement | null>, onEscape: () => void) {
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = root.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) {
      dialog.tabIndex = -1;
      dialog.style.outline = "none";
      dialog.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      escape.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [root]);
}
