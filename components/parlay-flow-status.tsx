"use client";

type ParlayFlowStatusProps = {
  phase: "place" | "settle" | null;
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`parlay-spinner inline-block h-7 w-7 shrink-0 text-[var(--accent)] ${className ?? ""}`}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="55 80"
      />
    </svg>
  );
}

export function ParlayFlowStatus({ phase }: ParlayFlowStatusProps) {
  if (!phase) return null;

  const title =
    phase === "place" ? "Placing your parlay" : "Settling your parlay";
  const subtitle =
    phase === "place"
      ? "Locking in legs and updating bankroll…"
      : "Checking box scores and finalizing results…";

  return (
    <div
      className="parlay-flow-status-enter mb-4 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] px-4 py-4 shadow-lg shadow-black/20"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-start gap-3">
        <Spinner />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-semibold tracking-tight text-[var(--text)]">
            {title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
            {subtitle}
          </p>
          <div className="parlay-flow-progress-track mt-3">
            <div className="parlay-flow-progress-fill" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ParlayButtonSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`parlay-spinner inline h-4 w-4 shrink-0 opacity-90 ${className ?? ""}`}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="42 80"
      />
    </svg>
  );
}
