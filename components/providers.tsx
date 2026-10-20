"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect, type ReactNode } from "react";

function isScrollableY(el: HTMLElement, style: CSSStyleDeclaration): boolean {
  const oy = style.overflowY;
  return (
    (oy === "auto" || oy === "scroll" || oy === "overlay") &&
    el.scrollHeight > el.clientHeight + 1
  );
}

function isScrollableX(el: HTMLElement, style: CSSStyleDeclaration): boolean {
  const ox = style.overflowX;
  return (
    (ox === "auto" || ox === "scroll" || ox === "overlay") &&
    el.scrollWidth > el.clientWidth + 1
  );
}

/** Nearest ancestor that scrolls vertically. */
function verticalScrollableAncestor(
  node: EventTarget | null
): HTMLElement | null {
  let el = node instanceof Element ? node : null;
  while (el && el !== document.documentElement) {
    const style = getComputedStyle(el);
    if (isScrollableY(el as HTMLElement, style)) return el as HTMLElement;
    el = el.parentElement;
  }
  return null;
}

/** True when the touch started inside a horizontally scrollable region. */
function hasHorizontalScrollAncestor(node: EventTarget | null): boolean {
  let el = node instanceof Element ? node : null;
  while (el && el !== document.documentElement) {
    const style = getComputedStyle(el);
    if (isScrollableX(el as HTMLElement, style)) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Make the shell feel app-like: no rubber-band bounce when pulling past the
 * top/bottom of the page. Nested scrollers (bottom sheet, lists, date strip)
 * still work.
 */
function useAppLikeScroll() {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    /** Locked for the whole gesture so a tiny vertical wobble can't cancel a horizontal pan. */
    let axis: "x" | "y" | null = null;
    let startedInHScroll = false;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      startX = t.clientX;
      startY = t.clientY;
      lastY = t.clientY;
      axis = null;
      startedInHScroll = hasHorizontalScrollAncestor(e.target);
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const totalDx = t.clientX - startX;
      const totalDy = t.clientY - startY;
      const frameDy = t.clientY - lastY;
      lastY = t.clientY;

      // Decide axis once the finger has moved enough.
      if (axis === null && (Math.abs(totalDx) > 8 || Math.abs(totalDy) > 8)) {
        axis = Math.abs(totalDx) >= Math.abs(totalDy) ? "x" : "y";
      }

      // Horizontal pans (date strip, chips) — never block for this gesture.
      if (startedInHScroll || axis === "x") return;

      const nested = verticalScrollableAncestor(e.target);
      if (nested) {
        const atTop = nested.scrollTop <= 0;
        const atBottom =
          nested.scrollTop + nested.clientHeight >= nested.scrollHeight - 1;
        if (!((atTop && frameDy > 0) || (atBottom && frameDy < 0))) return;
      }

      const root = document.scrollingElement ?? document.documentElement;
      const atTop = root.scrollTop <= 0;
      const atBottom =
        root.scrollTop + root.clientHeight >= root.scrollHeight - 1;

      if ((atTop && frameDy > 0) || (atBottom && frameDy < 0)) {
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
