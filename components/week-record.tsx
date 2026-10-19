"use client";

import type { WeekDayResult } from "@/lib/week-record";

type WeekRecordProps = {
  days: WeekDayResult[];
  lifetime?: { wins: number; losses: number } | null;
  onOpenHistory?: () => void;
};

export function WeekRecord({
  days,
  lifetime,
  onOpenHistory,
}: WeekRecordProps) {
  return (
    <section className="mb-4 rounded-2xl bg-[var(--surface)] px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text)]">Week W/L</p>
        {lifetime && (
          <p className="text-xs text-[var(--text-muted)]">
            All-time {lifetime.wins}–{lifetime.losses}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-1.5">
        {days.map((day) => (
          <div key={day.ymd} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium text-[var(--text-subtle)]">
              {day.label}
            </span>
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold ${
                day.result === "win"
                  ? "bg-green-500/20 text-green-600 ring-1 ring-green-500/40"
                  : day.result === "loss"
                    ? "bg-red-500/15 text-red-500 ring-1 ring-red-500/35"
                    : "bg-[var(--surface-muted)] text-transparent ring-1 ring-[var(--border)]"
              }`}
              title={
                day.result
                  ? `${day.ymd}: ${day.result}`
                  : `${day.ymd}: no parlay`
              }
              aria-label={
                day.result
                  ? `${day.label} ${day.result}`
                  : `${day.label} empty`
              }
            >
              {day.result === "win" ? "W" : day.result === "loss" ? "L" : "·"}
            </span>
          </div>
        ))}
      </div>
      {onOpenHistory && (
        <button
          type="button"
          onClick={onOpenHistory}
          className="mt-3 text-xs font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
        >
          View results
        </button>
      )}
    </section>
  );
}
