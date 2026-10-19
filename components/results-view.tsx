"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { STAKE_DENOMINATIONS, stakeTierLabel } from "@/lib/odds";
import type { PendingParlay, SettledParlay } from "@/lib/types";

type ResultsViewProps = {
  net: number;
  history: SettledParlay[];
  pending?: PendingParlay[];
  pendingSection?: ReactNode;
  children?: ReactNode;
};

function formatNet(n: number): string {
  const abs = Math.abs(n).toFixed(2);
  if (n > 0) return `+$${abs}`;
  if (n < 0) return `-$${abs}`;
  return "$0.00";
}

export function ResultsView({
  net,
  history,
  pending = [],
  pendingSection,
  children,
}: ResultsViewProps) {
  const [stakeInfoOpen, setStakeInfoOpen] = useState(false);
  const netTone =
    net > 0
      ? "text-emerald-600"
      : net < 0
        ? "text-red-600"
        : "text-[var(--text)]";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-[var(--surface)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">
              Net
            </p>
            <p
              className={`mt-1 text-3xl font-semibold tracking-tight ${netTone}`}
            >
              {formatNet(net)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStakeInfoOpen(true)}
            aria-label="Stake denominations info"
            className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[10px] font-medium leading-none text-[var(--text-faint)] active:bg-[var(--bg-inset)]"
          >
            i
          </button>
        </div>
      </section>

      {pending.length > 0 && (
        <section>
          <p className="mb-2 px-1 text-sm font-semibold text-[var(--text)]">
            Pending
          </p>
          {pendingSection}
        </section>
      )}

      <section>
        <p className="mb-2 px-1 text-sm font-semibold text-[var(--text)]">
          Results
        </p>
        {history.length === 0 ? (
          <p className="rounded-2xl bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
            No settled parlays yet.
          </p>
        ) : (
          children
        )}
      </section>

      <StakeInfoModal
        open={stakeInfoOpen}
        onClose={() => setStakeInfoOpen(false)}
      />
    </div>
  );
}

function StakeInfoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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
        aria-label="Close stake info"
        onClick={onClose}
      />
      <div
        className="info-modal-panel relative z-10 w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-xl ring-1 ring-black/25"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stake-info-title"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2
            id="stake-info-title"
            className="text-base font-semibold text-[var(--text)]"
          >
            Stake denominations
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
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">
          Bets lock in at $2, $5, or $10. Suggest 5 asks for your risk level
          first — low risk recommends $10, medium $5, high risk $2.
        </p>
        <div className="mt-3 flex gap-2">
          {STAKE_DENOMINATIONS.map((d) => (
            <span
              key={d}
              className="rounded-full border border-[var(--border-strong)] bg-white px-3.5 py-1.5 text-xs font-semibold text-[var(--text)]"
            >
              ${d}
            </span>
          ))}
        </div>
        <ul className="mt-3 space-y-1 text-[11px] text-[var(--text-subtle)]">
          {STAKE_DENOMINATIONS.map((d) => (
            <li key={`hint-${d}`}>{stakeTierLabel(d)}</li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
