"use client";

import { useEffect, useState, type ReactNode } from "react";

type CollapseProps = {
  open: boolean;
  children: ReactNode;
  /** Keep content mounted this long after close so the collapse can finish. */
  exitMs?: number;
  className?: string;
};

/**
 * Smooth open/close without layout jump. Uses CSS grid 0fr→1fr so height
 * animates without measuring. Keeps children mounted briefly on close.
 */
export function Collapse({
  open,
  children,
  exitMs = 220,
  className,
}: CollapseProps) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const id = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(id);
  }, [open, exitMs]);

  return (
    <div
      className={`collapse-root ${className ?? ""}`}
      data-open={open ? "true" : "false"}
      aria-hidden={!open}
    >
      <div className="collapse-inner">{mounted ? children : null}</div>
    </div>
  );
}
