"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type DiscoveryInfoModalProps = {
  open: boolean;
  onClose: () => void;
};

export function DiscoveryInfoModal({ open, onClose }: DiscoveryInfoModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="info-modal-root fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <button
        type="button"
        className="info-modal-backdrop absolute inset-0 bg-black/55"
        aria-label="Close information"
        onClick={onClose}
      />
      <div
        className="info-modal-panel relative z-10 max-h-[min(85dvh,520px)] w-full max-w-sm overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-xl ring-1 ring-black/25"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discovery-info-title"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2
            id="discovery-info-title"
            className="text-base font-semibold text-[var(--text)]"
          >
            Discovery guide
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 min-w-9 shrink-0 rounded-lg text-lg leading-none text-[var(--text-muted)] active:bg-[var(--bg-inset)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <section className="mb-4">
          <h3 className="mb-1.5 text-sm font-medium text-[var(--accent)]">
            Ranking
          </h3>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            Each qualifying milestone gets a score from how comfortably the
            player cleared the line in the evaluation window (buffer) and
            estimated odds. Higher scores rank higher. The top five lines by
            score are auto-selected; you can swap picks before placing. A player
            can appear more than once if multiple stats hit 5/5.
          </p>
        </section>

        <section>
          <h3 className="mb-1.5 text-sm font-medium text-[var(--accent)]">
            H2H playoff mode
          </h3>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            Weights performance against tonight&apos;s opponent. Early in a
            series, milestones use last five overall games while H2H history
            adjusts rank. From Game 3 (two prior series games), blend mode
            emphasizes matchup games more. After five playoff meetings vs that
            team, milestones use only those series games. Best for focused
            playoff matchups—not required for a normal full-slate night.
          </p>
        </section>
      </div>
    </div>,
    document.body
  );
}
