"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect, type ReactNode } from "react";

function scrollableAncestor(node: EventTarget | null): HTMLElement | null {
  let el = node instanceof Element ? node : null;
  while (el && el !== document.documentElement) {
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    if (
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el as HTMLElement;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Make the shell feel app-like: no rubber-band bounce when pulling past the
 * top/bottom of the page. Nested scrollers (bottom sheet, lists) still work.
 */
function useAppLikeScroll() {
  useEffect(() => {
    let lastTouchY = 0;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        lastTouchY = e.touches[0]!.clientY;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const touchY = e.touches[0]!.clientY;
      const dy = touchY - lastTouchY;
      lastTouchY = touchY;

      const nested = scrollableAncestor(e.target);
      if (nested) {
        const atTop = nested.scrollTop <= 0;
        const atBottom =
          nested.scrollTop + nested.clientHeight >= nested.scrollHeight - 1;
        // Allow the nested scroller to move; only block chaining past its edge.
        if (!((atTop && dy > 0) || (atBottom && dy < 0))) return;
      }

      const root = document.scrollingElement ?? document.documentElement;
      const atTop = root.scrollTop <= 0;
      const atBottom =
        root.scrollTop + root.clientHeight >= root.scrollHeight - 1;

      if ((atTop && dy > 0) || (atBottom && dy < 0)) {
        e.preventDefault();
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  useAppLikeScroll();
  return <SessionProvider>{children}</SessionProvider>;
}
