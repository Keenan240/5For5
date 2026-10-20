"use client";

import { useEffect, useState } from "react";
import type { RiskPreference } from "@/lib/odds";

type RiskSheetProps = {
  open: boolean;
  onPick: (risk: RiskPreference) => void;
  onClose: () => void;
};

const OPTIONS: {
  risk: RiskPreference;
  title: string;
  blurb: string;
}[] = [
  {
    risk: "LOW",
    title: "Low",
    blurb: "Safer real lines with smaller payouts.",
  },
  {
    risk: "MEDIUM",
    title: "Medium",
    blurb: "Balanced lines around -250 to -400.",
  },
  {
    risk: "HIGH",
    title: "High",
    blurb: "Higher payout lines closer to -150 to -300.",
  },
];

export function RiskSheet({ open, onPick, onClose }: RiskSheetProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <button
        type="button"
        className={`absolute inset-0 bg-black/45 transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close risk picker"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="risk-sheet-title"
        className={`relative z-10 w-full max-w-md rounded-t-2xl bg-[var(--bg-card)] px-4 pb-[max(2.75rem,calc(env(safe-area-inset-bottom)+1.75rem))] pt-3 shadow-2xl ring-1 ring-[var(--border)] transition-transform duration-250 ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mb-1 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        </div>
        <h2
          id="risk-sheet-title"
          className="mt-2 text-center text-base font-semibold text-[var(--text)]"
        >
          Risk level
        </h2>
        <p className="mt-1 mb-4 text-center text-xs text-[var(--text-muted)]">
          Sets which milestone lines Suggest 5 picks.
        </p>
        <div className="space-y-2 pb-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.risk}
              type="button"
              onClick={() => onPick(opt.risk)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3.5 text-left active:bg-[var(--bg-inset)]"
            >
              <span>
                <span className="block text-sm font-semibold text-[var(--text)]">
                  {opt.title}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
                  {opt.blurb}
                </span>
              </span>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-white"
                aria-hidden
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
